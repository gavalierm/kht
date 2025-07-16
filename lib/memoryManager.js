/**
 * Memory Manager - Global memory optimization and monitoring for high-concurrency
 * 
 * Manages memory usage across all active games and provides monitoring/cleanup
 * capabilities to prevent memory leaks and optimize performance.
 */

class MemoryManager {
  constructor(activeGames, options = {}) {
    this.activeGames = activeGames;
    
    // Configuration
    this.maxActiveGames = options.maxActiveGames || 100;
    this.maxMemoryUsageMB = options.maxMemoryUsageMB || 512; // 512MB limit
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes
    this.gameInactivityTimeout = options.gameInactivityTimeout || 30 * 60 * 1000; // 30 minutes
    
    // Monitoring
    this.memoryStats = {
      totalCleanups: 0,
      gamesRemoved: 0,
      playersRemoved: 0,
      memoryReclaimed: 0,
      peakMemoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // Initialize with current memory usage
      peakActiveGames: 0
    };
    
    // Start monitoring
    this.monitoringInterval = setInterval(() => {
      this.performMemoryMonitoring();
    }, this.cleanupInterval);
    
    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.performGlobalCleanup();
    }, this.cleanupInterval);
    
    console.log('[MemoryManager] Initialized with limits:', {
      maxActiveGames: this.maxActiveGames,
      maxMemoryMB: this.maxMemoryUsageMB,
      cleanupIntervalMs: this.cleanupInterval
    });
  }

  /**
   * Monitor memory usage and trigger cleanup if needed
   */
  performMemoryMonitoring() {
    try {
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    
    // Update peak usage
    this.memoryStats.peakMemoryUsage = Math.max(this.memoryStats.peakMemoryUsage, memoryUsageMB);
    this.memoryStats.peakActiveGames = Math.max(this.memoryStats.peakActiveGames, this.activeGames.size);
    
    // Check memory thresholds
    const memoryPressure = memoryUsageMB / this.maxMemoryUsageMB;
    const gamePressure = this.activeGames.size / this.maxActiveGames;
    
    // Trigger aggressive cleanup if under pressure
    if (memoryPressure > 0.8 || gamePressure > 0.8) {
      console.log(`[MemoryManager] High pressure detected - Memory: ${memoryUsageMB.toFixed(1)}MB (${(memoryPressure * 100).toFixed(1)}%), Games: ${this.activeGames.size} (${(gamePressure * 100).toFixed(1)}%)`);
      this.performAggressiveCleanup();
    } else if (memoryPressure > 0.6 || gamePressure > 0.6) {
      console.log(`[MemoryManager] Medium pressure detected - triggering normal cleanup`);
      this.performGlobalCleanup();
    }
    
    // Log statistics periodically
    if (this.memoryStats.totalCleanups % 10 === 0) {
      this.logMemoryStats();
    }
    } catch (error) {
      console.error(`[MemoryManager] Error during memory monitoring:`, error);
    }
  }

  /**
   * Perform global cleanup across all games
   */
  performGlobalCleanup() {
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    
    let gamesRemoved = 0;
    let playersRemoved = 0;
    
    // Clean up individual games
    for (const [gamePin, game] of this.activeGames.entries()) {
      try {
        // Trigger game-level memory cleanup
        const initialPlayerCount = game.players.size;
        game.performMemoryCleanup();
        const finalPlayerCount = game.players.size;
        playersRemoved += (initialPlayerCount - finalPlayerCount);
        
        // Remove finished games that are inactive
        if (this.shouldRemoveGame(game)) {
          this.removeGame(gamePin);
          gamesRemoved++;
        }
      } catch (error) {
        console.error(`[MemoryManager] Error cleaning up game ${gamePin}:`, error);
      }
    }
    
    const endTime = Date.now();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryReclaimed = Math.max(0, initialMemory - finalMemory);
    
    // Update statistics
    this.memoryStats.totalCleanups++;
    this.memoryStats.gamesRemoved += gamesRemoved;
    this.memoryStats.playersRemoved += playersRemoved;
    this.memoryStats.memoryReclaimed += memoryReclaimed;
    
    if (gamesRemoved > 0 || playersRemoved > 0) {
      console.log(`[MemoryManager] Cleanup completed in ${endTime - startTime}ms:`, {
        gamesRemoved,
        playersRemoved,
        memoryReclaimedKB: Math.round(memoryReclaimed / 1024),
        activeGames: this.activeGames.size
      });
    }
  }

  /**
   * Perform aggressive cleanup under memory pressure
   */
  performAggressiveCleanup() {
    console.log('[MemoryManager] Performing aggressive cleanup...');
    
    // Remove oldest finished games first
    const finishedGames = [];
    for (const [gamePin, game] of this.activeGames.entries()) {
      if (game.phase === 'FINISHED') {
        finishedGames.push({ gamePin, game, lastActivity: this.getGameLastActivity(game) });
      }
    }
    
    // Sort by last activity (oldest first)
    finishedGames.sort((a, b) => a.lastActivity - b.lastActivity);
    
    // Remove up to 50% of finished games
    const toRemove = Math.ceil(finishedGames.length * 0.5);
    for (let i = 0; i < toRemove; i++) {
      this.removeGame(finishedGames[i].gamePin);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[MemoryManager] Forced garbage collection');
    }
    
    // Perform normal cleanup
    this.performGlobalCleanup();
  }

  /**
   * Determine if a game should be removed
   */
  shouldRemoveGame(game) {
    const now = Date.now();
    const lastActivity = this.getGameLastActivity(game);
    const inactiveTime = now - lastActivity;
    
    // Remove finished games after inactivity timeout
    if (game.phase === 'FINISHED' && inactiveTime > this.gameInactivityTimeout) {
      return true;
    }
    
    // Remove games with no connected players for extended period
    if (game.getConnectedPlayerCount() === 0 && inactiveTime > (this.gameInactivityTimeout / 2)) {
      return true;
    }
    
    return false;
  }

  /**
   * Get last activity time for a game
   */
  getGameLastActivity(game) {
    let lastActivity = game.lastSync || 0;
    
    // Check player activity
    const connectedPlayers = game.getConnectedPlayers();
    for (const player of connectedPlayers) {
      if (player.lastSeen) {
        lastActivity = Math.max(lastActivity, player.lastSeen);
      }
    }
    
    return lastActivity;
  }

  /**
   * Remove a game and clean up all resources
   */
  removeGame(gamePin) {
    const game = this.activeGames.get(gamePin);
    if (!game) return;
    
    try {
      // Shutdown game and clean up resources
      if (typeof game.shutdown === 'function') {
        game.shutdown();
      }
      
      // Remove from active games
      this.activeGames.delete(gamePin);
      
      console.log(`[MemoryManager] Removed inactive game: ${gamePin}`);
    } catch (error) {
      console.error(`[MemoryManager] Error removing game ${gamePin}:`, error);
    }
  }

  /**
   * Get comprehensive memory statistics
   */
  getMemoryStats() {
    const processMemory = process.memoryUsage();
    const totalGameMemory = this.calculateTotalGameMemory();
    
    return {
      // Process memory
      processMemoryMB: Math.round(processMemory.heapUsed / 1024 / 1024),
      processMemoryUsedMB: Math.round(processMemory.heapUsed / 1024 / 1024),
      processMemoryTotalMB: Math.round(processMemory.heapTotal / 1024 / 1024),
      
      // Game memory
      totalGameMemoryMB: Math.round(totalGameMemory / 1024 / 1024),
      activeGames: this.activeGames.size,
      
      // Player statistics
      totalPlayers: this.getTotalPlayerCount(),
      connectedPlayers: this.getConnectedPlayerCount(),
      
      // Cleanup statistics
      ...this.memoryStats,
      
      // Pressure indicators
      memoryPressure: (processMemory.heapUsed / 1024 / 1024) / this.maxMemoryUsageMB,
      gamePressure: this.activeGames.size / this.maxActiveGames,
      
      // Configuration
      limits: {
        maxActiveGames: this.maxActiveGames,
        maxMemoryUsageMB: this.maxMemoryUsageMB,
        gameInactivityTimeoutMs: this.gameInactivityTimeout
      }
    };
  }

  /**
   * Calculate total memory usage across all games
   */
  calculateTotalGameMemory() {
    let totalMemory = 0;
    
    for (const game of this.activeGames.values()) {
      if (typeof game.estimateMemoryUsage === 'function') {
        try {
          totalMemory += game.estimateMemoryUsage();
        } catch (error) {
          console.error(`[MemoryManager] Error calculating memory for game ${game.gamePin}:`, error);
        }
      }
    }
    
    return totalMemory;
  }

  /**
   * Get total player count across all games
   */
  getTotalPlayerCount() {
    let totalPlayers = 0;
    
    for (const game of this.activeGames.values()) {
      totalPlayers += game.players.size;
    }
    
    return totalPlayers;
  }

  /**
   * Get connected player count across all games
   */
  getConnectedPlayerCount() {
    let connectedPlayers = 0;
    
    for (const game of this.activeGames.values()) {
      connectedPlayers += game.getConnectedPlayerCount();
    }
    
    return connectedPlayers;
  }

  /**
   * Log detailed memory statistics
   */
  logMemoryStats() {
    const stats = this.getMemoryStats();
    
    console.log('[MemoryManager] Memory Statistics:', {
      processMemoryMB: stats.processMemoryMB,
      gameMemoryMB: stats.totalGameMemoryMB,
      activeGames: stats.activeGames,
      totalPlayers: stats.totalPlayers,
      connectedPlayers: stats.connectedPlayers,
      memoryPressure: `${(stats.memoryPressure * 100).toFixed(1)}%`,
      gamePressure: `${(stats.gamePressure * 100).toFixed(1)}%`,
      cleanups: stats.totalCleanups,
      gamesRemoved: stats.gamesRemoved,
      playersRemoved: stats.playersRemoved
    });
  }

  /**
   * Force cleanup of specific game
   */
  cleanupGame(gamePin) {
    const game = this.activeGames.get(gamePin);
    if (game && typeof game.performMemoryCleanup === 'function') {
      game.performMemoryCleanup();
    }
  }

  /**
   * Force cleanup and remove specific game
   */
  forceRemoveGame(gamePin) {
    this.removeGame(gamePin);
  }

  /**
   * Get games that should be cleaned up
   */
  getGamesForCleanup() {
    const games = [];
    
    for (const [gamePin, game] of this.activeGames.entries()) {
      if (this.shouldRemoveGame(game)) {
        games.push({
          gamePin,
          phase: game.phase,
          players: game.getConnectedPlayerCount(),
          lastActivity: this.getGameLastActivity(game),
          memoryUsage: typeof game.estimateMemoryUsage === 'function' ? game.estimateMemoryUsage() : 0
        });
      }
    }
    
    return games;
  }

  /**
   * Shutdown memory manager
   */
  shutdown() {
    console.log('[MemoryManager] Shutting down...');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Final cleanup
    this.performGlobalCleanup();
    
    // Log final statistics
    this.logMemoryStats();
  }
}

module.exports = MemoryManager;