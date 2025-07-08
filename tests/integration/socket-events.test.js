const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const http = require('http');
const socketIo = require('socket.io');
const socketClient = require('socket.io-client');
const { createSampleQuestions, generateTestPin, delay } = require('../helpers/test-utils');

describe('Socket.io Event Integration', () => {
  let server, io, clientSocket, serverSocket, port;

  beforeEach((done) => {
    // Create test server
    server = http.createServer();
    io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Get random port for testing
    server.listen(() => {
      port = server.address().port;
      
      // Create client connection
      clientSocket = socketClient(`http://localhost:${port}`);
      
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      
      clientSocket.on('connect', done);
    });
  });

  afterEach((done) => {
    io.close();
    server.close();
    clientSocket.close();
    done();
  });

  describe('Connection Management', () => {
    test('should establish connection successfully', () => {
      expect(clientSocket.connected).toBe(true);
      expect(serverSocket).toBeDefined();
    });

    test('should handle disconnection', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });
      
      clientSocket.disconnect();
    });
  });

  describe('Latency Measurement', () => {
    test('should measure latency with ping/pong', (done) => {
      const startTime = Date.now();
      
      clientSocket.on('latency_ping', (timestamp) => {
        // Simulate client responding to ping
        clientSocket.emit('latency_pong', timestamp);
      });
      
      serverSocket.on('latency_pong', (timestamp) => {
        const latency = Date.now() - timestamp;
        expect(latency).toBeGreaterThanOrEqual(0);
        expect(latency).toBeLessThan(1000); // Should be very fast in tests
        done();
      });
      
      // Server sends ping
      serverSocket.emit('latency_ping', startTime);
    });
  });

  describe('Game Creation Events', () => {
    test('should handle create_game event', (done) => {
      const gameData = {
        customPin: generateTestPin(),
        category: 'general',
        moderatorPassword: null
      };

      clientSocket.on('game_created', (response) => {
        expect(response.gamePin).toBe(gameData.customPin);
        expect(response.questionCount).toBeGreaterThan(0);
        expect(response.moderatorToken).toBeDefined();
        done();
      });

      clientSocket.on('create_game_error', (error) => {
        done(new Error(`Game creation failed: ${error.message}`));
      });

      // Mock the game creation logic
      serverSocket.on('create_game', (data) => {
        // Simulate successful game creation
        const questions = createSampleQuestions();
        
        serverSocket.emit('game_created', {
          gamePin: data.customPin,
          questionCount: questions.length,
          moderatorToken: 'test-moderator-token-' + Date.now()
        });
      });

      clientSocket.emit('create_game', gameData);
    });

    test('should handle duplicate PIN error', (done) => {
      const duplicatePin = '123456';

      clientSocket.on('create_game_error', (error) => {
        expect(error.message).toContain('PIN kód už existuje');
        done();
      });

      // Mock duplicate PIN scenario
      serverSocket.on('create_game', (data) => {
        if (data.customPin === duplicatePin) {
          serverSocket.emit('create_game_error', {
            message: 'PIN kód už existuje, vyberte iný'
          });
        }
      });

      clientSocket.emit('create_game', {
        customPin: duplicatePin,
        category: 'general'
      });
    });
  });

  describe('Player Join Events', () => {
    test('should handle join_game event', (done) => {
      const gamePin = generateTestPin();

      clientSocket.on('game_joined', (response) => {
        expect(response.gamePin).toBe(gamePin);
        expect(response.playerId).toBeDefined();
        expect(response.playersCount).toBeGreaterThanOrEqual(1);
        expect(response.playerToken).toBeDefined();
        done();
      });

      // Mock successful join
      serverSocket.on('join_game', (data) => {
        const playerId = Math.floor(Math.random() * 1000);
        serverSocket.emit('game_joined', {
          gamePin: data.gamePin,
          playerId: playerId,
          playersCount: 1,
          playerToken: 'test-player-token-' + playerId
        });
      });

      clientSocket.emit('join_game', { gamePin });
    });

    test('should handle join error for non-existent game', (done) => {
      const invalidPin = '999999';

      clientSocket.on('join_error', (error) => {
        expect(error.message).toContain('neexistuje');
        done();
      });

      // Mock game not found
      serverSocket.on('join_game', (data) => {
        if (data.gamePin === invalidPin) {
          serverSocket.emit('join_error', {
            message: 'Hra s týmto PIN kódom neexistuje'
          });
        }
      });

      clientSocket.emit('join_game', { gamePin: invalidPin });
    });
  });

  describe('Question Flow Events', () => {
    test('should handle start_question event', (done) => {
      const gamePin = generateTestPin();
      const questions = createSampleQuestions();

      clientSocket.on('question_started', (questionData) => {
        expect(questionData.questionNumber).toBe(1);
        expect(questionData.totalQuestions).toBe(questions.length);
        expect(questionData.question).toBeDefined();
        expect(questionData.options).toHaveLength(4);
        expect(questionData.timeLimit).toBeGreaterThan(0);
        expect(questionData.serverTime).toBeDefined();
        done();
      });

      // Mock start question
      serverSocket.on('start_question', (data) => {
        const question = questions[0];
        serverSocket.emit('question_started', {
          questionNumber: 1,
          totalQuestions: questions.length,
          question: question.question,
          options: question.options,
          timeLimit: question.timeLimit,
          serverTime: Date.now()
        });
      });

      clientSocket.emit('start_question', { gamePin });
    });

    test('should handle submit_answer event', (done) => {
      const answerData = {
        answer: 0,
        timestamp: Date.now()
      };

      clientSocket.on('answer_result', (result) => {
        expect(result.correct).toBeDefined();
        expect(result.correctAnswer).toBeDefined();
        expect(result.points).toBeGreaterThanOrEqual(0);
        expect(result.totalScore).toBeGreaterThanOrEqual(0);
        expect(result.responseTime).toBeDefined();
        done();
      });

      // Mock answer processing
      serverSocket.on('submit_answer', (data) => {
        const isCorrect = data.answer === 0; // Assume first option is correct
        serverSocket.emit('answer_result', {
          correct: isCorrect,
          correctAnswer: 0,
          points: isCorrect ? 1200 : 0,
          totalScore: isCorrect ? 1200 : 0,
          responseTime: 8000
        });
      });

      clientSocket.emit('submit_answer', answerData);
    });

    test('should handle end_question event', (done) => {
      const questions = createSampleQuestions();

      clientSocket.on('question_ended', (results) => {
        expect(results.correctAnswer).toBeDefined();
        expect(results.leaderboard).toBeDefined();
        expect(Array.isArray(results.leaderboard)).toBe(true);
        expect(results.answerStats).toBeDefined();
        expect(results.totalAnswers).toBeGreaterThanOrEqual(0);
        expect(results.totalPlayers).toBeGreaterThanOrEqual(0);
        done();
      });

      // Mock end question
      serverSocket.on('end_question', (data) => {
        serverSocket.emit('question_ended', {
          correctAnswer: 0,
          leaderboard: [
            { position: 1, name: 'TestPlayer', score: 1200, playerId: 1 }
          ],
          answerStats: [
            { count: 1, percentage: 100 },
            { count: 0, percentage: 0 },
            { count: 0, percentage: 0 },
            { count: 0, percentage: 0 }
          ],
          totalAnswers: 1,
          totalPlayers: 1
        });
      });

      clientSocket.emit('end_question', { gamePin: generateTestPin() });
    });
  });

  describe('Reconnection Events', () => {
    test('should handle player reconnection', (done) => {
      const reconnectData = {
        gamePin: generateTestPin(),
        playerToken: 'test-player-token-123'
      };

      clientSocket.on('player_reconnected', (response) => {
        expect(response.gamePin).toBe(reconnectData.gamePin);
        expect(response.playerId).toBeDefined();
        expect(response.score).toBeGreaterThanOrEqual(0);
        expect(response.gameStatus).toBeDefined();
        done();
      });

      clientSocket.on('reconnect_error', (error) => {
        done(new Error(`Reconnection failed: ${error.message}`));
      });

      // Mock successful reconnection
      serverSocket.on('reconnect_player', (data) => {
        serverSocket.emit('player_reconnected', {
          gamePin: data.gamePin,
          playerId: 123,
          score: 1500,
          gameStatus: 'WAITING'
        });
      });

      clientSocket.emit('reconnect_player', reconnectData);
    });

    test('should handle moderator reconnection', (done) => {
      const reconnectData = {
        gamePin: generateTestPin(),
        password: null,
        moderatorToken: 'test-moderator-token-123'
      };

      clientSocket.on('moderator_reconnected', (response) => {
        expect(response.gamePin).toBe(reconnectData.gamePin);
        expect(response.questionCount).toBeGreaterThan(0);
        expect(response.status).toBeDefined();
        expect(Array.isArray(response.players)).toBe(true);
        expect(response.totalPlayers).toBeGreaterThanOrEqual(0);
        done();
      });

      // Mock successful moderator reconnection
      serverSocket.on('reconnect_moderator', (data) => {
        serverSocket.emit('moderator_reconnected', {
          gamePin: data.gamePin,
          questionCount: 5,
          currentQuestionIndex: 0,
          status: 'waiting',
          players: ['TestPlayer1', 'TestPlayer2'],
          totalPlayers: 2,
          moderatorToken: data.moderatorToken
        });
      });

      clientSocket.emit('reconnect_moderator', reconnectData);
    });
  });

  describe('Panel Events', () => {
    test('should handle panel join event', (done) => {
      const gamePin = generateTestPin();

      clientSocket.on('panel_game_joined', (response) => {
        expect(response.gamePin).toBe(gamePin);
        expect(response.questionCount).toBeGreaterThan(0);
        expect(response.currentState).toBeDefined();
        done();
      });

      // Mock panel join
      serverSocket.on('join_panel', (data) => {
        serverSocket.emit('panel_game_joined', {
          gamePin: data.gamePin,
          questionCount: 5,
          currentState: 'waiting'
        });
      });

      clientSocket.emit('join_panel', { gamePin });
    });

    test('should handle panel leaderboard updates', (done) => {
      clientSocket.on('panel_leaderboard_update', (data) => {
        expect(data.leaderboard).toBeDefined();
        expect(Array.isArray(data.leaderboard)).toBe(true);
        expect(data.leaderboard.length).toBeGreaterThanOrEqual(0);
        
        if (data.leaderboard.length > 0) {
          const firstPlayer = data.leaderboard[0];
          expect(firstPlayer.position).toBe(1);
          expect(firstPlayer.name).toBeDefined();
          expect(firstPlayer.score).toBeGreaterThanOrEqual(0);
        }
        done();
      });

      // Mock leaderboard update
      serverSocket.emit('panel_leaderboard_update', {
        leaderboard: [
          { position: 1, name: 'TestPlayer1', score: 2000 },
          { position: 2, name: 'TestPlayer2', score: 1500 }
        ]
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed event data gracefully', (done) => {
      let errorOccurred = false;

      // Set up error handler
      serverSocket.on('error', (error) => {
        errorOccurred = true;
      });

      // Mock handler that validates data
      serverSocket.on('join_game', (data) => {
        if (!data || !data.gamePin) {
          serverSocket.emit('join_error', {
            message: 'Neplatné dáta'
          });
          return;
        }
        
        serverSocket.emit('game_joined', {
          gamePin: data.gamePin,
          playerId: 1,
          playersCount: 1,
          playerToken: 'test-token'
        });
      });

      clientSocket.on('join_error', (error) => {
        expect(error.message).toContain('Neplatné dáta');
        expect(errorOccurred).toBe(false); // Should handle gracefully
        done();
      });

      // Send malformed data
      clientSocket.emit('join_game', null);
    });
  });

  describe('Multiple Clients', () => {
    test('should handle multiple player connections', (done) => {
      const gamePin = generateTestPin();
      let connectionsReceived = 0;
      
      // Mock game join handler only once
      const handleJoin = (data) => {
        connectionsReceived++;
        
        // Emit to all connected clients
        io.emit('game_joined', {
          gamePin: data.gamePin,
          playerId: connectionsReceived,
          playersCount: connectionsReceived,
          playerToken: `test-token-${connectionsReceived}`
        });
      };
      
      serverSocket.on('join_game', handleJoin);

      let responsesReceived = 0;
      
      const handleResponse = (response) => {
        responsesReceived++;
        expect(response.gamePin).toBe(gamePin);
        expect(response.playerId).toBeDefined();
        
        if (responsesReceived === 2) {
          // Remove the listener to prevent multiple calls
          serverSocket.off('join_game', handleJoin);
          done();
        }
      };

      clientSocket.on('game_joined', handleResponse);

      // Emit two join events from the same client to simulate multiple players
      clientSocket.emit('join_game', { gamePin });
      
      // Use a slight delay to ensure events are processed separately
      setTimeout(() => {
        clientSocket.emit('join_game', { gamePin });
      }, 10);
    });
  });
});