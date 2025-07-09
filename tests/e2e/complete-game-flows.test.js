/**
 * Complete End-to-End Tests for Game Flows
 * - Tests complete user journeys from game creation to finish
 * - Tests real-time communication between moderator, players, and panels
 * - Tests Slovak language context and error handling
 * - Tests concurrent multi-user scenarios
 * - Uses real server implementation and real client connections
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

describe('Complete Game Flow E2E Tests', () => {
  let server;
  let io;
  let db;
  let socketManager;
  let port;
  let activeGames;
  let playerLatencies;
  let socketToPlayer;
  let socketToModerator;
  let socketToPanels;

  beforeEach((done) => {
    // Create test database
    db = createTestDatabase();
    
    // Initialize game state
    activeGames = new Map();
    playerLatencies = new Map();
    socketToPlayer = new Map();
    socketToModerator = new Map();
    socketToPanels = new Map();
    
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

  // Helper function to set up complete game event handlers
  const setupGameEventHandlers = () => {
    io.on('connection', (socket) => {
      // Game creation
      socket.on('create_game', async (data) => {
        try {
          const gamePin = generateTestPin();
          const questions = createSampleQuestions();
          
          const dbResult = await db.createGame(gamePin, questions, data.moderatorPassword);
          const game = new GameInstance(gamePin, questions, dbResult.gameId);
          activeGames.set(gamePin, game);
          
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

      // Player joining
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
          
          // Notify moderator of player join
          socket.broadcast.emit('player_joined', {
            gamePin: data.gamePin,
            playerId: playerResult.playerId,
            playerName: player.name,
            totalPlayers: game.getConnectedPlayerCount()
          });
          
        } catch (error) {
          socket.emit('join_error', { message: 'Chyba pri pripájaní do hry' });
        }
      });

      // Panel joining
      socket.on('join_panel', async (data) => {
        try {
          const gameData = db.getGameByPin(data.gamePin);
          if (!gameData) {
            socket.emit('panel_join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
            return;
          }
          
          const game = activeGames.get(data.gamePin);
          
          socketToPanels.set(socket.id, {
            gamePin: data.gamePin,
            panelType: data.panelType || 'display'
          });
          
          socket.emit('panel_joined', {
            gamePin: data.gamePin,
            gameStatus: game.phase,
            totalPlayers: game.getConnectedPlayerCount(),
            currentQuestionIndex: game.currentQuestionIndex,
            totalQuestions: game.questions.length
          });
          
        } catch (error) {
          socket.emit('panel_join_error', { message: 'Chyba pri pripájaní panelu' });
        }
      });

      // Question management
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
        
        // Broadcast to all players
        io.emit('question_started', questionData);
        
        // Send to moderator with correct answer
        socket.emit('question_started_dashboard', {
          ...questionData,
          correctAnswer: question.correct
        });
        
        // Send to panels
        io.emit('question_started_panel', questionData);
      });

      // Answer submission
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
        
        // Send result to player
        socket.emit('answer_result', {
          correct: isCorrect,
          correctAnswer: question.correct,
          points: points,
          totalScore: player ? player.score : 0,
          responseTime: answerData.responseTime
        });
        
        // Notify moderator and panels of answer
        socket.broadcast.emit('answer_submitted', {
          gamePin: playerInfo.gamePin,
          playerId: playerInfo.playerId,
          totalAnswers: game.answers.length,
          totalPlayers: game.getConnectedPlayerCount()
        });
      });

      // End question
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
          totalPlayers: game.getConnectedPlayerCount(),
          questionNumber: game.currentQuestionIndex + 1
        };
        
        // Broadcast results to all
        io.emit('question_ended', resultsData);
      });

      // Next question
      socket.on('next_question', (data) => {
        const game = activeGames.get(data.gamePin);
        if (!game) return;
        
        const hasMore = game.nextQuestion();
        
        if (hasMore) {
          socket.emit('next_question_ready', {
            gamePin: data.gamePin,
            questionIndex: game.currentQuestionIndex,
            totalQuestions: game.questions.length
          });
        } else {
          // Game finished
          const finalLeaderboard = game.getLeaderboard();
          
          io.emit('game_finished', {
            gamePin: data.gamePin,
            finalLeaderboard: finalLeaderboard,
            totalPlayers: game.getConnectedPlayerCount()
          });
        }
      });

      // Disconnect handling
      socket.on('disconnect', () => {
        const playerInfo = socketToPlayer.get(socket.id);
        if (playerInfo) {
          const game = activeGames.get(playerInfo.gamePin);
          if (game) {
            game.removePlayer(playerInfo.playerId, false);
          }
          socketToPlayer.delete(socket.id);
        }
        
        const moderatorInfo = socketToModerator.get(socket.id);
        if (moderatorInfo) {
          socketToModerator.delete(socket.id);
        }
        
        const panelInfo = socketToPanels.get(socket.id);
        if (panelInfo) {
          socketToPanels.delete(socket.id);
        }
      });
    });
  };

  describe('Complete Game Creation to Finish Flow', () => {
    test('should handle complete game from creation to finish with multiple players', (done) => {
      setupGameEventHandlers();
      
      let gamePin;
      let moderatorToken;
      let players = [];
      let gameCreated = false;
      let playersJoined = 0;
      let questionsAnswered = 0;
      let gameFinished = false;
      
      const totalPlayers = 3;
      const totalQuestions = 5;
      
      // Create moderator client
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        // Create game
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        moderatorToken = response.moderatorToken;
        gameCreated = true;
        
        expect(response.questionCount).toBe(totalQuestions);
        expect(response.gamePin).toBeDefined();
        
        // Create player clients
        for (let i = 0; i < totalPlayers; i++) {
          const playerClient = socketClient(`http://localhost:${port}`);
          players.push(playerClient);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', (joinResponse) => {
            expect(joinResponse.gamePin).toBe(gamePin);
            expect(joinResponse.playerName).toMatch(/^Hráč \d+$/);
            
            playersJoined++;
            
            if (playersJoined === totalPlayers) {
              // All players joined, start first question
              setTimeout(() => {
                moderatorClient.emit('start_question', { gamePin });
              }, 100);
            }
          });
          
          playerClient.on('question_started', (questionData) => {
            expect(questionData.question).toBeDefined();
            expect(questionData.options).toHaveLength(4);
            expect(questionData.timeLimit).toBe(30);
            
            // Submit answer (alternating correct/incorrect)
            const answer = (i % 2 === 0) ? 0 : 1; // First question correct answer is 0
            playerClient.emit('submit_answer', {
              answer: answer,
              timestamp: Date.now()
            });
          });
          
          playerClient.on('answer_result', (result) => {
            expect(result.correct).toBeDefined();
            expect(result.correctAnswer).toBe(0);
            expect(result.totalScore).toBeGreaterThanOrEqual(0);
            
            questionsAnswered++;
          });
          
          playerClient.on('question_ended', (results) => {
            expect(results.correctAnswer).toBe(0);
            expect(results.leaderboard).toBeDefined();
            expect(results.totalAnswers).toBeGreaterThan(0);
          });
          
          playerClient.on('game_finished', (finalResults) => {
            expect(finalResults.gamePin).toBe(gamePin);
            expect(finalResults.finalLeaderboard).toBeDefined();
            expect(finalResults.totalPlayers).toBe(totalPlayers);
            gameFinished = true;
            
            // Verify final state
            expect(gameCreated).toBe(true);
            expect(playersJoined).toBe(totalPlayers);
            expect(questionsAnswered).toBeGreaterThan(0);
            expect(gameFinished).toBe(true);
            
            // Clean up
            players.forEach(p => p.disconnect());
            moderatorClient.disconnect();
            
            done();
          });
        }
      });
      
      moderatorClient.on('question_started_dashboard', (questionData) => {
        expect(questionData.correctAnswer).toBeDefined();
        
        // Wait for answers, then end question
        setTimeout(() => {
          moderatorClient.emit('end_question', { gamePin });
        }, 1000);
      });
      
      moderatorClient.on('question_ended', (results) => {
        // Move to next question or finish game
        setTimeout(() => {
          moderatorClient.emit('next_question', { gamePin });
        }, 500);
      });
      
      moderatorClient.on('next_question_ready', (data) => {
        expect(data.questionIndex).toBeDefined();
        
        // Start next question
        setTimeout(() => {
          moderatorClient.emit('start_question', { gamePin });
        }, 100);
      });
    });
  });

  describe('Panel Integration Flow', () => {
    test('should handle panel joining and receiving game updates', (done) => {
      setupGameEventHandlers();
      
      let gamePin;
      let panelJoined = false;
      let questionReceived = false;
      let resultsReceived = false;
      
      // Create moderator client
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create panel client
        const panelClient = socketClient(`http://localhost:${port}`);
        
        panelClient.on('connect', () => {
          panelClient.emit('join_panel', {
            gamePin: gamePin,
            panelType: 'display'
          });
        });
        
        panelClient.on('panel_joined', (panelResponse) => {
          expect(panelResponse.gamePin).toBe(gamePin);
          expect(panelResponse.gameStatus).toBe('WAITING');
          panelJoined = true;
          
          // Create and join a player
          const playerClient = socketClient(`http://localhost:${port}`);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', () => {
            // Start question
            setTimeout(() => {
              moderatorClient.emit('start_question', { gamePin });
            }, 100);
          });
          
          playerClient.on('question_started', (questionData) => {
            // Submit answer
            playerClient.emit('submit_answer', {
              answer: 0,
              timestamp: Date.now()
            });
          });
          
          playerClient.on('answer_result', () => {
            // End question
            setTimeout(() => {
              moderatorClient.emit('end_question', { gamePin });
            }, 100);
          });
          
          playerClient.on('question_ended', () => {
            playerClient.disconnect();
          });
        });
        
        panelClient.on('question_started_panel', (questionData) => {
          expect(questionData.question).toBeDefined();
          expect(questionData.options).toHaveLength(4);
          questionReceived = true;
        });
        
        panelClient.on('question_ended', (results) => {
          expect(results.correctAnswer).toBe(0);
          expect(results.leaderboard).toBeDefined();
          resultsReceived = true;
          
          // Verify all events received
          expect(panelJoined).toBe(true);
          expect(questionReceived).toBe(true);
          expect(resultsReceived).toBe(true);
          
          panelClient.disconnect();
          moderatorClient.disconnect();
          done();
        });
      });
    });
  });

  describe('Player Reconnection Flow', () => {
    test('should handle player reconnection during active game', (done) => {
      setupGameEventHandlers();
      
      let gamePin;
      let playerId;
      let playerToken;
      let originalScore = 0;
      
      // Add reconnection handler
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
      
      // Create moderator and game
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create player
        const playerClient = socketClient(`http://localhost:${port}`);
        
        playerClient.on('connect', () => {
          playerClient.emit('join_game', { gamePin });
        });
        
        playerClient.on('game_joined', (joinResponse) => {
          playerId = joinResponse.playerId;
          playerToken = joinResponse.playerToken;
          
          // Start question and answer it
          moderatorClient.emit('start_question', { gamePin });
        });
        
        playerClient.on('question_started', (questionData) => {
          playerClient.emit('submit_answer', {
            answer: 0, // Correct answer
            timestamp: Date.now()
          });
        });
        
        playerClient.on('answer_result', (result) => {
          expect(result.correct).toBe(true);
          expect(result.points).toBeGreaterThan(0);
          originalScore = result.totalScore;
          
          // Simulate disconnection
          playerClient.disconnect();
          
          // Wait a bit, then reconnect
          setTimeout(() => {
            const reconnectClient = socketClient(`http://localhost:${port}`);
            
            reconnectClient.on('connect', () => {
              reconnectClient.emit('reconnect_player', {
                gamePin: gamePin,
                playerToken: playerToken
              });
            });
            
            reconnectClient.on('player_reconnected', (reconnectResponse) => {
              expect(reconnectResponse.gamePin).toBe(gamePin);
              expect(reconnectResponse.playerId).toBe(playerId);
              expect(reconnectResponse.score).toBe(originalScore);
              expect(reconnectResponse.gameStatus).toBe('QUESTION_ACTIVE');
              
              reconnectClient.disconnect();
              moderatorClient.disconnect();
              done();
            });
            
            reconnectClient.on('reconnect_error', (error) => {
              done(new Error(error.message));
            });
          }, 500);
        });
      });
    });
  });

  describe('Error Handling Flows', () => {
    test('should handle invalid game PIN gracefully', (done) => {
      setupGameEventHandlers();
      
      const playerClient = socketClient(`http://localhost:${port}`);
      
      playerClient.on('connect', () => {
        playerClient.emit('join_game', { gamePin: '999999' });
      });
      
      playerClient.on('join_error', (error) => {
        expect(error.message).toBe('Hra s týmto PIN kódom neexistuje');
        playerClient.disconnect();
        done();
      });
    });
    
    test('should handle joining game in progress', (done) => {
      setupGameEventHandlers();
      
      let gamePin;
      
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Join a player first
        const firstPlayerClient = socketClient(`http://localhost:${port}`);
        
        firstPlayerClient.on('connect', () => {
          firstPlayerClient.emit('join_game', { gamePin });
        });
        
        firstPlayerClient.on('game_joined', () => {
          // Start question to change game phase
          moderatorClient.emit('start_question', { gamePin });
          
          // Now try to join another player
          const secondPlayerClient = socketClient(`http://localhost:${port}`);
          
          secondPlayerClient.on('connect', () => {
            secondPlayerClient.emit('join_game', { gamePin });
          });
          
          secondPlayerClient.on('join_error', (error) => {
            expect(error.message).toBe('Hra už prebieha, nemôžete sa pripojiť');
            
            firstPlayerClient.disconnect();
            secondPlayerClient.disconnect();
            moderatorClient.disconnect();
            done();
          });
        });
      });
    });
  });

  describe('High Concurrency Flow', () => {
    test('should handle many players joining and playing simultaneously', (done) => {
      setupGameEventHandlers();
      
      const playerCount = 10;
      let gamePin;
      let playersJoined = 0;
      let answersReceived = 0;
      let resultsReceived = 0;
      
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create many players
        const players = [];
        for (let i = 0; i < playerCount; i++) {
          const playerClient = socketClient(`http://localhost:${port}`);
          players.push(playerClient);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', (joinResponse) => {
            playersJoined++;
            
            if (playersJoined === playerCount) {
              // All players joined, start question
              setTimeout(() => {
                moderatorClient.emit('start_question', { gamePin });
              }, 100);
            }
          });
          
          playerClient.on('question_started', (questionData) => {
            // Submit answer with slight delay to spread out timing
            setTimeout(() => {
              playerClient.emit('submit_answer', {
                answer: i % 4, // Different answers
                timestamp: Date.now()
              });
            }, i * 10);
          });
          
          playerClient.on('answer_result', (result) => {
            answersReceived++;
            expect(result.correct).toBeDefined();
            expect(result.totalScore).toBeGreaterThanOrEqual(0);
          });
          
          playerClient.on('question_ended', (results) => {
            resultsReceived++;
            
            if (resultsReceived === playerCount) {
              // All players received results
              expect(playersJoined).toBe(playerCount);
              expect(answersReceived).toBe(playerCount);
              expect(results.leaderboard).toBeDefined();
              expect(results.totalAnswers).toBeGreaterThan(0);
              
              // Clean up
              players.forEach(p => p.disconnect());
              moderatorClient.disconnect();
              done();
            }
          });
        }
      });
      
      moderatorClient.on('question_started_dashboard', (questionData) => {
        // Wait for answers, then end question
        setTimeout(() => {
          moderatorClient.emit('end_question', { gamePin });
        }, 2000);
      });
    });
  });
});