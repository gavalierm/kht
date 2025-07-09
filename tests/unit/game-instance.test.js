const { describe, test, expect, beforeEach } = require('@jest/globals');
const { createSampleQuestions } = require('../helpers/test-utils');
const { GameInstance } = require('../../lib/gameInstance');

describe('GameInstance', () => {
  let game;
  let sampleQuestions;

  beforeEach(() => {
    sampleQuestions = createSampleQuestions();
    game = new GameInstance('123456', sampleQuestions, 1);
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
      expect(game.playerTokens.get(1)).toBe('test-token-123');
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
      const currentQuestion = game.getCurrentQuestion();
      expect(currentQuestion).toEqual(sampleQuestions[0]);
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
    });

    test('should finish game when no more questions', () => {
      // Set to last question
      game.currentQuestionIndex = sampleQuestions.length - 1;
      
      const result = game.nextQuestion();
      
      expect(result).toBe(false);
      expect(game.phase).toBe('FINISHED');
    });
  });

  describe('Answer Submission', () => {
    beforeEach(() => {
      game.questionStartTime = Date.now() - 1000; // Question started 1 second ago
      game.addPlayer(1, { name: 'TestPlayer', score: 0 });
      
      // Mock player socketId for latency calculation
      game.players.get(1).socketId = 'test-socket-id';
    });

    test('should submit answer correctly', () => {
      // Create mock playerLatencies Map
      const mockPlayerLatencies = new Map();
      mockPlayerLatencies.set('test-socket-id', 100); // 100ms latency
      
      const answerData = game.submitAnswer(1, 0, mockPlayerLatencies);
      
      expect(answerData).toBeTruthy();
      expect(answerData.playerId).toBe(1);
      expect(answerData.answer).toBe(0);
      expect(game.answers.length).toBe(1);
    });

    test('should prevent duplicate answers', () => {
      const mockPlayerLatencies = new Map();
      mockPlayerLatencies.set('test-socket-id', 100);
      
      const firstAnswer = game.submitAnswer(1, 0, mockPlayerLatencies);
      const secondAnswer = game.submitAnswer(1, 1, mockPlayerLatencies); // Second attempt
      
      expect(firstAnswer).toBeTruthy();
      expect(secondAnswer).toBeNull(); // Should reject duplicate
      expect(game.answers.length).toBe(1);
      expect(game.answers[0].answer).toBe(0); // Should keep first answer
    });

    test('should handle non-existent player', () => {
      const mockPlayerLatencies = new Map();
      const answerData = game.submitAnswer(999, 0, mockPlayerLatencies);
      
      expect(answerData).toBeNull();
    });

    test('should handle latency compensation', () => {
      const mockPlayerLatencies = new Map();
      mockPlayerLatencies.set('test-socket-id', 200); // 200ms latency
      
      const answerData = game.submitAnswer(1, 0, mockPlayerLatencies);
      
      expect(answerData).toBeTruthy();
      expect(answerData.timestamp).toBeLessThan(Date.now());
    });
  });

  describe('Scoring System', () => {
    test('should calculate score for correct fast answer', () => {
      const responseTime = 1000; // 1 second
      const score = game.calculateScore(responseTime, true, 30);
      
      expect(score).toBeGreaterThanOrEqual(1000); // At least base score
      expect(score).toBeLessThanOrEqual(1500); // Max possible score
    });

    test('should calculate score for correct slow answer', () => {
      const responseTime = 25000; // 25 seconds (near time limit)
      const score = game.calculateScore(responseTime, true, 30);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1100); // Allow for some speed bonus
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
      
      // Fast question (10 seconds) - same response time should get lower bonus (answered halfway through)
      const scoreShortTime = game.calculateScore(responseTime, true, 10);
      
      // Normal question (30 seconds) - same response time should get higher bonus (answered early)
      const scoreNormalTime = game.calculateScore(responseTime, true, 30);
      
      // Long question (60 seconds) - same response time should get highest bonus (answered very early)
      const scoreLongTime = game.calculateScore(responseTime, true, 60);
      
      expect(scoreLongTime).toBeGreaterThan(scoreNormalTime);
      expect(scoreNormalTime).toBeGreaterThan(scoreShortTime);
      
      // All should be above base score since answer was relatively fast
      expect(scoreShortTime).toBeGreaterThan(1000);
      expect(scoreNormalTime).toBeGreaterThan(1000);
      expect(scoreLongTime).toBeGreaterThan(1000);
    });
  });

  describe('Leaderboard', () => {
    beforeEach(() => {
      game.addPlayer(1, { name: 'Player1', score: 100 });
      game.addPlayer(2, { name: 'Player2', score: 200 });
      game.addPlayer(3, { name: 'Player3', score: 150 });
    });

    test('should return leaderboard sorted by score', () => {
      const leaderboard = game.getLeaderboard();
      
      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].name).toBe('Player2'); // Highest score
      expect(leaderboard[0].position).toBe(1);
      expect(leaderboard[1].name).toBe('Player3');
      expect(leaderboard[2].name).toBe('Player1'); // Lowest score
    });

    test('should exclude disconnected players', () => {
      game.removePlayer(2); // Disconnect Player2
      
      const leaderboard = game.getLeaderboard();
      
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard.find(p => p.name === 'Player2')).toBeUndefined();
    });

    test('should handle empty leaderboard', () => {
      game.removePlayer(1);
      game.removePlayer(2);
      game.removePlayer(3);
      
      const leaderboard = game.getLeaderboard();
      expect(leaderboard).toHaveLength(0);
    });
  });

  describe('Game State', () => {
    test('should return correct game state', () => {
      game.phase = 'QUESTION_ACTIVE';
      game.currentQuestionIndex = 2;
      game.questionStartTime = 123456789;
      
      const state = game.getState();
      
      expect(state.status).toBe('question_active');
      expect(state.currentQuestionIndex).toBe(2);
      expect(state.questionStartTime).toBe(123456789);
    });

    test('should handle different phases', () => {
      game.phase = 'FINISHED';
      const state = game.getState();
      expect(state.status).toBe('finished');
    });
  });

  describe('Game Flow Integration', () => {
    test('should handle complete question cycle', () => {
      // Add players
      game.addPlayer(1, { name: 'Player1', score: 0 });
      game.addPlayer(2, { name: 'Player2', score: 0 });
      
      // Start question
      game.phase = 'QUESTION_ACTIVE';
      game.questionStartTime = Date.now();
      
      // Submit answers
      const mockPlayerLatencies = new Map();
      mockPlayerLatencies.set('socket1', 50);
      mockPlayerLatencies.set('socket2', 100);
      
      game.players.get(1).socketId = 'socket1';
      game.players.get(2).socketId = 'socket2';
      
      game.submitAnswer(1, 0, mockPlayerLatencies); // Correct answer
      game.submitAnswer(2, 1, mockPlayerLatencies); // Wrong answer
      
      // Verify answers recorded
      expect(game.answers).toHaveLength(2);
      
      // Move to next question
      const hasMore = game.nextQuestion();
      expect(hasMore).toBe(true);
      expect(game.answers).toHaveLength(0); // Answers reset
      expect(game.phase).toBe('WAITING');
    });
  });
});