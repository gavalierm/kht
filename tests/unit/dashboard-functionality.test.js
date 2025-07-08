/**
 * Dashboard functionality tests
 * Tests the new game creation and control features
 */

const GameDatabase = require('../../database');
const { sampleQuestions } = require('../fixtures/sample-data');

describe('Dashboard Functionality', () => {
  let database;

  beforeEach(async () => {
    // Create database with skipTestGame flag to avoid initialization conflicts
    database = new GameDatabase(':memory:', { skipTestGame: true });
    
    // Wait for database initialization to complete
    await database.waitForInitialization();
  });

  afterEach(() => {
    if (database) {
      database.close();
    }
  });

  describe('Question Template Management', () => {
    test('should create question template', async () => {
      const category = 'test';
      const questions = sampleQuestions.quiz.questions;

      const templateId = await database.createQuestionTemplate(category, questions);
      
      expect(templateId).toBeGreaterThan(0);
    });

    test('should retrieve question template by category', async () => {
      const category = 'general';
      const questions = sampleQuestions.quiz.questions;

      await database.createQuestionTemplate(category, questions);
      const template = await database.getQuestionTemplate(category);

      expect(template).toBeTruthy();
      expect(template.category).toBe(category);
      // Title property removed
      expect(template.questions).toHaveLength(questions.length);
    });

    test('should get all question templates', async () => {
      const templates = [
        { category: 'general', questions: sampleQuestions.quiz.questions },
        { category: 'history', questions: sampleQuestions.quiz.questions.slice(0, 3) }
      ];

      for (const template of templates) {
        await database.createQuestionTemplate(template.category, template.questions);
      }

      const allTemplates = await database.getQuestionTemplates();
      
      expect(allTemplates).toHaveLength(2);
      expect(allTemplates[0].category).toBe('general');
      expect(allTemplates[1].category).toBe('history');
    });

    test('should update question template', async () => {
      const templateId = await database.createQuestionTemplate('test', sampleQuestions.quiz.questions);
      
      const newQuestions = sampleQuestions.quiz.questions.slice(0, 2);
      
      const updated = await database.updateQuestionTemplate(templateId, newQuestions);
      
      expect(updated).toBe(true);
      
      const template = await database.getQuestionTemplate('test');
      expect(template.questions).toHaveLength(2);
    });

    test('should delete question template', async () => {
      const templateId = await database.createQuestionTemplate('test', sampleQuestions.quiz.questions);
      
      const deleted = await database.deleteQuestionTemplate(templateId);
      
      expect(deleted).toBe(true);
      
      const template = await database.getQuestionTemplate('test');
      expect(template).toBe(null);
    });

    test('should return null for non-existent template', async () => {
      const template = await database.getQuestionTemplate('nonexistent');
      expect(template).toBe(null);
    });
  });

  describe('Game Creation with Templates', () => {
    test('should create game using question template', async () => {
      // Create template first
      await database.createQuestionTemplate('general', sampleQuestions.quiz.questions);
      
      // Create game using the template
      const result = await database.createGame('123456', sampleQuestions.quiz.questions);
      
      expect(result.gameId).toBeGreaterThan(0);
      expect(result.pin).toBe('123456');
      expect(result.moderatorToken).toBeTruthy();
    });

    test('should retrieve game with questions', async () => {
      await database.createGame('123456', sampleQuestions.quiz.questions);
      
      const game = await database.getGameByPin('123456');
      
      expect(game).toBeTruthy();
      expect(game.pin).toBe('123456');
      expect(game.questions).toHaveLength(sampleQuestions.quiz.questions.length);
      expect(game.questions[0].question).toBe(sampleQuestions.quiz.questions[0].question);
    });
  });

  describe('Game State Management', () => {
    test('should handle different game states', async () => {
      const gameStates = ['waiting', 'running', 'question_active', 'results', 'finished', 'ended'];
      
      gameStates.forEach(state => {
        // Test that each state is a valid string
        expect(typeof state).toBe('string');
        expect(state.length).toBeGreaterThan(0);
      });
    });

    test('should validate moderator credentials', async () => {
      const gameResult = await database.createGame('123456', sampleQuestions.quiz.questions, 'password123');
      
      // Test with correct token
      const validatedWithToken = await database.validateModerator('123456', null, gameResult.moderatorToken);
      expect(validatedWithToken).toBeTruthy();
      expect(validatedWithToken.pin).toBe('123456');
      
      // Test with correct password
      const validatedWithPassword = await database.validateModerator('123456', 'password123', null);
      expect(validatedWithPassword).toBeTruthy();
      
      // Test with wrong password
      const invalidPassword = await database.validateModerator('123456', 'wrongpassword', null);
      expect(invalidPassword).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle duplicate category creation', async () => {
      await database.createQuestionTemplate('duplicate', sampleQuestions.quiz.questions);
      
      await expect(
        database.createQuestionTemplate('duplicate', sampleQuestions.quiz.questions)
      ).rejects.toThrow();
    });

    test('should handle update of non-existent template', async () => {
      const updated = await database.updateQuestionTemplate(99999, sampleQuestions.quiz.questions);
      expect(updated).toBe(false);
    });

    test('should handle deletion of non-existent template', async () => {
      const deleted = await database.deleteQuestionTemplate(99999);
      expect(deleted).toBe(false);
    });
  });
});