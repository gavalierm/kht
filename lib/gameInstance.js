/**
 * GameInstance class for high-concurrency (250+ players)
 * 
 * Features:
 * - Memory-efficient player data structures
 * - Bounded data structures with automatic cleanup
 * - Cached leaderboard calculation
 * - Circular buffer for answers to prevent memory leaks
 * - Lazy initialization of expensive operations
 * - Performance monitoring and statistics
 */

class GameInstance {
  constructor(gamePin, questions, dbId = null, options = {}) {
    this.gamePin = gamePin;
    this.questions = questions;
    this.dbId = dbId;
    
    // Memory-optimized player storage
    this.players = new Map(); // playerId -> compact player data
    this.playerSockets = new Map(); // playerId -> socketId (separate for memory efficiency)
    this.playerTokens = new Map(); // playerId -> token (separate mapping)
    
    // Circular buffer for answers to prevent unbounded growth
    this.maxAnswersBuffer = options.maxAnswersBuffer || 1000;
    this.answers = [];
    this.answerIndex = 0;
    this.totalAnswers = 0;
    
    // Game state
    this.phase = 'WAITING'; // WAITING, QUESTION_ACTIVE, RESULTS, FINISHED
    this.currentQuestionIndex = 0;
    this.questionStartTime = null;
    this.moderatorSocket = null;
    this.timeLimit = 30;
    this.lastSync = Date.now();
    this.playerJoinOrder = 0;
    
    // Performance optimization caches
    this.leaderboardCache = null;
    this.leaderboardCacheTime = 0;
    this.leaderboardCacheTTL = 1000; // 1 second cache
    
    this.playerCountCache = null;
    this.playerCountCacheTime = 0;
    
    // Memory management settings
    this.maxPlayers = options.maxPlayers || 300;
    this.disconnectedPlayerTTL = options.disconnectedPlayerTTL || 10 * 60 * 1000; // 10 minutes
    this.lastCleanupTime = Date.now();
    this.cleanupInterval = 60 * 1000; // Cleanup every minute
    
    // Statistics tracking
    this.memoryStats = {
      peakPlayerCount: 0,
      totalPlayersJoined: 0,
      totalAnswersSubmitted: 0,
      memoryCleanups: 0
    };
  }

