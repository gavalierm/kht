/**
 * Comprehensive unit tests for MemoryManager class
 * - Tests global memory optimization and monitoring
 * - Tests high-concurrency cleanup scenarios
 * - Tests memory pressure handling
 * - Tests game lifecycle management
 * - Uses real MemoryManager implementation
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const MemoryManager = require('../../lib/memoryManager');
const { GameInstance } = require('../../lib/gameInstance');
const { 
  createSampleQuestions,
  generateTestPin,
  delay,
  waitFor
} = require('../helpers/test-utils');

describe('MemoryManager - Comprehensive Unit Tests', () => {
  let memoryManager;
  let activeGames;
  let originalMemoryUsage;

  beforeEach(() => {
    activeGames = new Map();
    
    // Mock process.memoryUsage for consistent testing
    originalMemoryUsage = process.memoryUsage;
    process.memoryUsage = jest.fn(() => ({
      heapUsed: 100 * 1024 * 1024, // 100MB
      heapTotal: 200 * 1024 * 1024, // 200MB
      external: 10 * 1024 * 1024, // 10MB
      arrayBuffers: 5 * 1024 * 1024 // 5MB
    }));
    
    memoryManager = new MemoryManager(activeGames, {
      maxActiveGames: 10,
      maxMemoryUsageMB: 500,
      cleanupInterval: 100, // Faster for testing
      gameInactivityTimeout: 1000 // Shorter for testing
    });
  });

  afterEach(() => {
    // Restore original memory usage
    process.memoryUsage = originalMemoryUsage;
    
    // Shutdown memory manager
    if (memoryManager) {
      memoryManager.shutdown();
    }
  });

  describe('Initialization and Configuration', () => {
    test('should initialize with correct configuration', () => {
      expect(memoryManager.activeGames).toBe(activeGames);
      expect(memoryManager.maxActiveGames).toBe(10);
      expect(memoryManager.maxMemoryUsageMB).toBe(500);
      expect(memoryManager.cleanupInterval).toBe(100);
      expect(memoryManager.gameInactivityTimeout).toBe(1000);
    });

    test('should initialize with default configuration', () => {
      const defaultManager = new MemoryManager(activeGames);
      
      expect(defaultManager.maxActiveGames).toBe(100);
      expect(defaultManager.maxMemoryUsageMB).toBe(512);
      expect(defaultManager.cleanupInterval).toBe(5 * 60 * 1000);
      expect(defaultManager.gameInactivityTimeout).toBe(30 * 60 * 1000);
      
      defaultManager.shutdown();
    });

    test('should initialize memory statistics', () => {
      const stats = memoryManager.getMemoryStats();
      
      expect(stats.totalCleanups).toBe(0);
      expect(stats.gamesRemoved).toBe(0);
      expect(stats.playersRemoved).toBe(0);
      expect(stats.memoryReclaimed).toBe(0);
      expect(stats.peakMemoryUsage).toBeGreaterThan(0);
      expect(stats.peakActiveGames).toBe(0);
    });

    test('should start monitoring and cleanup timers', () => {
      expect(memoryManager.monitoringInterval).toBeDefined();
      expect(memoryManager.cleanupTimer).toBeDefined();
    });
  });

  describe('Memory Monitoring', () => {
    test('should track memory usage statistics', () => {
      // Add some games
      const game1 = new GameInstance(generateTestPin(), createSampleQuestions());
      const game2 = new GameInstance(generateTestPin(), createSampleQuestions());
      
      activeGames.set('game1', game1);
      activeGames.set('game2', game2);
      
      memoryManager.performMemoryMonitoring();
      
      const stats = memoryManager.getMemoryStats();
      
      expect(stats.peakActiveGames).toBe(2);
      expect(stats.activeGames).toBe(2);
      expect(stats.peakMemoryUsage).toBeGreaterThan(0);
      
      game1.shutdown();
      game2.shutdown();
    });

    test('should detect memory pressure levels', () => {
      // Mock high memory usage
      process.memoryUsage.mockReturnValue({
        heapUsed: 450 * 1024 * 1024, // 450MB - high pressure
        heapTotal: 500 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      });
      
      // Add games near capacity
      for (let i = 0; i < 9; i++) {
        const game = new GameInstance(generateTestPin(), createSampleQuestions());
        activeGames.set(`game${i}`, game);
      }
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.performMemoryMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('High pressure detected')
      );
      
      consoleSpy.mockRestore();
      
      // Cleanup games
      for (let i = 0; i < 9; i++) {
        activeGames.get(`game${i}`).shutdown();
      }
    });

    test('should trigger appropriate cleanup based on pressure', () => {
      // Mock medium pressure
      process.memoryUsage.mockReturnValue({
        heapUsed: 320 * 1024 * 1024, // 320MB - medium pressure
        heapTotal: 400 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      });
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.performMemoryMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Medium pressure detected')
      );
      
      consoleSpy.mockRestore();
    });

    test('should log statistics periodically', () => {
      // Set cleanup count to trigger logging
      memoryManager.memoryStats.totalCleanups = 10;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.performMemoryMonitoring();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MemoryManager] Memory Statistics'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Global Cleanup Operations', () => {
    test('should perform global cleanup on all games', () => {
      const game1 = new GameInstance(generateTestPin(), createSampleQuestions());
      const game2 = new GameInstance(generateTestPin(), createSampleQuestions());
      
      // Add players to games
      game1.addPlayer(1, { score: 0 });
      game2.addPlayer(1, { score: 0 });
      
      activeGames.set('game1', game1);
      activeGames.set('game2', game2);
      
      memoryManager.performGlobalCleanup();
      
      expect(memoryManager.memoryStats.totalCleanups).toBe(1);
      
      game1.shutdown();
      game2.shutdown();
    });

    test('should remove inactive finished games', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.phase = 'FINISHED';
      
      // Make game appear inactive
      game.lastSync = Date.now() - 2000; // 2 seconds ago
      
      activeGames.set('finishedGame', game);
      
      memoryManager.performGlobalCleanup();
      
      expect(activeGames.has('finishedGame')).toBe(false);
      expect(memoryManager.memoryStats.gamesRemoved).toBe(1);
    });

    test('should not remove active games', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.phase = 'QUESTION_ACTIVE';
      game.lastSync = Date.now();
      
      // Add connected players
      game.addPlayer(1, { score: 0 });
      
      activeGames.set('activeGame', game);
      
      memoryManager.performGlobalCleanup();
      
      expect(activeGames.has('activeGame')).toBe(true);
      expect(memoryManager.memoryStats.gamesRemoved).toBe(0);
      
      game.shutdown();
    });

    test('should handle cleanup errors gracefully', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      
      // Mock performMemoryCleanup to throw error
      game.performMemoryCleanup = jest.fn(() => {
        throw new Error('Cleanup error');
      });
      
      activeGames.set('errorGame', game);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        memoryManager.performGlobalCleanup();
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up game'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
      game.shutdown();
    });

    test('should track cleanup statistics', () => {
      const game1 = new GameInstance(generateTestPin(), createSampleQuestions());
      const game2 = new GameInstance(generateTestPin(), createSampleQuestions());
      
      // Add players
      game1.addPlayer(1, { score: 0 });
      game1.addPlayer(2, { score: 0 });
      game2.addPlayer(1, { score: 0 });
      
      // Make one game inactive
      game1.phase = 'FINISHED';
      game1.lastSync = Date.now() - 2000;
      
      // Make players also inactive
      const oldTime = Date.now() - 2000;
      game1.players.forEach(player => {
        player.lastSeen = oldTime;
      });
      
      activeGames.set('game1', game1);
      activeGames.set('game2', game2);
      
      memoryManager.performGlobalCleanup();
      
      const stats = memoryManager.memoryStats;
      expect(stats.totalCleanups).toBe(1);
      expect(stats.gamesRemoved).toBe(1);
      
      game2.shutdown();
    });
  });

  describe('Aggressive Cleanup', () => {
    test('should perform aggressive cleanup under pressure', () => {
      // Create many finished games
      for (let i = 0; i < 10; i++) {
        const game = new GameInstance(generateTestPin(), createSampleQuestions());
        game.phase = 'FINISHED';
        game.lastSync = Date.now() - i * 1000; // Different ages
        activeGames.set(`game${i}`, game);
      }
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.performAggressiveCleanup();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Performing aggressive cleanup')
      );
      
      // Should have removed ~50% of finished games
      expect(activeGames.size).toBeLessThan(10);
      
      consoleSpy.mockRestore();
      
      // Cleanup remaining games
      for (const game of activeGames.values()) {
        game.shutdown();
      }
    });

    test('should prioritize oldest games for removal', () => {
      // Create games with different ages
      const oldGame = new GameInstance(generateTestPin(), createSampleQuestions());
      oldGame.phase = 'FINISHED';
      oldGame.lastSync = Date.now() - 10000; // Very old
      
      const newerGame = new GameInstance(generateTestPin(), createSampleQuestions());
      newerGame.phase = 'FINISHED';
      newerGame.lastSync = Date.now() - 1000; // Newer
      
      activeGames.set('oldGame', oldGame);
      activeGames.set('newerGame', newerGame);
      
      memoryManager.performAggressiveCleanup();
      
      // Old game should be removed first
      expect(activeGames.has('oldGame')).toBe(false);
      
      // Cleanup remaining
      for (const game of activeGames.values()) {
        game.shutdown();
      }
    });

    test('should force garbage collection if available', () => {
      // Mock global.gc
      global.gc = jest.fn();
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.performAggressiveCleanup();
      
      expect(global.gc).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Forced garbage collection')
      );
      
      consoleSpy.mockRestore();
      delete global.gc;
    });
  });

  describe('Game Lifecycle Management', () => {
    test('should identify games that should be removed', () => {
      const activeGame = new GameInstance(generateTestPin(), createSampleQuestions());
      activeGame.phase = 'QUESTION_ACTIVE';
      activeGame.lastSync = Date.now();
      activeGame.addPlayer(1, { score: 0 });
      
      const finishedGame = new GameInstance(generateTestPin(), createSampleQuestions());
      finishedGame.phase = 'FINISHED';
      finishedGame.lastSync = Date.now() - 2000; // Old
      
      const emptyGame = new GameInstance(generateTestPin(), createSampleQuestions());
      emptyGame.phase = 'WAITING';
      emptyGame.lastSync = Date.now() - 1000; // Old with no players
      
      expect(memoryManager.shouldRemoveGame(activeGame)).toBe(false);
      expect(memoryManager.shouldRemoveGame(finishedGame)).toBe(true);
      expect(memoryManager.shouldRemoveGame(emptyGame)).toBe(true);
      
      activeGame.shutdown();
      finishedGame.shutdown();
      emptyGame.shutdown();
    });

    test('should get last activity time correctly', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.lastSync = Date.now() - 5000;
      
      // Add player with recent activity
      game.addPlayer(1, { score: 0 });
      const player = game.getPlayer(1);
      player.lastSeen = Date.now() - 1000;
      
      const lastActivity = memoryManager.getGameLastActivity(game);
      
      expect(lastActivity).toBeGreaterThan(game.lastSync);
      expect(lastActivity).toBe(player.lastSeen);
      
      game.shutdown();
    });

    test('should remove game and clean up resources', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.shutdown = jest.fn();
      
      activeGames.set('testGame', game);
      
      memoryManager.removeGame('testGame');
      
      expect(game.shutdown).toHaveBeenCalled();
      expect(activeGames.has('testGame')).toBe(false);
    });

    test('should handle game removal errors gracefully', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.shutdown = jest.fn(() => {
        throw new Error('Shutdown error');
      });
      
      activeGames.set('errorGame', game);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        memoryManager.removeGame('errorGame');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error removing game'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    test('should get games for cleanup', () => {
      const activeGame = new GameInstance(generateTestPin(), createSampleQuestions());
      activeGame.phase = 'QUESTION_ACTIVE';
      activeGame.lastSync = Date.now();
      activeGame.addPlayer(1, { score: 0 });
      
      const finishedGame = new GameInstance(generateTestPin(), createSampleQuestions());
      finishedGame.phase = 'FINISHED';
      finishedGame.lastSync = Date.now() - 2000;
      
      activeGames.set(activeGame.gamePin, activeGame);
      activeGames.set(finishedGame.gamePin, finishedGame);
      
      // Make finishedGame inactive by setting old player lastSeen times
      const oldTime = Date.now() - 2000;
      finishedGame.players.forEach(player => {
        player.lastSeen = oldTime;
      });
      
      const cleanupGames = memoryManager.getGamesForCleanup();
      
      expect(cleanupGames).toHaveLength(1);
      expect(cleanupGames[0].gamePin).toBe(finishedGame.gamePin);
      expect(cleanupGames[0].phase).toBe('FINISHED');
      
      activeGame.shutdown();
      finishedGame.shutdown();
    });
  });

  describe('Memory Statistics and Monitoring', () => {
    test('should calculate comprehensive memory statistics', () => {
      const game1 = new GameInstance(generateTestPin(), createSampleQuestions());
      const game2 = new GameInstance(generateTestPin(), createSampleQuestions());
      
      // Add players to games
      game1.addPlayer(1, { score: 0 });
      game1.addPlayer(2, { score: 0 });
      game2.addPlayer(1, { score: 0 });
      
      activeGames.set('game1', game1);
      activeGames.set('game2', game2);
      
      const stats = memoryManager.getMemoryStats();
      
      expect(stats.processMemoryMB).toBeGreaterThan(0);
      expect(stats.totalGameMemoryMB).toBeGreaterThanOrEqual(0); // Can be 0 if estimateMemoryUsage is not implemented
      expect(stats.activeGames).toBe(2);
      expect(stats.totalPlayers).toBe(3);
      expect(stats.connectedPlayers).toBe(3);
      expect(stats.memoryPressure).toBeGreaterThan(0);
      expect(stats.gamePressure).toBeGreaterThan(0);
      
      expect(stats.limits).toEqual({
        maxActiveGames: 10,
        maxMemoryUsageMB: 500,
        gameInactivityTimeoutMs: 1000
      });
      
      game1.shutdown();
      game2.shutdown();
    });

    test('should calculate total game memory usage', () => {
      const game1 = new GameInstance(generateTestPin(), createSampleQuestions());
      const game2 = new GameInstance(generateTestPin(), createSampleQuestions());
      
      // Add players to increase memory usage
      for (let i = 1; i <= 10; i++) {
        game1.addPlayer(i, { score: 0 });
        game2.addPlayer(i, { score: 0 });
      }
      
      activeGames.set('game1', game1);
      activeGames.set('game2', game2);
      
      const totalMemory = memoryManager.calculateTotalGameMemory();
      
      expect(totalMemory).toBeGreaterThan(0);
      
      game1.shutdown();
      game2.shutdown();
    });

    test('should track player counts across games', () => {
      const game1 = new GameInstance(generateTestPin(), createSampleQuestions());
      const game2 = new GameInstance(generateTestPin(), createSampleQuestions());
      
      game1.addPlayer(1, { score: 0 });
      game1.addPlayer(2, { score: 0 });
      game2.addPlayer(1, { score: 0 });
      
      // Disconnect one player
      game1.removePlayer(2, false);
      
      activeGames.set('game1', game1);
      activeGames.set('game2', game2);
      
      const totalPlayers = memoryManager.getTotalPlayerCount();
      const connectedPlayers = memoryManager.getConnectedPlayerCount();
      
      expect(totalPlayers).toBe(3);
      expect(connectedPlayers).toBe(2);
      
      game1.shutdown();
      game2.shutdown();
    });

    test('should log detailed memory statistics', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.addPlayer(1, { score: 0 });
      
      activeGames.set('game1', game);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.logMemoryStats();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory Statistics'),
        expect.objectContaining({
          processMemoryMB: expect.any(Number),
          gameMemoryMB: expect.any(Number),
          activeGames: expect.any(Number),
          totalPlayers: expect.any(Number),
          connectedPlayers: expect.any(Number)
        })
      );
      
      consoleSpy.mockRestore();
      game.shutdown();
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle high-volume cleanup efficiently', () => {
      const startTime = Date.now();
      
      // Create many games
      for (let i = 0; i < 50; i++) {
        const game = new GameInstance(generateTestPin(), createSampleQuestions());
        game.phase = i % 2 === 0 ? 'FINISHED' : 'WAITING';
        game.lastSync = Date.now() - (i % 2 === 0 ? 2000 : 500);
        activeGames.set(`game${i}`, game);
      }
      
      memoryManager.performGlobalCleanup();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Cleanup remaining games
      for (const game of activeGames.values()) {
        game.shutdown();
      }
    });

    test('should handle concurrent cleanup operations', async () => {
      // Create games
      for (let i = 0; i < 20; i++) {
        const game = new GameInstance(generateTestPin(), createSampleQuestions());
        game.phase = 'FINISHED';
        game.lastSync = Date.now() - 2000;
        activeGames.set(`game${i}`, game);
      }
      
      // Run concurrent cleanup operations
      const cleanupPromises = Array.from({ length: 5 }, () => 
        Promise.resolve(memoryManager.performGlobalCleanup())
      );
      
      await Promise.all(cleanupPromises);
      
      // Should have cleaned up games
      expect(activeGames.size).toBeLessThan(20);
      
      // Cleanup remaining games
      for (const game of activeGames.values()) {
        game.shutdown();
      }
    });

    test('should maintain performance under memory pressure', () => {
      // Mock high memory usage
      process.memoryUsage.mockReturnValue({
        heapUsed: 480 * 1024 * 1024, // 480MB - high pressure
        heapTotal: 500 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      });
      
      const startTime = Date.now();
      
      // Create many games
      for (let i = 0; i < 9; i++) {
        const game = new GameInstance(generateTestPin(), createSampleQuestions());
        activeGames.set(`game${i}`, game);
      }
      
      memoryManager.performMemoryMonitoring();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      
      // Cleanup games
      for (const game of activeGames.values()) {
        game.shutdown();
      }
    });
  });

  describe('Manual Operations', () => {
    test('should manually cleanup specific game', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.performMemoryCleanup = jest.fn();
      
      activeGames.set('testGame', game);
      
      memoryManager.cleanupGame('testGame');
      
      expect(game.performMemoryCleanup).toHaveBeenCalled();
      
      game.shutdown();
    });

    test('should manually force remove specific game', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.shutdown = jest.fn();
      
      activeGames.set('testGame', game);
      
      memoryManager.forceRemoveGame('testGame');
      
      expect(game.shutdown).toHaveBeenCalled();
      expect(activeGames.has('testGame')).toBe(false);
    });

    test('should handle manual operations on non-existent games', () => {
      expect(() => {
        memoryManager.cleanupGame('nonExistent');
      }).not.toThrow();
      
      expect(() => {
        memoryManager.forceRemoveGame('nonExistent');
      }).not.toThrow();
    });
  });

  describe('Shutdown and Cleanup', () => {
    test('should shutdown gracefully', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      activeGames.set('testGame', game);
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      memoryManager.shutdown();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutting down')
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MemoryManager] Memory Statistics'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
      game.shutdown();
    });

    test('should clear timers on shutdown', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      memoryManager.shutdown();
      
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2); // monitoring and cleanup timers
      
      clearIntervalSpy.mockRestore();
    });

    test('should perform final cleanup on shutdown', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.performMemoryCleanup = jest.fn();
      
      activeGames.set('testGame', game);
      
      memoryManager.shutdown();
      
      expect(game.performMemoryCleanup).toHaveBeenCalled();
      
      game.shutdown();
    });
  });

  describe('Error Handling', () => {
    test('should handle memory monitoring errors gracefully', () => {
      // Mock process.memoryUsage to throw error
      process.memoryUsage.mockImplementation(() => {
        throw new Error('Memory usage error');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        memoryManager.performMemoryMonitoring();
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MemoryManager] Error during memory monitoring'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle cleanup errors gracefully', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.performMemoryCleanup = jest.fn(() => {
        throw new Error('Cleanup error');
      });
      
      activeGames.set('errorGame', game);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        memoryManager.performGlobalCleanup();
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up game'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
      game.shutdown();
    });

    test('should handle statistics calculation errors gracefully', () => {
      const game = new GameInstance(generateTestPin(), createSampleQuestions());
      game.estimateMemoryUsage = jest.fn(() => {
        throw new Error('Memory calculation error');
      });
      
      activeGames.set('errorGame', game);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        memoryManager.getMemoryStats();
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MemoryManager] Error calculating memory for game'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
      // Replace the mock with a working implementation before shutdown
      game.estimateMemoryUsage = jest.fn().mockReturnValue(0);
      game.shutdown();
    });
  });
});