/**
 * GameInstance class extracted from server.js
 * Manages individual game state and logic
 */

class GameInstance {
  constructor(gamePin, questions, dbId = null) {
    this.gamePin = gamePin;
    this.questions = questions;
    this.dbId = dbId;
    this.players = new Map(); // playerId -> {id, name, score, socketId, token, connected}
    this.answers = []; // current question answers
    this.phase = 'WAITING'; // WAITING, QUESTION_ACTIVE, RESULTS, FINISHED
    this.currentQuestionIndex = 0;
    this.questionStartTime = null;
    this.moderatorSocket = null;
    this.timeLimit = 30;
    this.lastSync = Date.now();
  }

  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
      id: playerId,
      name: playerData.name,
      score: playerData.score || 0,
      socketId: null,
      token: playerData.player_token,
      connected: true
    });
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      // Don't delete from memory, just mark as disconnected
    }
  }

  getCurrentQuestion() {
    return this.questions[this.currentQuestionIndex] || null;
  }

  submitAnswer(playerId, answer, playerLatencies) {
    const serverTime = Date.now();
    const player = this.players.get(playerId);
    if (!player) return null;
    
    const playerLatency = playerLatencies.get(player.socketId) || 0;
    
    // Time compensation and bucketing
    const compensatedTime = serverTime - (playerLatency / 2);
    const bucketedTime = Math.floor(compensatedTime / 50) * 50;
    
    const answerData = {
      playerId: playerId,
      answer: answer,
      timestamp: bucketedTime,
      responseTime: bucketedTime - this.questionStartTime
    };
    
    // Check if player already answered
    const existingAnswer = this.answers.find(a => a.playerId === playerId);
    if (existingAnswer) {
      // Player already answered this question, return null
      return null;
    }
    
    this.answers.push(answerData);
    return answerData;
  }

  calculateScore(responseTime, isCorrect, questionTimeLimit) {
    if (!isCorrect) return 0;
    
    const baseScore = 1000;
    const maxSpeedBonus = 500;
    const timeLimit = questionTimeLimit || this.timeLimit; // Use question's time limit or fallback to default
    const speedBonus = Math.max(0, maxSpeedBonus - (responseTime / (timeLimit * 1000) * maxSpeedBonus));
    
    return Math.round(baseScore + speedBonus);
  }

  getLeaderboard() {
    return Array.from(this.players.values())
      .filter(p => p.connected)
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        score: player.score,
        playerId: player.id
      }));
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    this.answers = [];
    this.questionStartTime = null;
    
    if (this.currentQuestionIndex >= this.questions.length) {
      this.phase = 'FINISHED';
      return false;
    }
    
    this.phase = 'WAITING';
    return true;
  }

  // Get state for database sync
  getState() {
    return {
      status: this.phase.toLowerCase(),
      currentQuestionIndex: this.currentQuestionIndex,
      questionStartTime: this.questionStartTime
    };
  }

  // Sync to database
  async syncToDatabase(db) {
    if (this.dbId) {
      try {
        await db.updateGameState(this.dbId, this.getState());
        this.lastSync = Date.now();
      } catch (error) {
        console.error('Failed to sync game to database:', error);
      }
    }
  }
}

module.exports = { GameInstance };