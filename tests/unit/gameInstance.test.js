/**
 * Comprehensive unit tests for GameInstance class
 * - Tests real GameInstance implementation with Slovak context
 * - Covers memory management, player handling, and game flow
 * - Tests high-concurrency scenarios and edge cases
 * - Uses real data, minimal mocking
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const { GameInstance } = require('../../lib/gameInstance');
const { 
  createSampleQuestions, 
  createSamplePlayers, 
  generateTestPin,
  generateTestToken,
  createLatencyMap,
  delay,
  waitFor
} = require('../helpers/test-utils');
const { sampleQuestions, testScenarios } = require('../fixtures/sample-data');

describe('GameInstance - Comprehensive Unit Tests', () => {
  let game;
  let questions;
  let gamePin;
  let dbId;

  beforeEach(() => {
    questions = createSampleQuestions();
    gamePin = generateTestPin();
    dbId = Math.floor(Math.random() * 1000);
    
    game = new GameInstance(gamePin, questions, dbId);
  });

  afterEach(() => {
    if (game && typeof game.shutdown === 'function') {
      game.shutdown();
    }
  });

  describe('Initialization and Configuration', () => {
    test('should initialize with correct default values', () => {
      expect(game.gamePin).toBe(gamePin);
      expect(game.questions).toEqual(questions);
      expect(game.dbId).toBe(dbId);
      expect(game.phase).toBe('WAITING');
      expect(game.currentQuestionIndex).toBe(0);
      expect(game.players.size).toBe(0);
      expect(game.answers).toEqual([]);
      expect(game.playerJoinOrder).toBe(0);
    });

    test('should initialize with custom options', () => {
      const customOptions = {
        maxPlayers: 100,
        maxAnswersBuffer: 500,
        disconnectedPlayerTTL: 5 * 60 * 1000
      };
      
      const customGame = new GameInstance(gamePin, questions, dbId, customOptions);
      
      expect(customGame.maxPlayers).toBe(100);
      expect(customGame.maxAnswersBuffer).toBe(500);
      expect(customGame.disconnectedPlayerTTL).toBe(5 * 60 * 1000);
      
      customGame.shutdown();
    });

    test('should initialize memory statistics', () => {
      const stats = game.getMemoryStats();
      
      expect(stats.currentPlayers).toBe(0);
      expect(stats.connectedPlayers).toBe(0);
      expect(stats.totalPlayersJoined).toBe(0);
      expect(stats.totalAnswersSubmitted).toBe(0);
      expect(stats.peakPlayerCount).toBe(0);
      expect(stats.memoryCleanups).toBe(0);
    });
  });

  describe('Player Management', () => {
    test('should add player with provided name', () => {
      const playerData = {
        name: 'TestPlayer',
        score: 0,
        player_token: generateTestToken()
      };

      game.addPlayer(1, playerData);

      expect(game.players.size).toBe(1);
      expect(game.playerJoinOrder).toBe(1);
      
      const player = game.getPlayer(1);
      expect(player.name).toBe('TestPlayer'); // Should use provided name
      expect(player.score).toBe(0);
      expect(player.connected).toBe(true);
      expect(player.joinOrder).toBe(1);
      expect(game.playerTokens.get(1)).toBe(playerData.player_token);
    });

    test('should generate Slovak name when no name provided', () => {
      const playerData = {
        score: 0,
        player_token: generateTestToken()
      };

      game.addPlayer(1, playerData);

      const player = game.getPlayer(1);
      expect(player.name).toBe('Hráč 1'); // Should generate Slovak name
      expect(player.joinOrder).toBe(1);
    });

    test('should add multiple players in correct order', () => {
      const players = createSamplePlayers(5);
      
      players.forEach((playerData, index) => {
        game.addPlayer(index + 1, playerData);
      });

      expect(game.players.size).toBe(5);
      expect(game.playerJoinOrder).toBe(5);
      
      for (let i = 1; i <= 5; i++) {
        const player = game.getPlayer(i);
        expect(player.name).toBe(`Hráč ${i}`);
        expect(player.joinOrder).toBe(i);
      }
    });

    test('should handle player reconnection', () => {
      // Add initial player
      const playerData = {
        name: 'TestPlayer',
        score: 1000,
        player_token: generateTestToken()
      };
      
      game.addPlayer(1, playerData);
      
      // Simulate disconnection
      game.removePlayer(1, false);
      expect(game.getPlayer(1).connected).toBe(false);
      
      // Simulate reconnection
      const reconnectData = {
        score: 1500,
        player_token: playerData.player_token
      };
      
      game.addPlayer(1, reconnectData);
      
      const player = game.getPlayer(1);
      expect(player.connected).toBe(true);
      expect(player.score).toBe(1500);
      expect(player.name).toBe('TestPlayer'); // Name should remain consistent
    });

    test('should enforce maximum player limit', () => {
      const maxPlayers = 10;
      const gameWithLimit = new GameInstance(gamePin, questions, dbId, { maxPlayers });
      
      // Add maximum number of players
      for (let i = 1; i <= maxPlayers; i++) {
        gameWithLimit.addPlayer(i, { score: 0 });
      }
      
      // Attempt to add one more player
      expect(() => {
        gameWithLimit.addPlayer(maxPlayers + 1, { score: 0 });
      }).toThrow('Game capacity reached');
      
      gameWithLimit.shutdown();
    });

    test('should handle player disconnection gracefully', () => {
      game.addPlayer(1, { name: 'TestPlayer', score: 100 });
      
      // Temporary disconnection
      game.removePlayer(1, false);
      
      const player = game.getPlayer(1);
      expect(player.connected).toBe(false);
      expect(player.name).toBe('TestPlayer'); // Data should be preserved
      expect(player.score).toBe(100);
    });

    test('should handle permanent player removal', () => {
      game.addPlayer(1, { name: 'TestPlayer', score: 100 });
      
      // Add player to answers
      game.phase = 'QUESTION_ACTIVE';
      game.questionStartTime = Date.now();
      game.submitAnswer(1, 0, new Map());
      
      expect(game.answers.length).toBe(1);
      
      // Permanent removal
      game.removePlayer(1, true);
      
      expect(game.players.has(1)).toBe(false);
      expect(game.playerTokens.has(1)).toBe(false);
      expect(game.answers.length).toBe(0); // Should be cleaned from answers
    });
  });

  describe('Socket Management', () => {
    test('should manage player sockets correctly', () => {
      const playerId = 1;
      const socketId = 'socket_123';
      
      game.addPlayer(playerId, { score: 0 });
      game.setPlayerSocket(playerId, socketId);
      
      expect(game.getPlayerSocket(playerId)).toBe(socketId);
      expect(game.playerSockets.get(playerId)).toBe(socketId);
    });

    test('should prevent duplicate socket mappings', () => {
      game.addPlayer(1, { score: 0 });
      game.addPlayer(2, { score: 0 });
      
      const socketId = 'socket_123';
      
      // Assign socket to first player
      game.setPlayerSocket(1, socketId);
      expect(game.getPlayerSocket(1)).toBe(socketId);
      
      // Assign same socket to second player
      game.setPlayerSocket(2, socketId);
      expect(game.getPlayerSocket(2)).toBe(socketId);
      expect(game.getPlayerSocket(1)).toBeUndefined(); // Should be cleaned up
    });

    test('should clean up socket references on disconnection', () => {
      const playerId = 1;
      const socketId = 'socket_123';
      
      game.addPlayer(playerId, { score: 0 });
      game.setPlayerSocket(playerId, socketId);
      
      game.removePlayer(playerId, false);
      
      expect(game.getPlayerSocket(playerId)).toBeUndefined();
    });
  });

  describe('Question Management', () => {
    test('should get current question correctly', () => {
      const currentQuestion = game.getCurrentQuestion();
      expect(currentQuestion).toEqual(questions[0]);
      expect(currentQuestion.question).toBe('Aké je hlavné mesto Slovenska?');
    });

    test('should return null when no more questions', () => {
      game.currentQuestionIndex = 999;
      const currentQuestion = game.getCurrentQuestion();
      expect(currentQuestion).toBeNull();
    });

    test('should advance to next question', () => {
      const result = game.nextQuestion();
      
      expect(result).toBe(true);
      expect(game.currentQuestionIndex).toBe(1);
      expect(game.answers).toEqual([]);
      expect(game.phase).toBe('WAITING');
      expect(game.questionStartTime).toBeNull();
    });

    test('should finish game when no more questions', () => {
      // Set to last question
      game.currentQuestionIndex = questions.length - 1;
      
      const result = game.nextQuestion();
      
      expect(result).toBe(false);
      expect(game.phase).toBe('FINISHED');
    });

    test('should handle question progression through full game', () => {
      for (let i = 0; i < questions.length; i++) {
        expect(game.getCurrentQuestion()).toEqual(questions[i]);
        expect(game.currentQuestionIndex).toBe(i);
        
        if (i < questions.length - 1) {
          expect(game.nextQuestion()).toBe(true);
        } else {
          expect(game.nextQuestion()).toBe(false);
          expect(game.phase).toBe('FINISHED');
        }
      }
    });
  });

  describe('Answer Submission and Management', () => {
    beforeEach(() => {
      // Set up active question
      game.phase = 'QUESTION_ACTIVE';
      game.questionStartTime = Date.now() - 1000; // Question started 1 second ago
      
      // Add test players
      game.addPlayer(1, { name: 'TestPlayer1', score: 0 });
      game.addPlayer(2, { name: 'TestPlayer2', score: 0 });
      
      // Set up socket mappings for latency calculation
      game.setPlayerSocket(1, 'socket_1');
      game.setPlayerSocket(2, 'socket_2');
    });

    test('should submit answer correctly', () => {
      const latencies = createLatencyMap();
      latencies.addSocket('socket_1');
      
      const answerData = game.submitAnswer(1, 0, latencies.getLatencies());
      
      expect(answerData).toBeTruthy();
      expect(answerData.playerId).toBe(1);
      expect(answerData.answer).toBe(0);
      expect(answerData.responseTime).toBeGreaterThan(0);
      expect(game.answers.length).toBe(1);
      expect(game.memoryStats.totalAnswersSubmitted).toBe(1);
    });

    test('should prevent duplicate answers from same player', () => {
      const latencies = createLatencyMap();
      latencies.addSocket('socket_1');
      
      const firstAnswer = game.submitAnswer(1, 0, latencies.getLatencies());
      const secondAnswer = game.submitAnswer(1, 1, latencies.getLatencies()); // Attempt to answer again
      
      expect(firstAnswer).toBeTruthy();
      expect(secondAnswer).toBeNull(); // Should reject duplicate
      expect(game.answers.length).toBe(1);
      expect(game.answers[0].answer).toBe(0); // Should keep first answer
    });

    test('should handle latency compensation', () => {
      const latencies = new Map();
      latencies.set('socket_1', 200); // 200ms latency
      
      const answerData = game.submitAnswer(1, 0, latencies);
      
      expect(answerData).toBeTruthy();
      expect(answerData.timestamp).toBeLessThan(Date.now());
      expect(answerData.responseTime).toBeGreaterThan(0);
    });

    test('should handle answers from multiple players', () => {
      const latencies = createLatencyMap();
      latencies.addSocket('socket_1');
      latencies.addSocket('socket_2');
      
      const answer1 = game.submitAnswer(1, 0, latencies.getLatencies());
      const answer2 = game.submitAnswer(2, 1, latencies.getLatencies());
      
      expect(answer1).toBeTruthy();
      expect(answer2).toBeTruthy();
      expect(game.answers.length).toBe(2);
      
      expect(game.answers[0].playerId).toBe(1);
      expect(game.answers[1].playerId).toBe(2);
    });

    test('should handle non-existent player gracefully', () => {
      const latencies = createLatencyMap();
      const answerData = game.submitAnswer(999, 0, latencies.getLatencies());
      
      expect(answerData).toBeNull();
      expect(game.answers.length).toBe(0);
    });

    test('should reject answers when no question is active', () => {
      game.phase = 'WAITING';
      game.questionStartTime = null;
      
      const latencies = createLatencyMap();
      latencies.addSocket('socket_1');
      
      const answerData = game.submitAnswer(1, 0, latencies.getLatencies());
      
      expect(answerData).toBeNull();
      expect(game.answers.length).toBe(0);
    });

    test('should use circular buffer for answers to prevent memory leaks', () => {
      const smallBufferGame = new GameInstance(gamePin, questions, dbId, { maxAnswersBuffer: 3 });
      smallBufferGame.phase = 'QUESTION_ACTIVE';
      smallBufferGame.questionStartTime = Date.now();
      
      // Add more players than buffer size
      for (let i = 1; i <= 5; i++) {
        smallBufferGame.addPlayer(i, { score: 0 });
        smallBufferGame.setPlayerSocket(i, `socket_${i}`);
      }
      
      const latencies = createLatencyMap();
      for (let i = 1; i <= 5; i++) {
        latencies.addSocket(`socket_${i}`);
      }
      
      // Submit more answers than buffer size
      for (let i = 1; i <= 5; i++) {
        smallBufferGame.submitAnswer(i, 0, latencies.getLatencies());
      }
      
      expect(smallBufferGame.answers.length).toBe(3); // Should not exceed buffer size
      expect(smallBufferGame.totalAnswers).toBe(5); // Should track total
      
      smallBufferGame.shutdown();
    });
  });

  describe('Scoring System', () => {
    test('should calculate correct score for fast correct answer', () => {
      const responseTime = 1000; // 1 second
      const score = game.calculateScore(responseTime, true, 30);
      
      expect(score).toBeGreaterThanOrEqual(1000); // At least base score
      expect(score).toBeLessThanOrEqual(1500); // Max possible score
    });

    test('should calculate correct score for slow correct answer', () => {
      const responseTime = 25000; // 25 seconds (near time limit)
      const score = game.calculateScore(responseTime, true, 30);
      
      expect(score).toBeGreaterThan(1000); // Should have some speed bonus
      expect(score).toBeLessThan(1200); // But not much
    });

    test('should return zero for incorrect answer', () => {
      const score = game.calculateScore(1000, false, 30);
      expect(score).toBe(0);
    });

    test('should handle overtime answers', () => {
      const responseTime = 35000; // Over time limit
      const score = game.calculateScore(responseTime, true, 30);
      
      expect(score).toBeGreaterThanOrEqual(1000); // At least base score
    });

    test('should scale scoring fairly with different time limits', () => {
      const responseTime = 5000; // 5 seconds
      
      // Different time limits
      const scoreShort = game.calculateScore(responseTime, true, 10);
      const scoreNormal = game.calculateScore(responseTime, true, 30);
      const scoreLong = game.calculateScore(responseTime, true, 60);
      
      expect(scoreLong).toBeGreaterThan(scoreNormal);
      expect(scoreNormal).toBeGreaterThan(scoreShort);
    });

    test('should handle edge cases in scoring', () => {
      // Zero response time
      expect(game.calculateScore(0, true, 30)).toBeGreaterThan(1000);
      
      // Negative response time (should be handled)
      expect(game.calculateScore(-1000, true, 30)).toBeGreaterThan(1000);
      
      // Very large response time
      expect(game.calculateScore(1000000, true, 30)).toBe(1000);
    });
  });

  describe('Leaderboard Generation', () => {
    beforeEach(() => {
      // Add players with different scores
      game.addPlayer(1, { name: 'Player1', score: 2500 });
      game.addPlayer(2, { name: 'Player2', score: 1200 });
      game.addPlayer(3, { name: 'Player3', score: 1800 });
      game.addPlayer(4, { name: 'Player4', score: 2500 }); // Tie for first
      
      // Update actual scores
      game.getPlayer(1).score = 2500;
      game.getPlayer(2).score = 1200;
      game.getPlayer(3).score = 1800;
      game.getPlayer(4).score = 2500;
    });

    test('should return leaderboard sorted by score', () => {
      const leaderboard = game.getLeaderboard();
      
      expect(leaderboard).toHaveLength(4);
      expect(leaderboard[0].score).toBe(2500);
      expect(leaderboard[1].score).toBe(2500);
      expect(leaderboard[2].score).toBe(1800);
      expect(leaderboard[3].score).toBe(1200);
      
      // Check positions
      expect(leaderboard[0].position).toBe(1);
      expect(leaderboard[1].position).toBe(2);
      expect(leaderboard[2].position).toBe(3);
      expect(leaderboard[3].position).toBe(4);
    });

    test('should include all players regardless of connection status', () => {
      // Disconnect some players
      game.removePlayer(2, false);
      game.removePlayer(3, false);
      
      const leaderboard = game.getLeaderboard();
      
      expect(leaderboard).toHaveLength(4); // All players should be included
      expect(leaderboard.find(p => p.playerId === 2)).toBeDefined();
      expect(leaderboard.find(p => p.playerId === 3)).toBeDefined();
    });

    test('should cache leaderboard for performance', () => {
      const leaderboard1 = game.getLeaderboard();
      const leaderboard2 = game.getLeaderboard();
      
      expect(leaderboard1).toBe(leaderboard2); // Should return same object reference
    });

    test('should invalidate cache when players change', () => {
      const leaderboard1 = game.getLeaderboard();
      
      // Add new player
      game.addPlayer(5, { name: 'Player5', score: 3000 });
      
      const leaderboard2 = game.getLeaderboard();
      
      expect(leaderboard1).not.toBe(leaderboard2); // Should be different objects
      expect(leaderboard2).toHaveLength(5);
      expect(leaderboard2[0].score).toBe(3000);
    });
  });

  describe('Memory Management', () => {
    test('should track memory statistics', () => {
      game.addPlayer(1, { score: 0 });
      game.addPlayer(2, { score: 0 });
      game.addPlayer(3, { score: 0 });
      
      const stats = game.getMemoryStats();
      
      expect(stats.currentPlayers).toBe(3);
      expect(stats.totalPlayersJoined).toBe(3);
      expect(stats.peakPlayerCount).toBe(3);
      expect(stats.socketMappings).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsageEstimate).toBeGreaterThan(0);
    });

    test('should perform periodic cleanup', () => {
      const oldCleanupTime = game.lastCleanupTime;
      game.lastCleanupTime = Date.now() - 70000; // Force cleanup
      
      // Add disconnected player
      game.addPlayer(1, { score: 0 });
      game.removePlayer(1, false);
      
      // Set disconnection time to past TTL
      game.getPlayer(1).lastSeen = Date.now() - game.disconnectedPlayerTTL - 1000;
      
      game.performMemoryCleanup();
      
      expect(game.players.has(1)).toBe(false); // Should be cleaned up
      expect(game.memoryStats.memoryCleanups).toBe(1);
    });

    test('should estimate memory usage', () => {
      game.addPlayer(1, { score: 0 });
      game.addPlayer(2, { score: 0 });
      
      const memoryUsage = game.estimateMemoryUsage();
      expect(memoryUsage).toBeGreaterThan(0);
      
      // Adding more players should increase memory usage
      game.addPlayer(3, { score: 0 });
      game.addPlayer(4, { score: 0 });
      
      const newMemoryUsage = game.estimateMemoryUsage();
      expect(newMemoryUsage).toBeGreaterThan(memoryUsage);
    });

    test('should handle memory cleanup edge cases', () => {
      // Should not crash with empty game
      expect(() => game.performMemoryCleanup()).not.toThrow();
      
      // Should handle players without lastSeen
      game.addPlayer(1, { score: 0 });
      delete game.getPlayer(1).lastSeen;
      
      expect(() => game.performMemoryCleanup()).not.toThrow();
    });
  });

  describe('Game State Management', () => {
    test('should return correct game state', () => {
      game.phase = 'QUESTION_ACTIVE';
      game.currentQuestionIndex = 2;
      game.questionStartTime = 123456789;
      
      const state = game.getState();
      
      expect(state.status).toBe('question_active');
      expect(state.currentQuestionIndex).toBe(2);
      expect(state.questionStartTime).toBe(123456789);
    });

    test('should handle all game phases', () => {
      const phases = ['WAITING', 'QUESTION_ACTIVE', 'RESULTS', 'FINISHED'];
      
      phases.forEach(phase => {
        game.phase = phase;
        const state = game.getState();
        expect(state.status).toBe(phase.toLowerCase());
      });
    });

    test('should track player counts correctly', () => {
      expect(game.getConnectedPlayerCount()).toBe(0);
      
      game.addPlayer(1, { score: 0 });
      game.addPlayer(2, { score: 0 });
      expect(game.getConnectedPlayerCount()).toBe(2);
      
      game.removePlayer(1, false); // Disconnect
      expect(game.getConnectedPlayerCount()).toBe(1);
      
      game.removePlayer(2, true); // Remove permanently
      expect(game.getConnectedPlayerCount()).toBe(0);
    });

    test('should get connected players list', () => {
      game.addPlayer(1, { score: 0 });
      game.addPlayer(2, { score: 0 });
      game.addPlayer(3, { score: 0 });
      
      game.removePlayer(2, false); // Disconnect player 2
      
      const connectedPlayers = game.getConnectedPlayers();
      expect(connectedPlayers).toHaveLength(2);
      expect(connectedPlayers.find(p => p.id === 1)).toBeDefined();
      expect(connectedPlayers.find(p => p.id === 3)).toBeDefined();
      expect(connectedPlayers.find(p => p.id === 2)).toBeUndefined();
    });
  });

  describe('High-Concurrency Scenarios', () => {
    test('should handle rapid player additions', async () => {
      const playerCount = 50;
      const players = Array.from({ length: playerCount }, (_, i) => ({
        id: i + 1,
        score: 0
      }));
      
      // Add players concurrently
      const addPromises = players.map(player => 
        Promise.resolve(game.addPlayer(player.id, player))
      );
      
      await Promise.all(addPromises);
      
      expect(game.players.size).toBe(playerCount);
      expect(game.getConnectedPlayerCount()).toBe(playerCount);
      expect(game.memoryStats.totalPlayersJoined).toBe(playerCount);
    });

    test('should handle rapid answer submissions', async () => {
      const playerCount = 20;
      
      // Set up game state
      game.phase = 'QUESTION_ACTIVE';
      game.questionStartTime = Date.now();
      
      // Add players
      const latencies = createLatencyMap();
      for (let i = 1; i <= playerCount; i++) {
        game.addPlayer(i, { score: 0 });
        game.setPlayerSocket(i, `socket_${i}`);
        latencies.addSocket(`socket_${i}`);
      }
      
      // Submit answers concurrently
      const answerPromises = Array.from({ length: playerCount }, (_, i) => 
        Promise.resolve(game.submitAnswer(i + 1, i % 4, latencies.getLatencies()))
      );
      
      const results = await Promise.all(answerPromises);
      
      const successfulAnswers = results.filter(r => r !== null);
      expect(successfulAnswers).toHaveLength(playerCount);
      expect(game.answers.length).toBe(Math.min(playerCount, game.maxAnswersBuffer));
    });

    test('should maintain performance under memory pressure', () => {
      const startTime = Date.now();
      
      // Add many players
      for (let i = 1; i <= 100; i++) {
        game.addPlayer(i, { score: Math.random() * 1000 });
      }
      
      // Generate leaderboard multiple times
      for (let i = 0; i < 10; i++) {
        game.getLeaderboard();
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
      
      const memoryUsage = game.estimateMemoryUsage();
      expect(memoryUsage).toBeLessThan(1024 * 1024); // Should be under 1MB
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid player IDs gracefully', () => {
      expect(() => game.addPlayer(null, { score: 0 })).not.toThrow();
      expect(() => game.addPlayer(undefined, { score: 0 })).not.toThrow();
      expect(() => game.removePlayer(999)).not.toThrow();
      expect(() => game.getPlayer(999)).not.toThrow();
    });

    test('should handle invalid answer data gracefully', () => {
      game.phase = 'QUESTION_ACTIVE';
      game.questionStartTime = Date.now();
      game.addPlayer(1, { score: 0 });
      
      const latencies = createLatencyMap();
      
      // Invalid answer values
      expect(game.submitAnswer(1, -1, latencies.getLatencies())).toBeTruthy();
      expect(game.submitAnswer(1, 999, latencies.getLatencies())).toBeNull(); // Duplicate
    });

    test('should handle memory cleanup edge cases', () => {
      // Empty game
      expect(() => game.performMemoryCleanup()).not.toThrow();
      
      // Players without required properties
      game.players.set(999, { id: 999 }); // Missing required properties
      expect(() => game.performMemoryCleanup()).not.toThrow();
    });

    test('should handle shutdown gracefully', () => {
      game.addPlayer(1, { score: 0 });
      game.addPlayer(2, { score: 0 });
      
      expect(() => game.shutdown()).not.toThrow();
      
      expect(game.players.size).toBe(0);
      expect(game.playerSockets.size).toBe(0);
      expect(game.playerTokens.size).toBe(0);
      expect(game.answers).toHaveLength(0);
    });
  });

  describe('Integration with Database Sync', () => {
    test('should prepare state for database sync', () => {
      game.phase = 'QUESTION_ACTIVE';
      game.currentQuestionIndex = 2;
      game.questionStartTime = Date.now();
      
      const state = game.getState();
      
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('currentQuestionIndex');
      expect(state).toHaveProperty('questionStartTime');
      expect(typeof state.status).toBe('string');
      expect(typeof state.currentQuestionIndex).toBe('number');
    });

    test('should track sync timing', async () => {
      const initialSyncTime = game.lastSync;
      
      // Add a small delay to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 1));
      
      // Mock database sync
      const mockDb = {
        updateGameState: jest.fn()
      };
      
      await game.syncToDatabase(mockDb);
      
      expect(game.lastSync).toBeGreaterThanOrEqual(initialSyncTime);
      expect(mockDb.updateGameState).toHaveBeenCalled();
    });
  });
});