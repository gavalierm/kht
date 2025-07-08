/**
 * Dashboard API integration tests
 * Tests the new question template API endpoints
 */

const request = require('supertest');
const express = require('express');
const GameDatabase = require('../../database');
const { sampleQuestions } = require('../fixtures/sample-data');

describe('Dashboard API Integration', () => {
  let app;
  let database;
  let server;

  beforeAll(async () => {
    // Create test app with API endpoints
    app = express();
    app.use(express.json());
    
    database = new GameDatabase(':memory:', { skipTestGame: true });
    
    // Wait for database initialization to complete
    await database.waitForInitialization();

    // Add question template API endpoints (copied from server.js)
    app.get('/api/question-templates', async (req, res) => {
      try {
        const templates = await database.getQuestionTemplates();
        res.json(templates);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch question templates' });
      }
    });

    app.get('/api/question-templates/:category', async (req, res) => {
      try {
        const { category } = req.params;
        const template = await database.getQuestionTemplate(category);
        
        if (!template) {
          return res.status(404).json({ error: 'Question template not found' });
        }
        
        res.json(template);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch question template' });
      }
    });

    app.post('/api/question-templates', async (req, res) => {
      try {
        const { category, title, questions } = req.body;
        
        if (!category || !title || !questions || !Array.isArray(questions)) {
          return res.status(400).json({ error: 'Missing required fields: category, title, questions' });
        }
        
        // Validate questions structure
        const isValidQuestions = questions.every(q => 
          q && 
          typeof q === 'object' &&
          q.question && 
          typeof q.question === 'string' &&
          Array.isArray(q.options) && 
          q.options.length === 4 && 
          q.options.every(opt => typeof opt === 'string') &&
          typeof q.correct === 'number' && 
          q.correct >= 0 && 
          q.correct <= 3 &&
          typeof q.timeLimit === 'number' &&
          q.timeLimit > 0
        );
        
        if (!isValidQuestions) {
          return res.status(400).json({ error: 'Invalid question format' });
        }
        
        const templateId = await database.createQuestionTemplate(category, title, questions);
        res.json({ id: templateId, category, title, questions });
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
          res.status(409).json({ error: 'Category already exists' });
        } else {
          res.status(500).json({ error: 'Failed to create question template' });
        }
      }
    });

    app.put('/api/question-templates/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { title, questions } = req.body;
        
        if (!title || !questions || !Array.isArray(questions)) {
          return res.status(400).json({ error: 'Missing required fields: title, questions' });
        }
        
        const updated = await database.updateQuestionTemplate(id, title, questions);
        
        if (!updated) {
          return res.status(404).json({ error: 'Question template not found' });
        }
        
        res.json({ message: 'Question template updated successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update question template' });
      }
    });

    app.delete('/api/question-templates/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const deleted = await database.deleteQuestionTemplate(id);
        
        if (!deleted) {
          return res.status(404).json({ error: 'Question template not found' });
        }
        
        res.json({ message: 'Question template deleted successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to delete question template' });
      }
    });
  });

  afterAll(() => {
    if (database) {
      database.close();
    }
    if (server) {
      server.close();
    }
  });

  describe('GET /api/question-templates', () => {
    test('should return empty array when no templates exist', async () => {
      const response = await request(app)
        .get('/api/question-templates')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should return all question templates', async () => {
      // Create test templates
      await database.createQuestionTemplate('general', 'General Knowledge', sampleQuestions.quiz.questions);
      await database.createQuestionTemplate('history', 'History', sampleQuestions.quiz.questions.slice(0, 2));

      const response = await request(app)
        .get('/api/question-templates')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].category).toBe('general');
      expect(response.body[1].category).toBe('history');
    });
  });

  describe('GET /api/question-templates/:category', () => {
    test('should return specific question template', async () => {
      await database.createQuestionTemplate('test-get', 'Test Questions', sampleQuestions.quiz.questions);
      
      const response = await request(app)
        .get('/api/question-templates/test-get')
        .expect(200);

      expect(response.body.category).toBe('test-get');
      expect(response.body.title).toBe('Test Questions');
      expect(response.body.questions).toHaveLength(sampleQuestions.quiz.questions.length);
    });

    test('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .get('/api/question-templates/nonexistent')
        .expect(404);

      expect(response.body.error).toBe('Question template not found');
    });
  });

  describe('POST /api/question-templates', () => {
    test('should create new question template', async () => {
      const templateData = {
        category: 'science',
        title: 'Science Questions',
        questions: sampleQuestions.quiz.questions.slice(0, 3)
      };

      const response = await request(app)
        .post('/api/question-templates')
        .send(templateData)
        .expect(200);

      expect(response.body.id).toBeGreaterThan(0);
      expect(response.body.category).toBe('science');
      expect(response.body.title).toBe('Science Questions');
    });

    test('should validate required fields', async () => {
      const invalidData = {
        category: 'invalid'
        // missing title and questions
      };

      const response = await request(app)
        .post('/api/question-templates')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Missing required fields');
    });

    test('should validate questions format', async () => {
      const invalidData = {
        category: 'invalid',
        title: 'Invalid Questions',
        questions: [
          {
            question: 'Invalid question',
            options: ['A', 'B'], // Too few options
            correct: 0,
            timeLimit: 30
          }
        ]
      };

      const response = await request(app)
        .post('/api/question-templates')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Invalid question format');
    });

    test('should handle duplicate category', async () => {
      const templateData = {
        category: 'duplicate',
        title: 'First Template',
        questions: sampleQuestions.quiz.questions
      };

      // Create first template
      await request(app)
        .post('/api/question-templates')
        .send(templateData)
        .expect(200);

      // Try to create duplicate
      templateData.title = 'Second Template';
      const response = await request(app)
        .post('/api/question-templates')
        .send(templateData)
        .expect(409);

      expect(response.body.error).toBe('Category already exists');
    });
  });

  describe('PUT /api/question-templates/:id', () => {
    test('should update question template', async () => {
      const templateId = await database.createQuestionTemplate('updatetest-1', 'Original Title', sampleQuestions.quiz.questions);
      
      const updateData = {
        title: 'Updated Title',
        questions: sampleQuestions.quiz.questions.slice(0, 2)
      };

      const response = await request(app)
        .put(`/api/question-templates/${templateId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Question template updated successfully');

      // Verify update
      const template = await database.getQuestionTemplate('updatetest-1');
      expect(template.title).toBe('Updated Title');
      expect(template.questions).toHaveLength(2);
    });

    test('should return 404 for non-existent template', async () => {
      const updateData = {
        title: 'Updated Title',
        questions: sampleQuestions.quiz.questions
      };

      const response = await request(app)
        .put('/api/question-templates/99999')
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Question template not found');
    });
  });

  describe('DELETE /api/question-templates/:id', () => {
    let templateId;

    beforeEach(async () => {
      templateId = await database.createQuestionTemplate('deletetest', 'To Delete', sampleQuestions.quiz.questions);
    });

    test('should delete question template', async () => {
      const response = await request(app)
        .delete(`/api/question-templates/${templateId}`)
        .expect(200);

      expect(response.body.message).toBe('Question template deleted successfully');

      // Verify deletion
      const template = await database.getQuestionTemplate('deletetest');
      expect(template).toBe(null);
    });

    test('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .delete('/api/question-templates/99999')
        .expect(404);

      expect(response.body.error).toBe('Question template not found');
    });
  });
});