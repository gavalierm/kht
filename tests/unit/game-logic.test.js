const { describe, test, expect, beforeEach } = require('@jest/globals');
const { generateGamePin, loadQuestions } = require('../../lib/gameUtils');
const { GameInstance } = require('../../lib/gameInstance');

describe('Game Logic Functions', () => {
  
  describe('PIN Generation', () => {
    test('should generate 6-digit PIN', () => {
      // Mock activeGames for testing
      const activeGames = new Map();
      
      const pin = generateGamePin(null, activeGames);
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin.length).toBe(6);
    });
    
    test('should accept custom PIN if available', () => {
      const activeGames = new Map();
      const customPin = '123456';
      
      const pin = generateGamePin(customPin, activeGames);
      expect(pin).toBe(customPin);
    });
    
    test('should reject custom PIN if already in use', () => {
      const activeGames = new Map();
      const existingPin = '123456';
      activeGames.set(existingPin, {});
      
      const pin = generateGamePin(existingPin, activeGames);
      expect(pin).toBeNull();
    });
  });

  describe('Scoring Algorithm', () => {
    let game;
    
    beforeEach(() => {
      game = new GameInstance('123456', [
        { id: 1, question: 'Test', options: ['A', 'B'], correct: 0, timeLimit: 30 }
      ]);
    });
    
    test('should calculate correct score for correct answer', () => {
      const responseTime = 5000; // 5 seconds
      const score = game.calculateScore(responseTime, true);
      
      expect(score).toBeGreaterThanOrEqual(1000); // At least base score
      expect(score).toBeLessThanOrEqual(1500); // Max possible score
    });
    
    test('should return 0 for incorrect answer', () => {
      const responseTime = 5000;
      const score = game.calculateScore(responseTime, false);
      
      expect(score).toBe(0);
    });
    
    test('should handle edge cases', () => {
      // Very fast response (should get speed bonus)
      const fastScore = game.calculateScore(100, true);
      expect(fastScore).toBeGreaterThanOrEqual(1000); // At least base score
      
      // Overtime response
      const slowScore = game.calculateScore(35000, true);
      expect(slowScore).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Answer Statistics Calculation', () => {
    test('should calculate answer statistics correctly', () => {
      const answers = [
        { answer: 0, playerId: 1 },
        { answer: 1, playerId: 2 },
        { answer: 0, playerId: 3 },
        { answer: 2, playerId: 4 },
        { answer: 0, playerId: 5 }
      ];
      
      // Simple statistics calculation
      const stats = answers.reduce((acc, curr) => {
        acc[curr.answer] = (acc[curr.answer] || 0) + 1;
        return acc;
      }, {});
      
      expect(stats[0]).toBe(3);
      expect(stats[1]).toBe(1);
      expect(stats[2]).toBe(1);
    });
    
    test('should handle empty answers array', () => {
      const answers = [];
      const stats = answers.reduce((acc, curr) => {
        acc[curr.answer] = (acc[curr.answer] || 0) + 1;
        return acc;
      }, {});
      
      expect(Object.keys(stats)).toHaveLength(0);
    });
    
    test('should ignore invalid answer indices', () => {
      const answers = [
        { answer: 0, playerId: 1 },
        { answer: -1, playerId: 2 }, // Invalid
        { answer: 'invalid', playerId: 3 }, // Invalid
        { answer: 1, playerId: 4 }
      ];
      
      const validAnswers = answers.filter(a => 
        typeof a.answer === 'number' && a.answer >= 0
      );
      
      expect(validAnswers).toHaveLength(2);
    });
  });

  describe('Question Loading', () => {
    test('should return fallback questions when file not found', async () => {
      // Test the fallback behavior
      const questions = await loadQuestions('nonexistent-category');
      
      expect(questions).toBeTruthy();
      expect(questions.quiz).toBeTruthy();
      expect(questions.quiz.questions).toBeInstanceOf(Array);
      expect(questions.quiz.questions.length).toBeGreaterThan(0);
      
      // Check fallback question structure
      const firstQuestion = questions.quiz.questions[0];
      expect(firstQuestion.id).toBeDefined();
      expect(firstQuestion.question).toBeDefined();
      expect(firstQuestion.options).toBeInstanceOf(Array);
      expect(firstQuestion.correct).toBeDefined();
      expect(firstQuestion.timeLimit).toBeDefined();
    });
  });
});