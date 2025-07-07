const { describe, test, expect, beforeEach } = require('@jest/globals');
const { createSampleQuestions } = require('../helpers/test-utils');

// Mock GameInstance class for testing - extracted from server.js logic
class MockGameInstance {
  constructor(gamePin, questions, dbId = null) {
    this.gamePin = gamePin;
    this.questions = questions;
    this.dbId = dbId;
    this.players = new Map();
    this.answers = [];
    this.phase = 'WAITING';
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
      token: playerData.player_token || 'test-token',
      connected: true
    });
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
    }
  }

  getCurrentQuestion() {
    return this.questions[this.currentQuestionIndex] || null;
  }

  submitAnswer(playerId, answer, playerLatency = 0) {
    const serverTime = Date.now();
    const player = this.players.get(playerId);
    if (!player) return null;
    
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
    if (!existingAnswer) {
      this.answers.push(answerData);
    }
    
    return answerData;
  }

  calculateScore(responseTime, isCorrect) {
    if (!isCorrect) return 0;
    
    const baseScore = 1000;
    const maxSpeedBonus = 500;
    const speedBonus = Math.max(0, maxSpeedBonus - (responseTime / (this.timeLimit * 1000) * maxSpeedBonus));
    
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

  getState() {
    return {
      status: this.phase.toLowerCase(),
      currentQuestionIndex: this.currentQuestionIndex,
      questionStartTime: this.questionStartTime
    };
  }
}