  /**
   * Add player with memory-optimized storage
   */
  addPlayer(playerId, playerData) {
    // Check capacity limit
    if (this.players.size >= this.maxPlayers && !this.players.has(playerId)) {
      throw new Error(`Game capacity reached. Maximum ${this.maxPlayers} players allowed.`);
    }

    // Check if player already exists (reconnection case)
    const existingPlayer = this.players.get(playerId);
    if (existingPlayer) {
      // Player reconnecting - update minimal data
      existingPlayer.score = playerData.score || existingPlayer.score;
      existingPlayer.connected = true;
      existingPlayer.lastSeen = Date.now();
      this.playerTokens.set(playerId, playerData.player_token || this.playerTokens.get(playerId));
      this.invalidatePlayerCountCache();
      return;
    }
    
    // New player - increment join order and generate name
    this.playerJoinOrder++;
    const playerName = playerData.name || `Hráč ${this.playerJoinOrder}`;
    
    // Store only essential player data to minimize memory usage
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      score: playerData.score || 0,
      connected: true,
      joinOrder: this.playerJoinOrder,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });
    
    // Store socket and token separately for memory efficiency
    if (playerData.player_token) {
      this.playerTokens.set(playerId, playerData.player_token);
    }
    
    // Update statistics
    this.memoryStats.totalPlayersJoined++;
    this.memoryStats.peakPlayerCount = Math.max(this.memoryStats.peakPlayerCount, this.players.size);
    
    this.invalidateCaches();
  }

  /**
   * Remove or disconnect player with memory cleanup
   */
  removePlayer(playerId, permanent = false) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    if (permanent) {
      // Permanent removal - clean up all references
      this.players.delete(playerId);
      this.playerSockets.delete(playerId);
      this.playerTokens.delete(playerId);
      
      // Remove from answers buffer
      this.removePlayerFromAnswers(playerId);
    } else {
      // Temporary disconnection
      player.connected = false;
      player.lastSeen = Date.now();
      this.playerSockets.delete(playerId); // Remove socket reference immediately
    }
    
    this.invalidateCaches();
  }

  /**
   * Set player socket with automatic cleanup of old references
   */
  setPlayerSocket(playerId, socketId) {
    // Remove any existing socket mappings for this player to prevent memory leaks
    for (const [pid, sid] of this.playerSockets.entries()) {
      if (sid === socketId && pid !== playerId) {
        this.playerSockets.delete(pid);
      }
    }
    
    if (socketId) {
      this.playerSockets.set(playerId, socketId);
    } else {
      this.playerSockets.delete(playerId);
    }
  }

  /**
   * Get player socket with automatic cleanup
   */
  getPlayerSocket(playerId) {
    return this.playerSockets.get(playerId);
  }

  /**
   * Current question with caching
   */
  getCurrentQuestion() {
    return this.questions[this.currentQuestionIndex] || null;
  }

  /**
   * Submit answer with circular buffer and memory optimization
   */
  submitAnswer(playerId, answer, playerLatencies) {
    const serverTime = Date.now();
    const player = this.players.get(playerId);
    if (!player) return null;
    
    const socketId = this.playerSockets.get(playerId);
    const playerLatency = socketId ? (playerLatencies.get(socketId) || 0) : 0;
    
    // Time compensation and bucketing
    const compensatedTime = serverTime - (playerLatency / 2);
    const bucketedTime = Math.floor(compensatedTime / 50) * 50;
    
    // Check if player already answered (circular buffer search)
    if (this.hasPlayerAnswered(playerId)) {
      return null;
    }
    
    // Check if question is active (questionStartTime should be set)
    if (!this.questionStartTime) {
      console.warn(`Answer submitted for player ${playerId} but no question is active`);
      return null;
    }
    
    const answerData = {
      playerId: playerId,
      answer: answer,
      timestamp: bucketedTime,
      responseTime: bucketedTime - this.questionStartTime
    };
    
    // Add to circular buffer
    this.addAnswerToBuffer(answerData);
    
    // Update player last seen
    player.lastSeen = Date.now();
    
    // Update statistics
    this.memoryStats.totalAnswersSubmitted++;
    
    return answerData;
  }

  /**
   * Add answer to circular buffer to prevent memory leaks
   */
  addAnswerToBuffer(answerData) {
    if (this.answers.length < this.maxAnswersBuffer) {
      this.answers.push(answerData);
    } else {
      // Circular buffer - overwrite oldest entry
      this.answers[this.answerIndex] = answerData;
      this.answerIndex = (this.answerIndex + 1) % this.maxAnswersBuffer;
    }
    this.totalAnswers++;
  }

  /**
   * Check if player has answered current question (optimized search)
   */
  hasPlayerAnswered(playerId) {
    // For small answer counts, linear search is fastest
    return this.answers.some(a => a.playerId === playerId);
  }

  /**
   * Remove player from answers buffer (for permanent player removal)
   */
  removePlayerFromAnswers(playerId) {
    for (let i = this.answers.length - 1; i >= 0; i--) {
      if (this.answers[i].playerId === playerId) {
        this.answers.splice(i, 1);
      }
    }
  }

  /**
   * Calculate score (unchanged from original)
   */
  calculateScore(responseTime, isCorrect, questionTimeLimit) {
    if (!isCorrect) return 0;
    
    const baseScore = 1000;
    const maxSpeedBonus = 500;
    const timeLimit = questionTimeLimit || this.timeLimit;
    const speedBonus = Math.max(0, maxSpeedBonus - (responseTime / (timeLimit * 1000) * maxSpeedBonus));
    
    return Math.round(baseScore + speedBonus);
  }

  /**
   * Get leaderboard with caching for performance
   */
  getLeaderboard(force = false) {
    const now = Date.now();
    
    // Return cached leaderboard if still valid
    if (!force && this.leaderboardCache && (now - this.leaderboardCacheTime) < this.leaderboardCacheTTL) {
      return this.leaderboardCache;
    }
    
    // Calculate new leaderboard
    // Include all players who have participated, regardless of connection status or score
    // This ensures disconnected players who answered questions are still included in final results
    this.leaderboardCache = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        score: player.score,
        playerId: player.id
      }));
    
    this.leaderboardCacheTime = now;
    return this.leaderboardCache;
  }

  /**
   * Get connected player count with caching
   */
  getConnectedPlayerCount() {
    const now = Date.now();
    
    if (this.playerCountCache === null || (now - this.playerCountCacheTime) > 5000) {
      this.playerCountCache = Array.from(this.players.values()).filter(p => p.connected).length;
      this.playerCountCacheTime = now;
    }
    
    return this.playerCountCache;
  }

  /**
   * Advance to next question with memory cleanup
   */
  nextQuestion() {
    this.currentQuestionIndex++;
    
    // Clear answers for new question
    this.answers = [];
    this.answerIndex = 0;
    this.questionStartTime = null;
    
    if (this.currentQuestionIndex >= this.questions.length) {
      this.phase = 'FINISHED';
      return false;
    }
    
    this.phase = 'WAITING';
    this.invalidateCaches();
    return true;
  }

  /**
   * Invalidate all caches
   */
  invalidateCaches() {
    this.leaderboardCache = null;
    this.invalidatePlayerCountCache();
  }

  /**
   * Invalidate player count cache
   */
  invalidatePlayerCountCache() {
    this.playerCountCache = null;
  }

  /**
   * Periodic memory cleanup to prevent memory leaks
   */
  performMemoryCleanup() {
    const now = Date.now();
    
    // Only cleanup if enough time has passed
    if (now - this.lastCleanupTime < this.cleanupInterval) {
      return;
    }
    
    let removedPlayers = 0;
    
    // Remove permanently disconnected players after TTL
    for (const [playerId, player] of this.players.entries()) {
      if (!player.connected && (now - player.lastSeen) > this.disconnectedPlayerTTL) {
        this.removePlayer(playerId, true);
        removedPlayers++;
      }
    }
    
    // Clean up orphaned socket mappings
    for (const [playerId, socketId] of this.playerSockets.entries()) {
      if (!this.players.has(playerId)) {
        this.playerSockets.delete(playerId);
      }
    }
    
    // Clean up orphaned token mappings
    for (const playerId of this.playerTokens.keys()) {
      if (!this.players.has(playerId)) {
        this.playerTokens.delete(playerId);
      }
    }
    
    this.lastCleanupTime = now;
    this.memoryStats.memoryCleanups++;
    
    if (removedPlayers > 0) {
      console.log(`[Memory Cleanup] Game ${this.gamePin}: Removed ${removedPlayers} disconnected players`);
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return {
      ...this.memoryStats,
      currentPlayers: this.players.size,
      connectedPlayers: this.getConnectedPlayerCount(),
      currentAnswers: this.answers.length,
      socketMappings: this.playerSockets.size,
      tokenMappings: this.playerTokens.size,
      memoryUsageEstimate: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage in bytes
   */
  estimateMemoryUsage() {
    const playerSize = 200; // Estimated bytes per player object
    const answerSize = 50; // Estimated bytes per answer
    const mappingSize = 50; // Estimated bytes per mapping
    
    return (
      (this.players.size * playerSize) +
      (this.answers.length * answerSize) +
      (this.playerSockets.size * mappingSize) +
      (this.playerTokens.size * mappingSize)
    );
  }

  /**
   * Get state for database sync (unchanged)
   */
  getState() {
    return {
      status: this.phase.toLowerCase(),
      currentQuestionIndex: this.currentQuestionIndex,
      questionStartTime: this.questionStartTime
    };
  }

  /**
   * Sync to database with automatic cleanup trigger
   */
  async syncToDatabase(db) {
    if (this.dbId) {
      try {
        db.updateGameState(this.dbId, this.getState());
        this.lastSync = Date.now();
        
        // Trigger memory cleanup during sync
        this.performMemoryCleanup();
      } catch (error) {
        console.error('Failed to sync game to database:', error);
      }
    }
  }

  /**
   * Force garbage collection and cleanup (for testing/debugging)
   */
  forceCleanup() {
    this.performMemoryCleanup();
    this.invalidateCaches();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Get player by ID with automatic cleanup check
   */
  getPlayer(playerId) {
    const player = this.players.get(playerId);
    if (player && !player.connected) {
      // Update last access time
      player.lastSeen = Date.now();
    }
    return player;
  }

  /**
   * Get all connected players (with caching)
   */
  getConnectedPlayers() {
    return Array.from(this.players.values()).filter(p => p.connected);
  }

  /**
   * Clean shutdown - cleanup all resources
   */
  shutdown() {
    // Clear all data structures
    this.players.clear();
    this.playerSockets.clear();
    this.playerTokens.clear();
    this.answers = [];
    
    // Clear caches
    this.leaderboardCache = null;
    this.playerCountCache = null;
    
    console.log(`[Shutdown] Game ${this.gamePin} cleaned up. Stats:`, this.getMemoryStats());
  }
}

module.exports = { GameInstance };