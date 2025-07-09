/**
 * Interface Coordination and Multi-Client E2E Tests
 * - Tests coordination between different client interfaces
 * - Tests moderator, player, panel, and stage interfaces
 * - Tests game state transitions and phase management
 * - Tests error recovery and edge cases
 * - Tests performance under load scenarios
 * - Uses real server implementation with Slovak context
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

describe('Interface Coordination E2E Tests', () => {
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

  // Helper function to set up comprehensive event handlers
  const setupComprehensiveEventHandlers = () => {
    io.on('connection', (socket) => {
      // Game creation and moderator management
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
          
          // Notify all panels about new game
          socket.broadcast.emit('game_created_broadcast', {
            gamePin: gamePin,
            questionCount: questions.length
          });
          
        } catch (error) {
          socket.emit('create_game_error', { message: 'Chyba pri vytváraní hry' });
        }
      });

      // Moderator reconnection
      socket.on('reconnect_moderator', async (data) => {
        try {
          const gameData = await db.validateModerator(data.gamePin, data.password, data.moderatorToken);
          
          if (!gameData) {
            socket.emit('moderator_reconnect_error', { 
              message: 'Neplatné prihlásenie moderátora alebo hra neexistuje' 
            });
            return;
          }
          
          const game = activeGames.get(data.gamePin);
          if (!game) {
            socket.emit('moderator_reconnect_error', { 
              message: 'Hra nie je aktívna' 
            });
            return;
          }
          
          socketToModerator.set(socket.id, {
            gamePin: data.gamePin,
            gameId: gameData.id,
            moderatorToken: gameData.moderator_token
          });
          
          socket.emit('moderator_reconnected', {
            gamePin: data.gamePin,
            questionCount: game.questions.length,
            currentQuestionIndex: game.currentQuestionIndex,
            status: game.phase.toLowerCase(),
            players: game.getConnectedPlayers().map(p => ({
              id: p.id,
              name: p.name,
              score: p.score,
              connected: p.connected
            })),
            totalPlayers: game.getConnectedPlayerCount(),
            moderatorToken: gameData.moderator_token
          });
          
        } catch (error) {
          socket.emit('moderator_reconnect_error', { 
            message: 'Chyba pri pripájaní moderátora' 
          });
        }
      });

      // Player management
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
          
          // Notify moderator and panels
          socket.broadcast.emit('player_joined_broadcast', {
            gamePin: data.gamePin,
            playerId: playerResult.playerId,
            playerName: player.name,
            totalPlayers: game.getConnectedPlayerCount()
          });
          
        } catch (error) {
          socket.emit('join_error', { message: 'Chyba pri pripájaní do hry' });
        }
      });

      // Panel management
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
            totalQuestions: game.questions.length,
            leaderboard: game.getLeaderboard()
          });
          
        } catch (error) {
          socket.emit('panel_join_error', { message: 'Chyba pri pripájaní panelu' });
        }
      });

      // Stage interface (post-game leaderboard)
      socket.on('join_stage', async (data) => {
        try {
          const gameData = db.getGameByPin(data.gamePin);
          if (!gameData) {
            socket.emit('stage_join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
            return;
          }
          
          const game = activeGames.get(data.gamePin);
          
          socket.emit('stage_joined', {
            gamePin: data.gamePin,
            gameStatus: game.phase,
            finalLeaderboard: game.getLeaderboard(),
            totalPlayers: game.getConnectedPlayerCount(),
            gameFinished: game.phase === 'FINISHED'
          });
          
        } catch (error) {
          socket.emit('stage_join_error', { message: 'Chyba pri pripájaní stage' });
        }
      });

      // Question flow with comprehensive broadcasting
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
        socket.emit('question_started_moderator', {
          ...questionData,
          correctAnswer: question.correct,
          totalPlayers: game.getConnectedPlayerCount()
        });
        
        // Send to panels
        io.emit('question_started_panel', {
          ...questionData,
          totalPlayers: game.getConnectedPlayerCount()
        });
        
        // Send to stage
        io.emit('question_started_stage', questionData);
      });

      // Answer submission with real-time updates
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
        
        // Real-time updates to moderator
        socket.broadcast.emit('answer_submitted_moderator', {
          gamePin: playerInfo.gamePin,
          playerId: playerInfo.playerId,
          playerName: player.name,
          totalAnswers: game.answers.length,
          totalPlayers: game.getConnectedPlayerCount(),
          answersPercentage: Math.round((game.answers.length / game.getConnectedPlayerCount()) * 100)
        });
        
        // Real-time updates to panels
        socket.broadcast.emit('answer_submitted_panel', {
          gamePin: playerInfo.gamePin,
          totalAnswers: game.answers.length,
          totalPlayers: game.getConnectedPlayerCount()
        });
      });

      // End question with comprehensive results
      socket.on('end_question', (data) => {
        const game = activeGames.get(data.gamePin);
        if (!game) return;
        
        game.phase = 'RESULTS';
        const question = game.getCurrentQuestion();
        const leaderboard = game.getLeaderboard();
        
        // Calculate answer statistics
        const answerStats = question.options.map((option, index) => ({
          option: option,
          count: game.answers.filter(a => a.answer === index).length,
          percentage: Math.round((game.answers.filter(a => a.answer === index).length / game.answers.length) * 100) || 0
        }));
        
        const resultsData = {
          correctAnswer: question.correct,
          correctAnswerText: question.options[question.correct],
          leaderboard: leaderboard.slice(0, 10),
          fullLeaderboard: leaderboard,
          totalAnswers: game.answers.length,
          totalPlayers: game.getConnectedPlayerCount(),
          questionNumber: game.currentQuestionIndex + 1,
          answerStats: answerStats,
          averageResponseTime: game.answers.reduce((sum, a) => sum + a.responseTime, 0) / game.answers.length || 0
        };
        
        // Send to all players
        io.emit('question_ended', resultsData);
        
        // Send enhanced data to moderator
        socket.emit('question_ended_moderator', {
          ...resultsData,
          detailedStats: {
            fastestAnswer: Math.min(...game.answers.map(a => a.responseTime)),
            slowestAnswer: Math.max(...game.answers.map(a => a.responseTime)),
            correctAnswersCount: game.answers.filter(a => a.answer === question.correct).length
          }
        });
        
        // Send to panels
        io.emit('question_ended_panel', resultsData);
        
        // Send to stage
        io.emit('question_ended_stage', resultsData);
      });

      // Next question management
      socket.on('next_question', (data) => {
        const game = activeGames.get(data.gamePin);
        if (!game) return;
        
        const hasMore = game.nextQuestion();
        
        if (hasMore) {
          const nextQuestionData = {
            gamePin: data.gamePin,
            questionIndex: game.currentQuestionIndex,
            totalQuestions: game.questions.length,
            nextQuestion: game.getCurrentQuestion()
          };
          
          // Notify moderator
          socket.emit('next_question_ready', nextQuestionData);
          
          // Notify panels
          socket.broadcast.emit('next_question_ready_panel', nextQuestionData);
          
        } else {
          // Game finished
          const finalLeaderboard = game.getLeaderboard();
          
          const finishedData = {
            gamePin: data.gamePin,
            finalLeaderboard: finalLeaderboard,
            totalPlayers: game.getConnectedPlayerCount(),
            gameStats: {
              totalQuestions: game.questions.length,
              totalPlayersParticipated: game.memoryStats.totalPlayersJoined,
              totalAnswersSubmitted: game.memoryStats.totalAnswersSubmitted,
              peakPlayerCount: game.memoryStats.peakPlayerCount
            }
          };
          
          // Broadcast to all
          io.emit('game_finished', finishedData);
          
          // Enhanced data for moderator
          socket.emit('game_finished_moderator', {
            ...finishedData,
            memoryStats: game.getMemoryStats()
          });
          
          // Data for stage interface
          io.emit('game_finished_stage', finishedData);
        }
      });

      // Disconnect handling
      socket.on('disconnect', () => {
        const playerInfo = socketToPlayer.get(socket.id);
        if (playerInfo) {
          const game = activeGames.get(playerInfo.gamePin);
          if (game) {
            game.removePlayer(playerInfo.playerId, false);
            
            // Notify moderator and panels of disconnection
            socket.broadcast.emit('player_disconnected', {
              gamePin: playerInfo.gamePin,
              playerId: playerInfo.playerId,
              totalPlayers: game.getConnectedPlayerCount()
            });
          }
          socketToPlayer.delete(socket.id);
        }
        
        const moderatorInfo = socketToModerator.get(socket.id);
        if (moderatorInfo) {
          socket.broadcast.emit('moderator_disconnected', {
            gamePin: moderatorInfo.gamePin
          });
          socketToModerator.delete(socket.id);
        }
        
        const panelInfo = socketToPanels.get(socket.id);
        if (panelInfo) {
          socketToPanels.delete(socket.id);
        }
      });
    });
  };

  describe('Multi-Interface Coordination', () => {
    test('should coordinate between moderator, players, and panels during game', (done) => {
      setupComprehensiveEventHandlers();
      
      let gamePin;
      let moderatorConnected = false;
      let playerConnected = false;
      let panelConnected = false;
      let questionStarted = false;
      let answerSubmitted = false;
      let questionEnded = false;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        moderatorConnected = true;
        
        // Create panel
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
          panelConnected = true;
          
          // Create player
          const playerClient = socketClient(`http://localhost:${port}`);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', (joinResponse) => {
            expect(joinResponse.gamePin).toBe(gamePin);
            playerConnected = true;
            
            // Start question
            setTimeout(() => {
              moderatorClient.emit('start_question', { gamePin });
            }, 100);
          });
          
          // Player events
          playerClient.on('question_started', (questionData) => {
            expect(questionData.question).toBeDefined();
            questionStarted = true;
            
            // Submit answer
            playerClient.emit('submit_answer', {
              answer: 0,
              timestamp: Date.now()
            });
          });
          
          playerClient.on('answer_result', (result) => {
            expect(result.correct).toBe(true);
            answerSubmitted = true;
            
            // End question
            setTimeout(() => {
              moderatorClient.emit('end_question', { gamePin });
            }, 100);
          });
          
          playerClient.on('question_ended', (results) => {
            expect(results.correctAnswer).toBe(0);
            questionEnded = true;
            
            // Verify all interfaces coordinated
            expect(moderatorConnected).toBe(true);
            expect(playerConnected).toBe(true);
            expect(panelConnected).toBe(true);
            expect(questionStarted).toBe(true);
            expect(answerSubmitted).toBe(true);
            expect(questionEnded).toBe(true);
            
            playerClient.disconnect();
            done();
          });
        });
        
        // Panel events
        panelClient.on('question_started_panel', (questionData) => {
          expect(questionData.question).toBeDefined();
          expect(questionData.totalPlayers).toBe(1);
        });
        
        panelClient.on('answer_submitted_panel', (updateData) => {
          expect(updateData.gamePin).toBe(gamePin);
          expect(updateData.totalAnswers).toBe(1);
        });
        
        panelClient.on('question_ended_panel', (results) => {
          expect(results.leaderboard).toBeDefined();
          expect(results.answerStats).toBeDefined();
          panelClient.disconnect();
        });
      });
      
      // Moderator events
      moderatorClient.on('question_started_moderator', (questionData) => {
        expect(questionData.correctAnswer).toBe(0);
        expect(questionData.totalPlayers).toBe(1);
      });
      
      moderatorClient.on('answer_submitted_moderator', (updateData) => {
        expect(updateData.gamePin).toBe(gamePin);
        expect(updateData.totalAnswers).toBe(1);
        expect(updateData.answersPercentage).toBe(100);
      });
      
      moderatorClient.on('question_ended_moderator', (results) => {
        expect(results.detailedStats).toBeDefined();
        expect(results.detailedStats.correctAnswersCount).toBe(1);
        
        moderatorClient.disconnect();
      });
    });
  });

  describe('Stage Interface Integration', () => {
    test('should handle stage interface for post-game leaderboard display', (done) => {
      setupComprehensiveEventHandlers();
      
      let gamePin;
      let stageJoined = false;
      let gameFinishedOnStage = false;
      
      // Create moderator and game
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create stage interface
        const stageClient = socketClient(`http://localhost:${port}`);
        
        stageClient.on('connect', () => {
          stageClient.emit('join_stage', {
            gamePin: gamePin
          });
        });
        
        stageClient.on('stage_joined', (stageResponse) => {
          expect(stageResponse.gamePin).toBe(gamePin);
          expect(stageResponse.gameStatus).toBe('WAITING');
          expect(stageResponse.gameFinished).toBe(false);
          stageJoined = true;
          
          // Create and join player
          const playerClient = socketClient(`http://localhost:${port}`);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', () => {
            // Start and complete a question
            moderatorClient.emit('start_question', { gamePin });
          });
          
          playerClient.on('question_started', (questionData) => {
            playerClient.emit('submit_answer', {
              answer: 0,
              timestamp: Date.now()
            });
          });
          
          playerClient.on('answer_result', () => {
            moderatorClient.emit('end_question', { gamePin });
          });
          
          playerClient.on('question_ended', () => {
            // Finish the game
            moderatorClient.emit('next_question', { gamePin });
          });
          
          playerClient.on('game_finished', () => {
            playerClient.disconnect();
          });
        });
        
        // Stage events
        stageClient.on('question_started_stage', (questionData) => {
          expect(questionData.question).toBeDefined();
        });
        
        stageClient.on('question_ended_stage', (results) => {
          expect(results.leaderboard).toBeDefined();
          expect(results.answerStats).toBeDefined();
        });
        
        stageClient.on('game_finished_stage', (finalResults) => {
          expect(finalResults.gamePin).toBe(gamePin);
          expect(finalResults.finalLeaderboard).toBeDefined();
          expect(finalResults.gameStats).toBeDefined();
          gameFinishedOnStage = true;
          
          // Verify stage interface worked
          expect(stageJoined).toBe(true);
          expect(gameFinishedOnStage).toBe(true);
          
          stageClient.disconnect();
          moderatorClient.disconnect();
          done();
        });
      });
    });
  });

  describe('Game State Transition Management', () => {
    test('should handle all game phase transitions correctly', (done) => {
      setupComprehensiveEventHandlers();
      
      let gamePin;
      let phases = [];
      
      // Create moderator
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
          // Phase 1: WAITING
          const game = activeGames.get(gamePin);
          expect(game.phase).toBe('WAITING');
          phases.push('WAITING');
          
          // Start question
          moderatorClient.emit('start_question', { gamePin });
        });
        
        playerClient.on('question_started', (questionData) => {
          // Phase 2: QUESTION_ACTIVE
          const game = activeGames.get(gamePin);
          expect(game.phase).toBe('QUESTION_ACTIVE');
          phases.push('QUESTION_ACTIVE');
          
          // Submit answer
          playerClient.emit('submit_answer', {
            answer: 0,
            timestamp: Date.now()
          });
        });
        
        playerClient.on('answer_result', () => {
          // Still in QUESTION_ACTIVE
          const game = activeGames.get(gamePin);
          expect(game.phase).toBe('QUESTION_ACTIVE');
          
          // End question
          moderatorClient.emit('end_question', { gamePin });
        });
        
        playerClient.on('question_ended', () => {
          // Phase 3: RESULTS
          const game = activeGames.get(gamePin);
          expect(game.phase).toBe('RESULTS');
          phases.push('RESULTS');
          
          // Next question
          moderatorClient.emit('next_question', { gamePin });
        });
        
        playerClient.on('game_finished', () => {
          // Phase 4: FINISHED
          const game = activeGames.get(gamePin);
          expect(game.phase).toBe('FINISHED');
          phases.push('FINISHED');
          
          // Verify all phases occurred
          expect(phases).toEqual(['WAITING', 'QUESTION_ACTIVE', 'RESULTS', 'FINISHED']);
          
          playerClient.disconnect();
          moderatorClient.disconnect();
          done();
        });
      });
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle moderator disconnect and reconnection', (done) => {
      setupComprehensiveEventHandlers();
      
      let gamePin;
      let moderatorToken;
      let moderatorDisconnected = false;
      let moderatorReconnected = false;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        moderatorToken = response.moderatorToken;
        
        // Create player to keep game alive
        const playerClient = socketClient(`http://localhost:${port}`);
        
        playerClient.on('connect', () => {
          playerClient.emit('join_game', { gamePin });
        });
        
        playerClient.on('game_joined', () => {
          // Disconnect moderator
          moderatorClient.disconnect();
          moderatorDisconnected = true;
          
          // Wait a bit, then reconnect
          setTimeout(() => {
            const newModeratorClient = socketClient(`http://localhost:${port}`);
            
            newModeratorClient.on('connect', () => {
              newModeratorClient.emit('reconnect_moderator', {
                gamePin: gamePin,
                password: 'test123',
                moderatorToken: moderatorToken
              });
            });
            
            newModeratorClient.on('moderator_reconnected', (reconnectResponse) => {
              expect(reconnectResponse.gamePin).toBe(gamePin);
              expect(reconnectResponse.totalPlayers).toBe(1);
              expect(reconnectResponse.status).toBe('waiting');
              moderatorReconnected = true;
              
              // Verify reconnection worked
              expect(moderatorDisconnected).toBe(true);
              expect(moderatorReconnected).toBe(true);
              
              newModeratorClient.disconnect();
              playerClient.disconnect();
              done();
            });
            
            newModeratorClient.on('moderator_reconnect_error', (error) => {
              done(new Error(error.message));
            });
          }, 500);
        });
      });
    });
    
    test('should handle invalid panel join attempts', (done) => {
      setupComprehensiveEventHandlers();
      
      const panelClient = socketClient(`http://localhost:${port}`);
      
      panelClient.on('connect', () => {
        panelClient.emit('join_panel', {
          gamePin: '999999',
          panelType: 'display'
        });
      });
      
      panelClient.on('panel_join_error', (error) => {
        expect(error.message).toBe('Hra s týmto PIN kódom neexistuje');
        panelClient.disconnect();
        done();
      });
    });
  });

  describe('Performance Under Load', () => {
    test('should handle multiple interfaces with high player count', (done) => {
      setupComprehensiveEventHandlers();
      
      const playerCount = 20;
      const panelCount = 3;
      let gamePin;
      let playersJoined = 0;
      let panelsJoined = 0;
      let answersReceived = 0;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create panels
        const panels = [];
        for (let i = 0; i < panelCount; i++) {
          const panelClient = socketClient(`http://localhost:${port}`);
          panels.push(panelClient);
          
          panelClient.on('connect', () => {
            panelClient.emit('join_panel', {
              gamePin: gamePin,
              panelType: 'display'
            });
          });
          
          panelClient.on('panel_joined', () => {
            panelsJoined++;
          });
        }
        
        // Create players
        const players = [];
        for (let i = 0; i < playerCount; i++) {
          const playerClient = socketClient(`http://localhost:${port}`);
          players.push(playerClient);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', () => {
            playersJoined++;
            
            if (playersJoined === playerCount) {
              // All players joined, start question
              setTimeout(() => {
                moderatorClient.emit('start_question', { gamePin });
              }, 200);
            }
          });
          
          playerClient.on('question_started', (questionData) => {
            // Submit answer with spread timing
            setTimeout(() => {
              playerClient.emit('submit_answer', {
                answer: i % 4,
                timestamp: Date.now()
              });
            }, i * 20);
          });
          
          playerClient.on('answer_result', () => {
            answersReceived++;
            
            if (answersReceived === playerCount) {
              // All answers received
              setTimeout(() => {
                moderatorClient.emit('end_question', { gamePin });
              }, 200);
            }
          });
          
          playerClient.on('question_ended', (results) => {
            if (i === 0) { // Only check from first player
              expect(results.leaderboard).toBeDefined();
              expect(results.totalAnswers).toBe(playerCount);
              expect(results.answerStats).toBeDefined();
              
              // Verify all connections
              expect(playersJoined).toBe(playerCount);
              expect(panelsJoined).toBe(panelCount);
              expect(answersReceived).toBe(playerCount);
              
              // Clean up
              players.forEach(p => p.disconnect());
              panels.forEach(p => p.disconnect());
              moderatorClient.disconnect();
              done();
            }
          });
        }
      });
    }, 15000); // Longer timeout for high load test
  });
});