describe('GameInstance', () => {
  let game;
  let sampleQuestions;

  beforeEach(() => {
    sampleQuestions = createSampleQuestions();
    game = new MockGameInstance('123456', sampleQuestions, 1);
  });

  describe('Initialization', () => {
    test('should initialize with correct default values', () => {
      expect(game.gamePin).toBe('123456');
      expect(game.questions).toEqual(sampleQuestions);
      expect(game.dbId).toBe(1);
      expect(game.phase).toBe('WAITING');
      expect(game.currentQuestionIndex).toBe(0);
      expect(game.players.size).toBe(0);
      expect(game.answers).toEqual([]);
    });
  });

  describe('Player Management', () => {
    test('should add player correctly', () => {
      const playerData = {
        name: 'TestPlayer',
        score: 0,
        player_token: 'test-token-123'
      };

      game.addPlayer(1, playerData);

      expect(game.players.size).toBe(1);
      const player = game.players.get(1);
      expect(player.name).toBe('TestPlayer');
      expect(player.score).toBe(0);
      expect(player.connected).toBe(true);
      expect(player.token).toBe('test-token-123');
    });

    test('should handle player disconnection', () => {
      const playerData = { name: 'TestPlayer', score: 100 };
      game.addPlayer(1, playerData);

      game.removePlayer(1);

      const player = game.players.get(1);
      expect(player.connected).toBe(false);
      expect(player.name).toBe('TestPlayer'); // Should preserve other data
    });

    test('should handle removing non-existent player gracefully', () => {
      expect(() => game.removePlayer(999)).not.toThrow();
    });
  });

  describe('Question Management', () => {
    test('should get current question correctly', () => {
      const question = game.getCurrentQuestion();
      expect(question).toEqual(sampleQuestions[0]);
      expect(question.question).toBe("What is the capital of Slovakia?");
    });

    test('should return null when no more questions', () => {
      game.currentQuestionIndex = 999;
      const question = game.getCurrentQuestion();
      expect(question).toBeNull();
    });

    test('should advance to next question', () => {
      const hasNext = game.nextQuestion();
      
      expect(hasNext).toBe(true);
      expect(game.currentQuestionIndex).toBe(1);
      expect(game.phase).toBe('WAITING');
      expect(game.answers).toEqual([]);
    });

    test('should finish game when no more questions', () => {
      game.currentQuestionIndex = sampleQuestions.length - 1;
      
      const hasNext = game.nextQuestion();
      
      expect(hasNext).toBe(false);
      expect(game.phase).toBe('FINISHED');
    });
  });

  describe('Answer Submission', () => {
    beforeEach(() => {
      // Add a player and start a question
      game.addPlayer(1, { name: 'TestPlayer', score: 0 });
      game.questionStartTime = Date.now() - 5000; // 5 seconds ago
    });

    test('should submit answer correctly', () => {
      const answer = game.submitAnswer(1, 0); // Option A

      expect(answer).toBeDefined();
      expect(answer.playerId).toBe(1);
      expect(answer.answer).toBe(0);
      expect(answer.responseTime).toBeGreaterThan(4000); // ~5 seconds
      expect(game.answers).toHaveLength(1);
    });

    test('should prevent duplicate answers', () => {
      game.submitAnswer(1, 0);
      game.submitAnswer(1, 1); // Try to answer again

      expect(game.answers).toHaveLength(1);
      expect(game.answers[0].answer).toBe(0); // First answer preserved
    });

    test('should handle non-existent player', () => {
      const answer = game.submitAnswer(999, 0);
      expect(answer).toBeNull();
    });

    test('should handle latency compensation', () => {
      const playerLatency = 100; // 100ms latency
      const answer = game.submitAnswer(1, 0, playerLatency);

      expect(answer).toBeDefined();
      // Timestamp should be adjusted for latency
      expect(answer.timestamp).toBeLessThan(Date.now());
    });
  });

  describe('Scoring System', () => {
    test('should calculate score for correct fast answer', () => {
      const score = game.calculateScore(5000, true); // 5 seconds
      expect(score).toBeGreaterThan(1000); // Base score + speed bonus
      expect(score).toBeLessThanOrEqual(1500); // Max possible score
    });

    test('should calculate score for correct slow answer', () => {
      const score = game.calculateScore(25000, true); // 25 seconds
      expect(score).toBeGreaterThan(1000); // At least base score
      expect(score).toBeLessThan(1200); // Much less speed bonus
    });

    test('should return zero for incorrect answer', () => {
      const score = game.calculateScore(5000, false);
      expect(score).toBe(0);
    });

    test('should handle overtime answers', () => {
      const score = game.calculateScore(35000, true); // Over time limit
      expect(score).toBe(1000); // Only base score
    });
  });

  describe('Leaderboard', () => {
    beforeEach(() => {
      // Add multiple players with different scores
      game.addPlayer(1, { name: 'Player1', score: 1500 });
      game.addPlayer(2, { name: 'Player2', score: 2000 });
      game.addPlayer(3, { name: 'Player3', score: 800 });
      
      // Disconnect one player
      game.removePlayer(3);
    });

    test('should return leaderboard sorted by score', () => {
      const leaderboard = game.getLeaderboard();

      expect(leaderboard).toHaveLength(2); // Only connected players
      expect(leaderboard[0].score).toBe(2000);
      expect(leaderboard[0].position).toBe(1);
      expect(leaderboard[0].name).toBe('Player2');
      
      expect(leaderboard[1].score).toBe(1500);
      expect(leaderboard[1].position).toBe(2);
      expect(leaderboard[1].name).toBe('Player1');
    });

    test('should exclude disconnected players', () => {
      const leaderboard = game.getLeaderboard();
      
      const playerNames = leaderboard.map(p => p.name);
      expect(playerNames).not.toContain('Player3');
    });

    test('should handle empty leaderboard', () => {
      // Remove all players
      game.removePlayer(1);
      game.removePlayer(2);
      
      const leaderboard = game.getLeaderboard();
      expect(leaderboard).toEqual([]);
    });
  });

  describe('Game State', () => {
    test('should return correct game state', () => {
      game.phase = 'QUESTION_ACTIVE';
      game.currentQuestionIndex = 2;
      game.questionStartTime = 1234567890;

      const state = game.getState();

      expect(state.status).toBe('question_active');
      expect(state.currentQuestionIndex).toBe(2);
      expect(state.questionStartTime).toBe(1234567890);
    });

    test('should handle different phases', () => {
      const phases = ['WAITING', 'QUESTION_ACTIVE', 'RESULTS', 'FINISHED'];
      
      phases.forEach(phase => {
        game.phase = phase;
        const state = game.getState();
        expect(state.status).toBe(phase.toLowerCase());
      });
    });
  });

  describe('Game Flow Integration', () => {
    test('should handle complete question cycle', () => {
      // Add players
      game.addPlayer(1, { name: 'Player1', score: 0 });
      game.addPlayer(2, { name: 'Player2', score: 0 });

      // Start question
      game.phase = 'QUESTION_ACTIVE';
      game.questionStartTime = Date.now() - 8000; // 8 seconds ago

      // Submit answers
      const answer1 = game.submitAnswer(1, 0); // Correct answer
      const answer2 = game.submitAnswer(2, 1); // Wrong answer

      expect(game.answers).toHaveLength(2);

      // Calculate scores
      const question = game.getCurrentQuestion();
      const score1 = game.calculateScore(answer1.responseTime, answer1.answer === question.correct);
      const score2 = game.calculateScore(answer2.responseTime, answer2.answer === question.correct);

      expect(score1).toBeGreaterThan(0); // Correct answer
      expect(score2).toBe(0); // Wrong answer

      // Update player scores
      game.players.get(1).score += score1;
      game.players.get(2).score += score2;

      // Check leaderboard
      const leaderboard = game.getLeaderboard();
      expect(leaderboard[0].playerId).toBe(1); // Player1 should be first
      expect(leaderboard[1].playerId).toBe(2); // Player2 should be second

      // Move to next question
      const hasNext = game.nextQuestion();
      expect(hasNext).toBe(true);
      expect(game.answers).toHaveLength(0); // Answers reset
    });
  });
});