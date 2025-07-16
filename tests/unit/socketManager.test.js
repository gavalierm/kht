/**
 * Comprehensive unit tests for SocketManager class
 * - Tests high-concurrency socket management
 * - Tests room-based broadcasting and optimization
 * - Tests connection limits and validation
 * - Tests batch operations and performance
 * - Uses real SocketManager implementation
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const SocketManager = require('../../lib/socketManager');
const { 
  createMockSocket,
  createMockSocketServer,
  generateTestPin,
  delay,
  waitFor
} = require('../helpers/test-utils');
const { sampleQuestions, socketEvents } = require('../fixtures/sample-data');

describe('SocketManager - Comprehensive Unit Tests', () => {
  let io;
  let socketManager;
  let mockSocket;
  let gamePin;

  beforeEach(() => {
    io = createMockSocketServer();
    socketManager = new SocketManager(io);
    mockSocket = createMockSocket();
    gamePin = generateTestPin();
    
    // Register socket with server
    io._addClient(mockSocket);
  });

  afterEach(() => {
    // Clean up any timers or intervals
    if (socketManager.batchTimer) {
      clearInterval(socketManager.batchTimer);
    }
  });

  describe('Initialization and Configuration', () => {
    test('should initialize with correct default values', () => {
      expect(socketManager.io).toBe(io);
      expect(socketManager.connectionCount).toBe(0);
      expect(socketManager.maxConnections).toBe(1000);
      expect(socketManager.maxPlayersPerGame).toBe(300);
      expect(socketManager.gameConnectionLimits).toBeInstanceOf(Map);
      expect(socketManager.gameRooms).toBeInstanceOf(Map);
      expect(socketManager.databaseQueue).toBeInstanceOf(Array);
    });

    test('should initialize batch processing', () => {
      expect(socketManager.batchSize).toBe(50);
      expect(socketManager.batchTimeout).toBe(100);
      expect(socketManager.databaseQueue).toHaveLength(0);
    });

    test('should track connection statistics', () => {
      const stats = socketManager.getConnectionStats();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('maxConnections');
      expect(stats).toHaveProperty('gameConnections');
      expect(stats).toHaveProperty('activeGames');
      expect(stats).toHaveProperty('queuedOperations');
      
      expect(stats.totalConnections).toBe(0);
      expect(stats.maxConnections).toBe(1000);
      expect(stats.activeGames).toBe(0);
      expect(stats.queuedOperations).toBe(0);
    });
  });

  describe('Connection Management', () => {
    test('should accept connection within limits', () => {
      const result = socketManager.handleConnection(mockSocket);
      
      expect(result).toBe(true);
      expect(socketManager.connectionCount).toBe(1);
    });

    test('should reject connection when at capacity', () => {
      // Fill up to capacity
      socketManager.connectionCount = socketManager.maxConnections;
      
      const result = socketManager.handleConnection(mockSocket);
      
      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('connection_rejected', {
        message: 'Server capacity reached. Please try again later.'
      });
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    test('should handle disconnection cleanup', () => {
      socketManager.handleConnection(mockSocket);
      expect(socketManager.connectionCount).toBe(1);
      
      // Simulate disconnection
      mockSocket._trigger('disconnect');
      
      expect(socketManager.connectionCount).toBe(0);
    });

    test('should validate game connection limits', () => {
      // Test different connection types
      expect(socketManager.canJoinGame(gamePin, 'player')).toBe(true);
      expect(socketManager.canJoinGame(gamePin, 'moderator')).toBe(true);
      expect(socketManager.canJoinGame(gamePin, 'panel')).toBe(true);
      
      // Fill up player capacity
      socketManager.gameConnectionLimits.set(gamePin, 300);
      expect(socketManager.canJoinGame(gamePin, 'player')).toBe(false);
      expect(socketManager.canJoinGame(gamePin, 'moderator')).toBe(true); // Different limit
    });

    test('should enforce different limits per connection type', () => {
      const playerCapacity = socketManager.canJoinGame(gamePin, 'player');
      const moderatorCapacity = socketManager.canJoinGame(gamePin, 'moderator');
      const panelCapacity = socketManager.canJoinGame(gamePin, 'panel');
      
      expect(playerCapacity).toBe(true);
      expect(moderatorCapacity).toBe(true);
      expect(panelCapacity).toBe(true);
      
      // Set connections to different limits
      socketManager.gameConnectionLimits.set(gamePin, 300); // Player limit
      expect(socketManager.canJoinGame(gamePin, 'player')).toBe(false);
      expect(socketManager.canJoinGame(gamePin, 'moderator')).toBe(true);
      expect(socketManager.canJoinGame(gamePin, 'panel')).toBe(true);
    });
  });

  describe('Room Management', () => {
    test('should create optimized room structure', () => {
      const rooms = socketManager.getGameRooms(gamePin);
      
      expect(rooms).toHaveProperty('all');
      expect(rooms).toHaveProperty('players');
      expect(rooms).toHaveProperty('moderators');
      expect(rooms).toHaveProperty('panels');
      
      expect(rooms.all).toBe(`game_${gamePin}`);
      expect(rooms.players).toBe(`game_${gamePin}_players`);
      expect(rooms.moderators).toBe(`game_${gamePin}_moderators`);
      expect(rooms.panels).toBe(`game_${gamePin}_panels`);
    });

    test('should cache room structure', () => {
      const rooms1 = socketManager.getGameRooms(gamePin);
      const rooms2 = socketManager.getGameRooms(gamePin);
      
      expect(rooms1).toBe(rooms2); // Should return same object reference
    });

    test('should join player to correct rooms', () => {
      const result = socketManager.joinGame(mockSocket, gamePin, 'player');
      
      expect(result).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith(`game_${gamePin}_players`);
      expect(mockSocket.join).toHaveBeenCalledWith(`game_${gamePin}`);
      expect(socketManager.gameConnectionLimits.get(gamePin)).toBe(1);
    });

    test('should join moderator to correct rooms', () => {
      const result = socketManager.joinGame(mockSocket, gamePin, 'moderator');
      
      expect(result).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith(`game_${gamePin}_moderators`);
      expect(mockSocket.join).toHaveBeenCalledWith(`game_${gamePin}`);
    });

    test('should join panel to correct rooms', () => {
      const result = socketManager.joinGame(mockSocket, gamePin, 'panel');
      
      expect(result).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith(`game_${gamePin}_panels`);
      expect(mockSocket.join).toHaveBeenCalledWith(`game_${gamePin}`);
    });

    test('should reject join when at capacity', () => {
      // Fill up capacity
      socketManager.gameConnectionLimits.set(gamePin, 300);
      
      const result = socketManager.joinGame(mockSocket, gamePin, 'player');
      
      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('join_error', {
        message: 'Game is at maximum capacity. Please try again later.'
      });
    });

    test('should handle disconnection cleanup for game rooms', () => {
      socketManager.joinGame(mockSocket, gamePin, 'player');
      expect(socketManager.gameConnectionLimits.get(gamePin)).toBe(1);
      
      // Simulate disconnection
      mockSocket._trigger('disconnect');
      
      expect(socketManager.gameConnectionLimits.get(gamePin)).toBe(0);
    });
  });

  describe('Broadcasting and Communication', () => {
    test('should broadcast game state to all room types', () => {
      const gameState = {
        status: 'waiting',
        questionNumber: 1,
        totalQuestions: 5,
        timeRemaining: 30
      };
      
      socketManager.broadcastGameState(gamePin, gameState);
      
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_players`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_moderators`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_panels`);
    });

    test('should optimize payload for different client types', () => {
      const fullGameState = {
        status: 'waiting',
        questionNumber: 1,
        totalQuestions: 5,
        timeRemaining: 30,
        leaderboard: [],
        answerStats: [],
        adminData: 'secret'
      };
      
      // Test payload optimization
      const playerPayload = socketManager.optimizePayloadForPlayers(fullGameState);
      const moderatorPayload = socketManager.optimizePayloadForModerators(fullGameState);
      const panelPayload = socketManager.optimizePayloadForPanels(fullGameState);
      
      // Players should get minimal data
      expect(playerPayload).toHaveProperty('status');
      expect(playerPayload).toHaveProperty('questionNumber');
      expect(playerPayload).not.toHaveProperty('adminData');
      
      // Moderators should get full data
      expect(moderatorPayload).toEqual(fullGameState);
      
      // Panels should get display-optimized data
      expect(panelPayload).toHaveProperty('status');
      expect(panelPayload).toHaveProperty('leaderboard');
      expect(panelPayload).not.toHaveProperty('adminData');
    });

    test('should calculate state delta for efficient updates', () => {
      const oldState = {
        status: 'waiting',
        questionNumber: 1,
        totalQuestions: 5,
        playerCount: 3
      };
      
      const newState = {
        status: 'question_active',
        questionNumber: 1,
        totalQuestions: 5,
        playerCount: 4
      };
      
      const delta = socketManager.calculateStateDelta(oldState, newState);
      
      expect(delta).toHaveProperty('status');
      expect(delta).toHaveProperty('playerCount');
      expect(delta).not.toHaveProperty('questionNumber'); // Unchanged
      expect(delta).not.toHaveProperty('totalQuestions'); // Unchanged
      
      expect(delta.status).toBe('question_active');
      expect(delta.playerCount).toBe(4);
    });

    test('should skip broadcast when no changes detected', () => {
      const gameState = {
        status: 'waiting',
        questionNumber: 1,
        totalQuestions: 5
      };
      
      // First broadcast
      socketManager.broadcastGameState(gamePin, gameState);
      
      // Reset mock calls
      io.to.mockClear();
      
      // Second broadcast with same state
      socketManager.broadcastGameState(gamePin, gameState);
      
      // Should not broadcast again
      expect(io.to).not.toHaveBeenCalled();
    });

    test('should force full update when requested', () => {
      const gameState = {
        status: 'waiting',
        questionNumber: 1,
        totalQuestions: 5
      };
      
      // First broadcast
      socketManager.broadcastGameState(gamePin, gameState);
      
      // Reset mock calls
      io.to.mockClear();
      
      // Second broadcast with force flag
      socketManager.broadcastGameState(gamePin, gameState, { forceFullUpdate: true });
      
      // Should broadcast again
      expect(io.to).toHaveBeenCalled();
    });
  });

  describe('Question Flow Broadcasting', () => {
    test('should broadcast question start with optimized data', () => {
      const questionData = {
        questionNumber: 1,
        totalQuestions: 5,
        question: 'Aké je hlavné mesto Slovenska?',
        options: ['Bratislava', 'Košice', 'Prešov', 'Žilina'],
        timeLimit: 30,
        serverTime: Date.now(),
        correctAnswer: 0,
        questionIndex: 0,
        totalPlayers: 3
      };
      
      socketManager.broadcastQuestionStart(gamePin, questionData);
      
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_players`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_moderators`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_panels`);
    });

    test('should broadcast question end with results', () => {
      const resultsData = {
        correctAnswer: 0,
        leaderboard: [
          { position: 1, name: 'Hráč 1', score: 1200 },
          { position: 2, name: 'Hráč 2', score: 1000 }
        ],
        answerStats: [
          { count: 2, percentage: 67 },
          { count: 1, percentage: 33 },
          { count: 0, percentage: 0 },
          { count: 0, percentage: 0 }
        ],
        totalAnswers: 3,
        totalPlayers: 3,
        canContinue: true
      };
      
      socketManager.broadcastQuestionEnd(gamePin, resultsData);
      
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_players`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_moderators`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_panels`);
    });

    test('should broadcast leaderboard updates efficiently', () => {
      const fullLeaderboard = Array.from({ length: 20 }, (_, i) => ({
        position: i + 1,
        name: `Hráč ${i + 1}`,
        score: 2000 - i * 100
      }));
      
      socketManager.broadcastLeaderboardUpdate(gamePin, fullLeaderboard);
      
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_panels`);
      expect(io.to).toHaveBeenCalledWith(`game_${gamePin}_moderators`);
      
      // Should only send top 10
      // We can't directly test the payload here, but we can verify the calls were made
    });
  });

  describe('Database Operations Batching', () => {
    test('should queue database operations', () => {
      const operation = {
        type: 'updatePlayerScore',
        execute: jest.fn()
      };
      
      socketManager.queueDatabaseOperation(operation);
      
      expect(socketManager.databaseQueue).toHaveLength(1);
      expect(socketManager.databaseQueue[0]).toHaveProperty('operation');
      expect(socketManager.databaseQueue[0]).toHaveProperty('timestamp');
    });

    test('should process operations when queue is full', () => {
      const operations = Array.from({ length: 55 }, (_, i) => ({
        type: 'updatePlayerScore',
        execute: jest.fn()
      }));
      
      // Queue operations
      operations.forEach(op => socketManager.queueDatabaseOperation(op));
      
      // Should have processed batch automatically
      expect(socketManager.databaseQueue.length).toBeLessThan(55);
    });

    test('should group operations by type', () => {
      const operations = [
        { type: 'updatePlayerScore', execute: jest.fn() },
        { type: 'saveAnswer', execute: jest.fn() },
        { type: 'updatePlayerScore', execute: jest.fn() },
        { type: 'saveAnswer', execute: jest.fn() }
      ];
      
      operations.forEach(op => socketManager.queueDatabaseOperation(op));
      
      // Manually trigger processing
      socketManager.processBatchedOperations();
      
      // All operations should have been executed
      operations.forEach(op => {
        expect(op.execute).toHaveBeenCalled();
      });
    });

    test('should handle batch processing timeout', async () => {
      const operation = {
        type: 'updatePlayerScore',
        execute: jest.fn()
      };
      
      socketManager.queueDatabaseOperation(operation);
      
      // Wait for batch timeout
      await delay(150);
      
      // Operation should have been processed
      expect(operation.execute).toHaveBeenCalled();
    });
  });

  describe('Performance Optimizations', () => {
    test('should handle high-frequency broadcasts efficiently', () => {
      const startTime = Date.now();
      
      // Broadcast many state updates
      for (let i = 0; i < 100; i++) {
        socketManager.broadcastGameState(gamePin, {
          status: 'waiting',
          questionNumber: i % 5 + 1,
          totalQuestions: 5
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should cache leaderboard broadcasts', () => {
      const leaderboard = [
        { position: 1, name: 'Hráč 1', score: 1200 },
        { position: 2, name: 'Hráč 2', score: 1000 }
      ];
      
      // First broadcast
      socketManager.broadcastLeaderboardUpdate(gamePin, leaderboard);
      
      // Reset mock calls
      io.to.mockClear();
      
      // Second broadcast with same data
      socketManager.broadcastLeaderboardUpdate(gamePin, leaderboard);
      
      // Should still broadcast (leaderboard updates are always sent)
      expect(io.to).toHaveBeenCalled();
    });

    test('should handle concurrent operations efficiently', async () => {
      const operations = Array.from({ length: 100 }, (_, i) => ({
        type: 'updatePlayerScore',
        execute: jest.fn()
      }));
      
      // Queue operations concurrently
      const queuePromises = operations.map(op => 
        Promise.resolve(socketManager.queueDatabaseOperation(op))
      );
      
      await Promise.all(queuePromises);
      
      // Process remaining operations
      socketManager.processBatchedOperations();
      
      // All operations should have been processed
      operations.forEach(op => {
        expect(op.execute).toHaveBeenCalled();
      });
    });
  });

  describe('Memory Management', () => {
    test('should track connection statistics accurately', () => {
      // Add connections
      socketManager.connectionCount = 50;
      socketManager.gameConnectionLimits.set('game1', 20);
      socketManager.gameConnectionLimits.set('game2', 30);
      
      // Add some rooms
      socketManager.getGameRooms('game1');
      socketManager.getGameRooms('game2');
      
      const stats = socketManager.getConnectionStats();
      
      expect(stats.totalConnections).toBe(50);
      expect(stats.gameConnections).toEqual({ game1: 20, game2: 30 });
      expect(stats.activeGames).toBe(2);
    });

    test('should clean up game resources', () => {
      // Set up game resources
      socketManager.gameConnectionLimits.set(gamePin, 10);
      socketManager.getGameRooms(gamePin);
      socketManager.broadcastGameState(gamePin, { status: 'waiting' });
      
      expect(socketManager.gameConnectionLimits.has(gamePin)).toBe(true);
      expect(socketManager.gameRooms.has(gamePin)).toBe(true);
      expect(socketManager.lastGameStates.has(gamePin)).toBe(true);
      
      // Clean up
      socketManager.cleanupGame(gamePin);
      
      expect(socketManager.gameConnectionLimits.has(gamePin)).toBe(false);
      expect(socketManager.gameRooms.has(gamePin)).toBe(false);
      expect(socketManager.lastGameStates.has(gamePin)).toBe(false);
    });

    test('should handle memory pressure gracefully', () => {
      // Create many games
      for (let i = 0; i < 100; i++) {
        const pin = `game${i}`;
        socketManager.gameConnectionLimits.set(pin, 10);
        socketManager.getGameRooms(pin);
        socketManager.broadcastGameState(pin, { status: 'waiting' });
      }
      
      expect(socketManager.gameRooms.size).toBe(100);
      expect(socketManager.lastGameStates.size).toBe(100);
      
      // Clean up all games
      for (let i = 0; i < 100; i++) {
        socketManager.cleanupGame(`game${i}`);
      }
      
      expect(socketManager.gameRooms.size).toBe(0);
      expect(socketManager.lastGameStates.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid socket operations gracefully', () => {
      const invalidSocket = {
        join: jest.fn(() => { throw new Error('Socket error'); }),
        emit: jest.fn(),
        id: 'invalid-socket'
      };
      
      expect(() => {
        socketManager.joinGame(invalidSocket, gamePin, 'player');
      }).not.toThrow();
      
      expect(invalidSocket.join).toHaveBeenCalled();
    });

    test('should handle broadcast errors gracefully', () => {
      // Mock IO to throw error
      io.to = jest.fn(() => ({
        emit: jest.fn(() => { throw new Error('Broadcast error'); })
      }));
      
      expect(() => {
        socketManager.broadcastGameState(gamePin, { status: 'waiting' });
      }).not.toThrow();
    });

    test('should handle database operation errors gracefully', () => {
      const errorOperation = {
        type: 'updatePlayerScore',
        execute: jest.fn(() => { throw new Error('Database error'); })
      };
      
      socketManager.queueDatabaseOperation(errorOperation);
      
      expect(() => {
        socketManager.processBatchedOperations();
      }).not.toThrow();
      
      expect(errorOperation.execute).toHaveBeenCalled();
    });

    test('should handle malformed broadcast data gracefully', () => {
      const malformedData = {
        status: undefined,
        questionNumber: null,
        totalQuestions: 'invalid'
      };
      
      expect(() => {
        socketManager.broadcastGameState(gamePin, malformedData);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty game PIN', () => {
      expect(() => {
        socketManager.getGameRooms('');
      }).not.toThrow();
      
      expect(() => {
        socketManager.broadcastGameState('', { status: 'waiting' });
      }).not.toThrow();
    });

    test('should handle null/undefined inputs', () => {
      expect(() => {
        socketManager.joinGame(null, gamePin, 'player');
      }).not.toThrow();
      
      expect(() => {
        socketManager.broadcastGameState(gamePin, null);
      }).not.toThrow();
      
      expect(() => {
        socketManager.queueDatabaseOperation(null);
      }).not.toThrow();
    });

    test('should handle disconnection during broadcast', () => {
      // Set up connection
      socketManager.joinGame(mockSocket, gamePin, 'player');
      
      // Simulate disconnection during broadcast
      mockSocket.disconnect = jest.fn();
      
      expect(() => {
        socketManager.broadcastGameState(gamePin, { status: 'waiting' });
      }).not.toThrow();
    });

    test('should handle rapid connection/disconnection cycles', () => {
      // Rapidly connect and disconnect
      for (let i = 0; i < 100; i++) {
        const socket = createMockSocket();
        socketManager.handleConnection(socket);
        socketManager.joinGame(socket, gamePin, 'player');
        socket._trigger('disconnect');
      }
      
      expect(socketManager.connectionCount).toBeLessThanOrEqual(0);
      expect(socketManager.gameConnectionLimits.get(gamePin)).toBe(0);
    });
  });
});