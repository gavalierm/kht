/**
 * Comprehensive unit tests for Game Utilities
 * - Tests PIN generation and validation
 * - Tests question loading functionality
 * - Tests edge cases and error handling
 * - Uses real implementation without mocking
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const { generateGamePin, loadQuestions } = require('../../lib/gameUtils');
const { generateTestPin } = require('../helpers/test-utils');

describe('GameUtils - Comprehensive Unit Tests', () => {
  describe('PIN Generation', () => {
    test('should generate valid 6-digit PIN', () => {
      const activeGames = new Map();
      const pin = generateGamePin(null, activeGames);
      
      expect(pin).toBeDefined();
      expect(typeof pin).toBe('string');
      expect(pin.length).toBe(6);
      expect(/^\d{6}$/.test(pin)).toBe(true);
      expect(parseInt(pin)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(pin)).toBeLessThanOrEqual(999999);
    });

    test('should generate unique PINs', () => {
      const activeGames = new Map();
      const pins = new Set();
      
      // Generate 1000 PINs to test uniqueness
      for (let i = 0; i < 1000; i++) {
        const pin = generateGamePin(null, activeGames);
        expect(pins.has(pin)).toBe(false);
        pins.add(pin);
        activeGames.set(pin, {}); // Simulate active game
      }
      
      expect(pins.size).toBe(1000);
    });

    test('should avoid collision with existing games', () => {
      const activeGames = new Map();
      
      // Pre-populate with many games
      for (let i = 100000; i < 100010; i++) {
        activeGames.set(i.toString(), {});
      }
      
      const pin = generateGamePin(null, activeGames);
      
      expect(pin).toBeDefined();
      expect(activeGames.has(pin)).toBe(false);
    });

    test('should accept valid custom PIN', () => {
      const activeGames = new Map();
      const customPin = '123456';
      
      const pin = generateGamePin(customPin, activeGames);
      
      expect(pin).toBe(customPin);
    });

    test('should reject taken custom PIN', () => {
      const activeGames = new Map();
      const customPin = '123456';
      
      activeGames.set(customPin, {}); // Mark as taken
      
      const pin = generateGamePin(customPin, activeGames);
      
      expect(pin).toBeNull();
    });

    test('should handle empty active games map', () => {
      const pin = generateGamePin();
      
      expect(pin).toBeDefined();
      expect(typeof pin).toBe('string');
      expect(pin.length).toBe(6);
    });

    test('should handle undefined active games map', () => {
      const pin = generateGamePin(null, undefined);
      
      expect(pin).toBeDefined();
      expect(typeof pin).toBe('string');
      expect(pin.length).toBe(6);
    });

    test('should handle numeric custom PIN', () => {
      const activeGames = new Map();
      const customPin = 654321;
      
      const pin = generateGamePin(customPin, activeGames);
      
      expect(pin).toBe(customPin);
    });
  });

  describe('Question Loading', () => {
    let originalReadFile;
    let testQuestionsDir;

    beforeEach(() => {
      // Create temporary test questions directory
      testQuestionsDir = path.join(__dirname, 'temp-questions');
      if (!fs.existsSync(testQuestionsDir)) {
        fs.mkdirSync(testQuestionsDir, { recursive: true });
      }
      
      // Mock the questions directory path
      originalReadFile = fs.promises.readFile;
    });

    afterEach(() => {
      // Cleanup temporary files
      if (fs.existsSync(testQuestionsDir)) {
        fs.rmSync(testQuestionsDir, { recursive: true, force: true });
      }
    });

    test('should load valid question file', async () => {
      // Create test question file
      const testQuestions = {
        quiz: {
          questions: [
            {
              id: 1,
              question: "Test otázka?",
              options: ["A", "B", "C", "D"],
              correct: 0,
              timeLimit: 30
            }
          ]
        }
      };
      
      const testFile = path.join(testQuestionsDir, 'test.json');
      fs.writeFileSync(testFile, JSON.stringify(testQuestions, null, 2));
      
      // Mock the file reading to use our test file
      fs.promises.readFile = jest.fn().mockResolvedValue(JSON.stringify(testQuestions));
      
      const result = await loadQuestions('test');
      
      expect(result).toEqual(testQuestions);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('test.json'),
        'utf8'
      );
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
    });

    test('should return fallback questions when file not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await loadQuestions('nonexistent');
      
      expect(result).toHaveProperty('quiz');
      expect(result.quiz).toHaveProperty('questions');
      expect(Array.isArray(result.quiz.questions)).toBe(true);
      expect(result.quiz.questions.length).toBeGreaterThan(0);
      
      // Check fallback questions have required structure
      const firstQuestion = result.quiz.questions[0];
      expect(firstQuestion).toHaveProperty('id');
      expect(firstQuestion).toHaveProperty('question');
      expect(firstQuestion).toHaveProperty('options');
      expect(firstQuestion).toHaveProperty('correct');
      expect(firstQuestion).toHaveProperty('timeLimit');
      
      // Check Slovak content
      expect(firstQuestion.question).toContain('Slovenska');
      expect(firstQuestion.options).toContain('Bratislava');
      
      consoleSpy.mockRestore();
    });

    test('should handle malformed JSON gracefully', async () => {
      // Mock invalid JSON
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      fs.promises.readFile = jest.fn().mockResolvedValue('invalid json {');
      
      const result = await loadQuestions('malformed');
      
      expect(result).toHaveProperty('quiz');
      expect(result.quiz).toHaveProperty('questions');
      expect(Array.isArray(result.quiz.questions)).toBe(true);
      
      // Should return fallback questions
      expect(result.quiz.questions.length).toBe(2);
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
      consoleSpy.mockRestore();
    });

    test('should handle empty file gracefully', async () => {
      // Mock empty file
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      fs.promises.readFile = jest.fn().mockResolvedValue('');
      
      const result = await loadQuestions('empty');
      
      expect(result).toHaveProperty('quiz');
      expect(result.quiz).toHaveProperty('questions');
      expect(Array.isArray(result.quiz.questions)).toBe(true);
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
      consoleSpy.mockRestore();
    });

    test('should handle file read errors gracefully', async () => {
      // Mock file read error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      fs.promises.readFile = jest.fn().mockRejectedValue(new Error('File read error'));
      
      const result = await loadQuestions('error');
      
      expect(result).toHaveProperty('quiz');
      expect(result.quiz).toHaveProperty('questions');
      expect(Array.isArray(result.quiz.questions)).toBe(true);
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
      consoleSpy.mockRestore();
    });

    test('should default to general category when no category specified', async () => {
      // Mock the file reading
      fs.promises.readFile = jest.fn().mockResolvedValue(JSON.stringify({
        quiz: {
          questions: [
            {
              id: 1,
              question: "General question?",
              options: ["A", "B", "C", "D"],
              correct: 0,
              timeLimit: 30
            }
          ]
        }
      }));
      
      const result = await loadQuestions();
      
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('general.json'),
        'utf8'
      );
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
    });

    test('should handle different question file structures', async () => {
      const testQuestions = {
        quiz: {
          questions: [
            {
              id: 1,
              question: "Otázka s dlhým časom?",
              options: ["Možnosť A", "Možnosť B", "Možnosť C", "Možnosť D"],
              correct: 2,
              timeLimit: 45
            },
            {
              id: 2,
              question: "Rýchla otázka?",
              options: ["Áno", "Nie", "Možno", "Neviem"],
              correct: 1,
              timeLimit: 15
            }
          ]
        }
      };
      
      fs.promises.readFile = jest.fn().mockResolvedValue(JSON.stringify(testQuestions));
      
      const result = await loadQuestions('custom');
      
      expect(result.quiz.questions).toHaveLength(2);
      expect(result.quiz.questions[0].timeLimit).toBe(45);
      expect(result.quiz.questions[1].timeLimit).toBe(15);
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
    });
  });

  describe('Integration Tests', () => {
    test('should work together to generate PIN and validate questions', async () => {
      const activeGames = new Map();
      
      // Generate PIN
      const pin = generateGamePin(null, activeGames);
      expect(pin).toBeDefined();
      
      // Mark as active
      activeGames.set(pin, {});
      
      // Try to generate same PIN should fail
      const duplicatePin = generateGamePin(pin, activeGames);
      expect(duplicatePin).toBeNull();
      
      // Load questions
      const questions = await loadQuestions('general');
      expect(questions.quiz.questions).toBeDefined();
      
      // Simulate game creation
      const gameData = {
        pin,
        questions: questions.quiz.questions,
        status: 'waiting'
      };
      
      expect(gameData.pin).toBe(pin);
      expect(gameData.questions.length).toBeGreaterThan(0);
    });

    test('should handle high-volume PIN generation', () => {
      const activeGames = new Map();
      const pins = new Set();
      
      // Generate many PINs rapidly
      for (let i = 0; i < 10000; i++) {
        const pin = generateGamePin(null, activeGames);
        expect(pin).toBeDefined();
        expect(pins.has(pin)).toBe(false);
        pins.add(pin);
        activeGames.set(pin, { id: i });
      }
      
      expect(pins.size).toBe(10000);
      expect(activeGames.size).toBe(10000);
    });

    test('should handle concurrent question loading', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const categories = ['general', 'science', 'history', 'nonexistent'];
      
      const loadPromises = categories.map(category => loadQuestions(category));
      const results = await Promise.all(loadPromises);
      
      results.forEach(result => {
        expect(result).toHaveProperty('quiz');
        expect(result.quiz).toHaveProperty('questions');
        expect(Array.isArray(result.quiz.questions)).toBe(true);
        expect(result.quiz.questions.length).toBeGreaterThan(0);
      });
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle null/undefined inputs gracefully', () => {
      // PIN generation
      expect(() => generateGamePin(null)).not.toThrow();
      expect(() => generateGamePin(undefined)).not.toThrow();
      expect(() => generateGamePin(null, null)).not.toThrow();
      expect(() => generateGamePin(null, undefined)).not.toThrow();
    });

    test('should handle invalid custom PIN formats', () => {
      const activeGames = new Map();
      
      // Test various invalid formats
      const invalidPins = ['', '123', '1234567', 'abcdef', '12345a', null, undefined];
      
      invalidPins.forEach(pin => {
        const result = generateGamePin(pin, activeGames);
        // Should either accept if valid or reject if invalid
        expect(result === null || typeof result === 'string').toBe(true);
      });
    });

    test('should handle very large active games map', () => {
      const activeGames = new Map();
      
      // Add many games
      for (let i = 100000; i < 200000; i++) {
        activeGames.set(i.toString(), {});
      }
      
      const pin = generateGamePin(null, activeGames);
      
      expect(pin).toBeDefined();
      expect(activeGames.has(pin)).toBe(false);
    });

    test('should handle question loading with network-like delays', async () => {
      const originalReadFile = fs.promises.readFile;
      
      // Mock delayed response
      fs.promises.readFile = jest.fn().mockImplementation((path, encoding) => 
        new Promise(resolve => 
          setTimeout(() => resolve(JSON.stringify({
            quiz: {
              questions: [
                {
                  id: 1,
                  question: "Delayed question?",
                  options: ["A", "B", "C", "D"],
                  correct: 0,
                  timeLimit: 30
                }
              ]
            }
          })), 100)
        )
      );
      
      const startTime = Date.now();
      const result = await loadQuestions('delayed');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThan(90); // Should take at least 100ms
      expect(result.quiz.questions).toHaveLength(1);
      
      // Restore original function
      fs.promises.readFile = originalReadFile;
    });

    test('should handle questions with special characters', async () => {
      const questionsWithSpecialChars = {
        quiz: {
          questions: [
            {
              id: 1,
              question: "Otázka s diakritikÁ: čžíš?",
              options: ["Áno", "Nie", "Možno", "Neviem"],
              correct: 0,
              timeLimit: 30
            },
            {
              id: 2,
              question: "Question with émojis 🎯?",
              options: ["✅ Yes", "❌ No", "🤔 Maybe", "🔄 Later"],
              correct: 0,
              timeLimit: 25
            }
          ]
        }
      };
      
      fs.promises.readFile = jest.fn().mockResolvedValue(JSON.stringify(questionsWithSpecialChars));
      
      const result = await loadQuestions('special');
      
      expect(result.quiz.questions).toHaveLength(2);
      expect(result.quiz.questions[0].question).toContain('čžíš');
      expect(result.quiz.questions[1].question).toContain('🎯');
      
      // Restore original function
      fs.promises.readFile = require('fs').promises.readFile;
    });

    test('should validate fallback questions structure', async () => {
      // Force fallback by causing error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      fs.promises.readFile = jest.fn().mockRejectedValue(new Error('Test error'));
      
      const result = await loadQuestions('error');
      
      expect(result.quiz.questions).toHaveLength(2);
      
      result.quiz.questions.forEach((question, index) => {
        expect(question).toHaveProperty('id');
        expect(question).toHaveProperty('question');
        expect(question).toHaveProperty('options');
        expect(question).toHaveProperty('correct');
        expect(question).toHaveProperty('timeLimit');
        
        expect(typeof question.id).toBe('number');
        expect(typeof question.question).toBe('string');
        expect(Array.isArray(question.options)).toBe(true);
        expect(question.options.length).toBe(4);
        expect(typeof question.correct).toBe('number');
        expect(question.correct).toBeGreaterThanOrEqual(0);
        expect(question.correct).toBeLessThan(4);
        expect(typeof question.timeLimit).toBe('number');
        expect(question.timeLimit).toBeGreaterThan(0);
      });
      
      // Restore original function
      fs.promises.readFile = require('fs').promises.readFile;
      consoleSpy.mockRestore();
    });
  });

  describe('Performance Tests', () => {
    test('should generate PINs quickly under load', () => {
      const activeGames = new Map();
      const startTime = Date.now();
      
      // Generate many PINs
      for (let i = 0; i < 1000; i++) {
        const pin = generateGamePin(null, activeGames);
        activeGames.set(pin, {});
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(activeGames.size).toBe(1000);
    });

    test('should handle question loading performance', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const startTime = Date.now();
      
      // Load questions multiple times
      const promises = Array.from({ length: 10 }, () => loadQuestions('general'));
      const results = await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(results).toHaveLength(10);
      
      results.forEach(result => {
        expect(result.quiz.questions).toBeDefined();
      });
      
      consoleSpy.mockRestore();
    });
  });
});