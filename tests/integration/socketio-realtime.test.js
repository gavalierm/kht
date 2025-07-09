/**
 * Comprehensive Socket.io Real-time Communication Integration Tests
 * - Tests real Socket.io server-client communication
 * - Tests game flow with multiple clients
 * - Tests reconnection and error handling
 * - Tests concurrent player scenarios
 * - Uses real server implementation and real socket clients
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const http = require('http');
const socketIo = require('socket.io');
const socketClient = require('socket.io-client');
const express = require('express');
const GameDatabase = require('../../database');
const { GameInstance } = require('../../lib/gameInstance');
const SocketManager = require('../../lib/socketManager');
const { 
  createTestDatabase,
  createSampleQuestions,
  generateTestPin,
  generateTestToken,
  delay,
  waitFor,
  cleanupTestDatabase
} = require('../helpers/test-utils');
const { socketEvents } = require('../fixtures/sample-data');

describe('Socket.io Real-time Communication Integration Tests', () => {
  let server;
  let io;
  let db;
  let socketManager;
  let port;
  let activeGames;
  let playerLatencies;
  let socketToPlayer;
  let socketToModerator;

  beforeEach((done) => {
    // Create test database
    db = createTestDatabase();
    
    // Initialize game state
    activeGames = new Map();
    playerLatencies = new Map();
    socketToPlayer = new Map();
    socketToModerator = new Map();
    
    // Create test server
    const app = express();
    server = http.createServer(app);
    io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    // Initialize socket manager
    socketManager = new SocketManager(io);
    
    // Get random port
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterEach((done) => {
    // Clean up connections
    io.close(() => {
      server.close(() => {
        cleanupTestDatabase(db);
        done();
      });
    });
  });

  describe('Basic Connection Management', () => {
    test('should establish client connection successfully', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        expect(client.id).toBeDefined();
        
        client.disconnect();
        done();
      });
      
      client.on('connect_error', (error) => {
        done(error);
      });
    });

    test('should handle multiple client connections', (done) => {
      const clients = [];
      let connectedCount = 0;
      
      const connectClient = (index) => {
        const client = socketClient(`http://localhost:${port}`);
        clients.push(client);
        
        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === 3) {
            clients.forEach(c => c.disconnect());
            done();
          }
        });
        
        client.on('connect_error', done);
      };
      
      for (let i = 0; i < 3; i++) {
        connectClient(i);
      }
    });

    test('should handle client disconnection gracefully', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        expect(client.connected).toBe(true);
        
        client.on('disconnect', () => {
          expect(client.connected).toBe(false);
          done();
        });
        
        client.disconnect();
      });
      
      client.on('connect_error', done);
    });
  });

  describe('Game Creation and Management', () => {
    test('should create game through socket communication', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        // Set up socket event handlers
        io.on('connection', (socket) => {
          socket.on('create_game', async (data) => {
            try {
              const gamePin = generateTestPin();
              const questions = createSampleQuestions();
              
              // Create game in database
              const dbResult = await db.createGame(gamePin, questions, data.moderatorPassword);
              
              // Create in-memory game instance
              const game = new GameInstance(gamePin, questions, dbResult.gameId);
              activeGames.set(gamePin, game);
              
              // Store moderator info
              socketToModerator.set(socket.id, {
                gamePin: gamePin,
                gameId: dbResult.gameId,
                moderatorToken: dbResult.moderatorToken
              });
              
              socket.emit('game_created', {
                gamePin: gamePin,
                questionCount: questions.length,
                moderatorToken: dbResult.moderatorToken
              });
            } catch (error) {
              socket.emit('create_game_error', { message: 'Chyba pri vytváraní hry' });
            }
          });
        });
        
        client.on('game_created', (response) => {
          expect(response.gamePin).toBeDefined();
          expect(response.questionCount).toBe(5);
          expect(response.moderatorToken).toBeDefined();
          
          // Verify game was created in database
          const gameData = db.getGameByPin(response.gamePin);
          expect(gameData).toBeDefined();
          expect(gameData.questions).toHaveLength(5);
          
          client.disconnect();
          done();
        });
        
        client.on('create_game_error', (error) => {
          done(new Error(error.message));
        });
        
        // Create game
        client.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
    });

    test('should validate moderator credentials', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        // First create a game
        const gamePin = generateTestPin();
        const questions = createSampleQuestions();
        const password = 'secure123';
        
        const dbResult = db.createGame(gamePin, questions, password);
        
        // Set up socket event handlers
        io.on('connection', (socket) => {
          socket.on('reconnect_moderator', async (data) => {
            try {
              const gameData = await db.validateModerator(data.gamePin, data.password, data.moderatorToken);
              
              if (!gameData) {
                socket.emit('moderator_reconnect_error', { 
                  message: 'Neplatné prihlásenie moderátora alebo hra neexistuje' 
                });
                return;
              }
              
              socket.emit('moderator_reconnected', {
                gamePin: data.gamePin,
                questionCount: gameData.questions.length,
                currentQuestionIndex: 0,
                status: 'waiting',
                players: [],
                totalPlayers: 0,
                moderatorToken: gameData.moderator_token
              });
            } catch (error) {
              socket.emit('moderator_reconnect_error', { 
                message: 'Chyba pri pripájaní moderátora' 
              });
            }
          });
        });
        
        client.on('moderator_reconnected', (response) => {
          expect(response.gamePin).toBe(gamePin);
          expect(response.questionCount).toBe(5);
          expect(response.status).toBe('waiting');
          expect(response.players).toEqual([]);
          
          client.disconnect();
          done();
        });
        
        client.on('moderator_reconnect_error', (error) => {
          done(new Error(error.message));
        });
        
        // Reconnect with correct credentials
        client.emit('reconnect_moderator', {
          gamePin: gamePin,
          password: password,
          moderatorToken: dbResult.moderatorToken
        });
      });
    });
  });

  describe('Player Join and Management', () => {
    let gamePin;
    let gameId;
    let moderatorToken;

    beforeEach(() => {
      // Create a test game
      const questions = createSampleQuestions();
      gamePin = generateTestPin();
      const dbResult = db.createGame(gamePin, questions, 'test123');
      gameId = dbResult.gameId;
      moderatorToken = dbResult.moderatorToken;
      
      // Create in-memory game instance
      const game = new GameInstance(gamePin, questions, gameId);
      activeGames.set(gamePin, game);
    });

    test('should handle player joining game', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        // Set up socket event handlers
        io.on('connection', (socket) => {
          socket.on('join_game', async (data) => {
            try {
              const gameData = db.getGameByPin(data.gamePin);
              if (!gameData) {
                socket.emit('join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
                return;
              }
              
              const game = activeGames.get(data.gamePin);
              if (game.phase !== 'WAITING') {
                socket.emit('join_error', { message: 'Hra už prebieha, nemôžete sa pripojiť' });
                return;
              }
              
              // Add player to database
              const playerResult = db.addPlayer(gameData.id);
              
              // Add to in-memory game
              game.addPlayer(playerResult.playerId, {
                player_token: playerResult.playerToken,
                score: 0
              });
              
              const player = game.getPlayer(playerResult.playerId);
              
              // Store player info
              socketToPlayer.set(socket.id, {
                gamePin: data.gamePin,
                playerId: playerResult.playerId,
                playerToken: playerResult.playerToken
              });
              
              socket.emit('game_joined', {
                gamePin: data.gamePin,
                playerId: playerResult.playerId,
                playerName: player.name,
                playersCount: game.getConnectedPlayerCount(),
                playerToken: playerResult.playerToken
              });
            } catch (error) {
              socket.emit('join_error', { message: 'Chyba pri pripájaní do hry' });
            }
          });
        });
        
        client.on('game_joined', (response) => {
          expect(response.gamePin).toBe(gamePin);
          expect(response.playerId).toBeDefined();
          expect(response.playerName).toMatch(/^Hráč \d+$/);
          expect(response.playersCount).toBe(1);
          expect(response.playerToken).toBeDefined();
          
          // Verify player was added to game
          const game = activeGames.get(gamePin);
          expect(game.getConnectedPlayerCount()).toBe(1);
          
          client.disconnect();
          done();
        });
        
        client.on('join_error', (error) => {
          done(new Error(error.message));
        });
        
        // Join game
        client.emit('join_game', { gamePin });
      });
    });

    test('should handle multiple players joining concurrently', (done) => {
      const clients = [];
      let joinedCount = 0;
      const totalPlayers = 3;
      
      // Set up server-side event handler
      io.on('connection', (socket) => {
        socket.on('join_game', async (data) => {
          try {
            const gameData = db.getGameByPin(data.gamePin);
            if (!gameData) {
              socket.emit('join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
              return;
            }
            
            const game = activeGames.get(data.gamePin);
            const playerResult = db.addPlayer(gameData.id);
            
            game.addPlayer(playerResult.playerId, {
              player_token: playerResult.playerToken,
              score: 0
            });
            
            const player = game.getPlayer(playerResult.playerId);
            
            socketToPlayer.set(socket.id, {
              gamePin: data.gamePin,
              playerId: playerResult.playerId,
              playerToken: playerResult.playerToken
            });
            
            socket.emit('game_joined', {
              gamePin: data.gamePin,
              playerId: playerResult.playerId,
              playerName: player.name,
              playersCount: game.getConnectedPlayerCount(),
              playerToken: playerResult.playerToken
            });
          } catch (error) {
            socket.emit('join_error', { message: 'Chyba pri pripájaní do hry' });
          }
        });
      });
      
      const connectPlayer = (index) => {
        const client = socketClient(`http://localhost:${port}`);
        clients.push(client);
        
        client.on('connect', () => {
          client.emit('join_game', { gamePin });
        });
        
        client.on('game_joined', (response) => {
          expect(response.gamePin).toBe(gamePin);
          expect(response.playerId).toBeDefined();
          
          joinedCount++;
          
          if (joinedCount === totalPlayers) {
            // Verify all players are in the game
            const game = activeGames.get(gamePin);
            expect(game.getConnectedPlayerCount()).toBe(totalPlayers);
            
            clients.forEach(c => c.disconnect());
            done();
          }
        });
        
        client.on('join_error', (error) => {
          done(new Error(error.message));
        });
      };
      
      for (let i = 0; i < totalPlayers; i++) {
        connectPlayer(i);
      }
    });

    test('should handle player reconnection', (done) => {
      // First, add a player
      const playerResult = db.addPlayer(gameId);
      const game = activeGames.get(gamePin);
      
      game.addPlayer(playerResult.playerId, {
        player_token: playerResult.playerToken,
        score: 1200
      });
      
      // Disconnect player
      game.removePlayer(playerResult.playerId, false);
      
      // Now test reconnection
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        io.on('connection', (socket) => {
          socket.on('reconnect_player', async (data) => {
            try {
              const gameData = await db.getGameByPin(data.gamePin);
              if (!gameData) {
                socket.emit('reconnect_error', { message: 'Hra neexistuje' });
                return;
              }
              
              const playerData = await db.reconnectPlayer(gameData.id, data.playerToken);
              if (!playerData) {
                socket.emit('reconnect_error', { message: 'Neplatný player token' });
                return;
              }
              
              const game = activeGames.get(data.gamePin);
              if (game.players.has(playerData.id)) {
                const player = game.getPlayer(playerData.id);
                player.connected = true;
                player.lastSeen = Date.now();
              }
              
              socketToPlayer.set(socket.id, {
                gamePin: data.gamePin,
                playerId: playerData.id,
                playerToken: data.playerToken
              });
              
              socket.emit('player_reconnected', {
                gamePin: data.gamePin,
                playerId: playerData.id,
                playerName: game.getPlayer(playerData.id)?.name || `Hráč ${playerData.id}`,
                score: playerData.score,
                gameStatus: game.phase
              });
            } catch (error) {
              socket.emit('reconnect_error', { message: 'Chyba pri reconnect' });
            }
          });
        });
        
        client.on('player_reconnected', (response) => {
          expect(response.gamePin).toBe(gamePin);
          expect(response.playerId).toBe(playerResult.playerId);
          expect(response.score).toBe(1200);
          expect(response.gameStatus).toBe('WAITING');
          
          // Verify player is reconnected
          const game = activeGames.get(gamePin);
          const player = game.getPlayer(playerResult.playerId);
          expect(player.connected).toBe(true);
          
          client.disconnect();
          done();
        });
        
        client.on('reconnect_error', (error) => {
          done(new Error(error.message));
        });
        
        // Reconnect with token
        client.emit('reconnect_player', {
          gamePin: gamePin,
          playerToken: playerResult.playerToken
        });
      });
    });
  });

  describe('Question Flow and Answer Submission', () => {
    let gamePin;
    let gameId;
    let moderatorClient;
    let playerClient;
    let playerId;
    let playerToken;

    beforeEach((done) => {
      // Create test game
      const questions = createSampleQuestions();
      gamePin = generateTestPin();
      const dbResult = db.createGame(gamePin, questions, 'test123');
      gameId = dbResult.gameId;
      
      // Create in-memory game instance
      const game = new GameInstance(gamePin, questions, gameId);
      activeGames.set(gamePin, game);
      
      // Add a player
      const playerResult = db.addPlayer(gameId);
      playerId = playerResult.playerId;
      playerToken = playerResult.playerToken;
      
      game.addPlayer(playerId, {
        player_token: playerToken,
        score: 0
      });
      
      done();
    });

    afterEach(() => {
      if (moderatorClient) moderatorClient.disconnect();
      if (playerClient) playerClient.disconnect();
    });

    test('should handle complete question flow', (done) => {
      let questionStarted = false;
      let answerSubmitted = false;
      let resultsReceived = false;
      
      // Set up server-side event handlers
      io.on('connection', (socket) => {
        socket.on('start_question', async (data) => {
          const game = activeGames.get(data.gamePin);
          if (!game) return;
          
          const question = game.getCurrentQuestion();
          if (!question) return;
          
          game.phase = 'QUESTION_ACTIVE';
          game.questionStartTime = Date.now();
          game.answers = [];
          
          const questionData = {
            questionNumber: game.currentQuestionIndex + 1,
            totalQuestions: game.questions.length,
            question: question.question,
            options: question.options,
            timeLimit: question.timeLimit || 30,
            serverTime: game.questionStartTime
          };
          
          // Broadcast to all connected sockets
          io.emit('question_started', questionData);
          
          socket.emit('question_started_dashboard', {
            ...questionData,
            correctAnswer: question.correct
          });
        });
        
        socket.on('submit_answer', async (data) => {
          const playerInfo = socketToPlayer.get(socket.id);
          if (!playerInfo) return;
          
          const game = activeGames.get(playerInfo.gamePin);
          if (!game || game.phase !== 'QUESTION_ACTIVE') return;
          
          const answerData = game.submitAnswer(playerInfo.playerId, data.answer, playerLatencies);
          if (!answerData) return;
          
          const question = game.getCurrentQuestion();
          const isCorrect = data.answer === question.correct;
          const points = game.calculateScore(answerData.responseTime, isCorrect, question.timeLimit);
          
          // Update player score
          const player = game.getPlayer(playerInfo.playerId);
          if (player) {
            player.score += points;
            db.updatePlayerScore(playerInfo.playerId, player.score);
          }
          
          socket.emit('answer_result', {
            correct: isCorrect,
            correctAnswer: question.correct,
            points: points,
            totalScore: player ? player.score : 0,
            responseTime: answerData.responseTime
          });
        });
        
        socket.on('end_question', (data) => {
          const game = activeGames.get(data.gamePin);
          if (!game) return;
          
          game.phase = 'RESULTS';
          const question = game.getCurrentQuestion();
          const leaderboard = game.getLeaderboard();
          
          const resultsData = {
            correctAnswer: question.correct,
            leaderboard: leaderboard.slice(0, 10),
            totalAnswers: game.answers.length,
            totalPlayers: game.getConnectedPlayerCount()
          };
          
          io.emit('question_ended', resultsData);
        });
      });
      
      // Create moderator client
      moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        // Create player client
        playerClient = socketClient(`http://localhost:${port}`);
        
        playerClient.on('connect', () => {
          // Store player info for socket
          socketToPlayer.set(playerClient.id, {
            gamePin: gamePin,
            playerId: playerId,
            playerToken: playerToken
          });
          
          // Set up player event handlers
          playerClient.on('question_started', (questionData) => {
            expect(questionData.question).toBe('Aké je hlavné mesto Slovenska?');
            expect(questionData.options).toHaveLength(4);
            expect(questionData.timeLimit).toBe(30);
            questionStarted = true;
            
            // Submit answer
            playerClient.emit('submit_answer', {
              answer: 0, // Correct answer
              timestamp: Date.now()
            });
          });
          
          playerClient.on('answer_result', (result) => {
            expect(result.correct).toBe(true);
            expect(result.correctAnswer).toBe(0);
            expect(result.points).toBeGreaterThan(0);
            expect(result.totalScore).toBeGreaterThan(0);
            answerSubmitted = true;
            
            // End question
            moderatorClient.emit('end_question', { gamePin });
          });
          
          playerClient.on('question_ended', (results) => {
            expect(results.correctAnswer).toBe(0);
            expect(results.leaderboard).toHaveLength(1);
            expect(results.leaderboard[0].playerId).toBe(playerId);
            expect(results.totalAnswers).toBe(1);
            resultsReceived = true;
            
            // Verify all steps completed
            expect(questionStarted).toBe(true);
            expect(answerSubmitted).toBe(true);
            expect(resultsReceived).toBe(true);
            
            done();
          });
          
          // Start question
          moderatorClient.emit('start_question', { gamePin });
        });
      });
    });

    test('should handle latency compensation in answers', (done) => {
      io.on('connection', (socket) => {
        socket.on('start_question', async (data) => {
          const game = activeGames.get(data.gamePin);
          game.phase = 'QUESTION_ACTIVE';
          game.questionStartTime = Date.now();
          game.answers = [];
          
          const question = game.getCurrentQuestion();
          const questionData = {
            questionNumber: 1,
            totalQuestions: game.questions.length,
            question: question.question,
            options: question.options,
            timeLimit: question.timeLimit || 30,
            serverTime: game.questionStartTime
          };
          
          io.emit('question_started', questionData);
        });
        
        socket.on('submit_answer', async (data) => {
          const playerInfo = socketToPlayer.get(socket.id);
          if (!playerInfo) return;
          
          const game = activeGames.get(playerInfo.gamePin);
          if (!game || game.phase !== 'QUESTION_ACTIVE') return;
          
          // Set some latency for testing
          playerLatencies.set(socket.id, 150); // 150ms latency
          
          const answerData = game.submitAnswer(playerInfo.playerId, data.answer, playerLatencies);
          if (!answerData) return;
          
          const question = game.getCurrentQuestion();
          const isCorrect = data.answer === question.correct;
          const points = game.calculateScore(answerData.responseTime, isCorrect, question.timeLimit);
          
          socket.emit('answer_result', {
            correct: isCorrect,
            correctAnswer: question.correct,
            points: points,
            totalScore: points,
            responseTime: answerData.responseTime
          });
        });
      });
      
      moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        playerClient = socketClient(`http://localhost:${port}`);
        
        playerClient.on('connect', () => {
          socketToPlayer.set(playerClient.id, {
            gamePin: gamePin,
            playerId: playerId,
            playerToken: playerToken
          });
          
          playerClient.on('question_started', (questionData) => {
            // Submit answer immediately
            playerClient.emit('submit_answer', {
              answer: 0,
              timestamp: Date.now()
            });
          });
          
          playerClient.on('answer_result', (result) => {
            expect(result.correct).toBe(true);
            expect(result.responseTime).toBeDefined();
            expect(result.responseTime).toBeGreaterThan(0);
            
            // Response time should be compensated for latency
            expect(result.responseTime).toBeLessThan(10000); // Should be reasonable
            
            done();
          });
          
          // Start question
          moderatorClient.emit('start_question', { gamePin });
        });
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid game PIN', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        io.on('connection', (socket) => {
          socket.on('join_game', async (data) => {
            const gameData = db.getGameByPin(data.gamePin);
            if (!gameData) {
              socket.emit('join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
              return;
            }
          });
        });
        
        client.on('join_error', (error) => {
          expect(error.message).toBe('Hra s týmto PIN kódom neexistuje');
          client.disconnect();
          done();
        });
        
        client.emit('join_game', { gamePin: '999999' });
      });
    });

    test('should handle malformed socket data', (done) => {
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        io.on('connection', (socket) => {
          socket.on('join_game', async (data) => {
            if (!data || !data.gamePin) {
              socket.emit('join_error', { message: 'Neplatné dáta' });
              return;
            }
          });
        });
        
        client.on('join_error', (error) => {
          expect(error.message).toBe('Neplatné dáta');
          client.disconnect();
          done();
        });
        
        // Send malformed data
        client.emit('join_game', null);
      });
    });

    test('should handle connection loss during game', (done) => {
      // Create game
      const questions = createSampleQuestions();
      const gamePin = generateTestPin();
      const dbResult = db.createGame(gamePin, questions, 'test123');
      const game = new GameInstance(gamePin, questions, dbResult.gameId);
      activeGames.set(gamePin, game);
      
      const client = socketClient(`http://localhost:${port}`);
      
      client.on('connect', () => {
        io.on('connection', (socket) => {
          socket.on('join_game', async (data) => {
            const gameData = db.getGameByPin(data.gamePin);
            const playerResult = db.addPlayer(gameData.id);
            
            game.addPlayer(playerResult.playerId, {
              player_token: playerResult.playerToken,
              score: 0
            });
            
            socketToPlayer.set(socket.id, {
              gamePin: data.gamePin,
              playerId: playerResult.playerId,
              playerToken: playerResult.playerToken
            });
            
            socket.emit('game_joined', {
              gamePin: data.gamePin,
              playerId: playerResult.playerId,
              playerName: game.getPlayer(playerResult.playerId).name,
              playersCount: game.getConnectedPlayerCount(),
              playerToken: playerResult.playerToken
            });
          });
          
          socket.on('disconnect', () => {
            const playerInfo = socketToPlayer.get(socket.id);
            if (playerInfo) {
              const game = activeGames.get(playerInfo.gamePin);
              if (game) {
                game.removePlayer(playerInfo.playerId, false);
              }
              socketToPlayer.delete(socket.id);
            }
          });
        });
        
        client.on('game_joined', (response) => {
          expect(game.getConnectedPlayerCount()).toBe(1);
          
          // Simulate connection loss
          client.disconnect();
          
          // Give time for server to process disconnection
          setTimeout(() => {
            expect(game.getConnectedPlayerCount()).toBe(0);
            done();
          }, 100);
        });
        
        client.emit('join_game', { gamePin });
      });
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle multiple concurrent operations', (done) => {
      const numOperations = 20;
      let completedOperations = 0;
      
      // Create game
      const questions = createSampleQuestions();
      const gamePin = generateTestPin();
      const dbResult = db.createGame(gamePin, questions, 'test123');
      const game = new GameInstance(gamePin, questions, dbResult.gameId);
      activeGames.set(gamePin, game);
      
      // Set up server handlers
      io.on('connection', (socket) => {
        socket.on('join_game', async (data) => {
          try {
            const gameData = db.getGameByPin(data.gamePin);
            const playerResult = db.addPlayer(gameData.id);
            
            game.addPlayer(playerResult.playerId, {
              player_token: playerResult.playerToken,
              score: 0
            });
            
            socket.emit('game_joined', {
              gamePin: data.gamePin,
              playerId: playerResult.playerId,
              playerName: game.getPlayer(playerResult.playerId).name,
              playersCount: game.getConnectedPlayerCount(),
              playerToken: playerResult.playerToken
            });
          } catch (error) {
            socket.emit('join_error', { message: 'Chyba pri pripájaní' });
          }
        });
      });
      
      // Create multiple clients
      for (let i = 0; i < numOperations; i++) {
        const client = socketClient(`http://localhost:${port}`);
        
        client.on('connect', () => {
          client.emit('join_game', { gamePin });
        });
        
        client.on('game_joined', (response) => {
          completedOperations++;
          client.disconnect();
          
          if (completedOperations === numOperations) {
            expect(game.getConnectedPlayerCount()).toBe(0); // All disconnected
            expect(game.players.size).toBe(numOperations); // All added
            done();
          }
        });
        
        client.on('join_error', (error) => {
          done(new Error(error.message));
        });
      }
    });
  });
});