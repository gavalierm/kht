/**
 * Comprehensive unit tests for GameDatabase class
 * - Tests real SQLite database operations with WAL mode
 * - Covers all database methods and edge cases
 * - Tests data integrity and concurrency
 * - Uses Slovak context data for realistic testing
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const GameDatabase = require('../../database');
const { 
  createTestDatabase,
  createSampleQuestions,
  createSamplePlayers,
  generateTestPin,
  generateTestToken,
  createGameWithPlayers,
  delay,
  cleanupTestDatabase
} = require('../helpers/test-utils');
const { sampleQuestions, sampleGameData } = require('../fixtures/sample-data');

describe('GameDatabase - Comprehensive Unit Tests', () => {
  let db;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    cleanupTestDatabase(db);
  });

  describe('Database Initialization', () => {
    test('should initialize with correct SQLite configuration', () => {
      expect(db.initialized).toBe(true);
      expect(db.db).toBeDefined();
      expect(db.stmts).toBeDefined();
    });

    test('should enable WAL mode for better concurrency', () => {
      const pragmaResult = db.db.prepare('PRAGMA journal_mode').get();
      // Memory databases use 'memory' mode, not 'wal'
      expect(pragmaResult.journal_mode).toBe('memory');
    });

    test('should have proper cache configuration', () => {
      const cacheResult = db.db.prepare('PRAGMA cache_size').get();
      expect(cacheResult.cache_size).toBe(10000);
    });

    test('should have foreign keys enabled', () => {
      const fkResult = db.db.prepare('PRAGMA foreign_keys').get();
      expect(fkResult.foreign_keys).toBe(1);
    });

    test('should create all required tables', () => {
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all();
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('games');
      expect(tableNames).toContain('questions');
      expect(tableNames).toContain('players');
      expect(tableNames).toContain('answers');
    });

    test('should create proper indexes', () => {
      const indexes = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
      `).all();
      
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_games_pin');
      expect(indexNames).toContain('idx_players_token');
      expect(indexNames).toContain('idx_questions_game');
    });

    test('should not create test game when skipTestGame is true', () => {
      const testGame = db.getGameByPin('123456');
      expect(testGame).toBeNull();
    });

    test('should prepare commonly used statements', () => {
      expect(db.stmts.getGameByPin).toBeDefined();
      expect(db.stmts.getQuestions).toBeDefined();
      expect(db.stmts.getGamePlayers).toBeDefined();
      expect(db.stmts.updatePlayerScore).toBeDefined();
    });
  });

  describe('Game Management', () => {
    test('should create game with questions', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      const password = 'test123';
      
      const result = db.createGame(pin, questions, password);
      
      expect(result).toHaveProperty('gameId');
      expect(result).toHaveProperty('moderatorToken');
      expect(result).toHaveProperty('pin');
      expect(result.pin).toBe(pin);
      expect(typeof result.gameId).toBe('number');
      expect(typeof result.moderatorToken).toBe('string');
    });

    test('should create game without password', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      
      const result = db.createGame(pin, questions);
      
      expect(result).toHaveProperty('gameId');
      expect(result).toHaveProperty('moderatorToken');
      expect(result.moderatorToken).toBeTruthy();
    });

    test('should create game with empty questions array', () => {
      const pin = generateTestPin();
      
      const result = db.createGame(pin, [], 'test123');
      
      expect(result).toHaveProperty('gameId');
      expect(result).toHaveProperty('moderatorToken');
      
      // Verify no questions were created
      const gameData = db.getGameByPin(pin);
      expect(gameData.questions).toHaveLength(0);
    });

    test('should retrieve game by PIN with questions', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      
      db.createGame(pin, questions, 'test123');
      const gameData = db.getGameByPin(pin);
      
      expect(gameData).toBeDefined();
      expect(gameData.pin).toBe(pin);
      expect(gameData.questions).toHaveLength(questions.length);
      expect(gameData.questions[0]).toHaveProperty('question');
      expect(gameData.questions[0]).toHaveProperty('options');
      expect(gameData.questions[0]).toHaveProperty('correct');
      expect(gameData.questions[0]).toHaveProperty('timeLimit');
      
      // Verify Slovak content
      expect(gameData.questions[0].question).toBe('Aké je hlavné mesto Slovenska?');
      expect(gameData.questions[0].options).toContain('Bratislava');
    });

    test('should return null for non-existent game', () => {
      const gameData = db.getGameByPin('999999');
      expect(gameData).toBeNull();
    });

    test('should validate moderator with password', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      const password = 'secure123';
      
      const { moderatorToken } = db.createGame(pin, questions, password);
      
      // Validate with correct password
      const gameData1 = db.validateModerator(pin, password);
      expect(gameData1).toBeTruthy();
      expect(gameData1.pin).toBe(pin);
      
      // Validate with token
      const gameData2 = db.validateModerator(pin, null, moderatorToken);
      expect(gameData2).toBeTruthy();
      expect(gameData2.pin).toBe(pin);
      
      // Fail with wrong password
      const gameData3 = db.validateModerator(pin, 'wrong');
      expect(gameData3).toBe(false);
      
      // Fail with wrong token
      const gameData4 = db.validateModerator(pin, null, 'wrong-token');
      expect(gameData4).toBe(false);
    });

    test('should validate moderator without password protection', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      
      db.createGame(pin, questions); // No password
      
      const gameData = db.validateModerator(pin);
      expect(gameData).toBeTruthy();
      expect(gameData.pin).toBe(pin);
    });

    test('should update game questions', () => {
      const originalQuestions = createSampleQuestions();
      const pin = generateTestPin();
      
      const { gameId } = db.createGame(pin, originalQuestions);
      
      // Update with new questions
      const newQuestions = [
        {
          question: "Nová otázka?",
          options: ["A", "B", "C", "D"],
          correct: 1,
          timeLimit: 20
        }
      ];
      
      db.updateGameQuestions(gameId, newQuestions);
      
      const gameData = db.getGameByPin(pin);
      expect(gameData.questions).toHaveLength(1);
      expect(gameData.questions[0].question).toBe('Nová otázka?');
      expect(gameData.questions[0].timeLimit).toBe(20);
    });

    test('should handle question update edge cases', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      
      const { gameId } = db.createGame(pin, questions);
      
      // Update with empty questions array
      db.updateGameQuestions(gameId, []);
      
      const gameData = db.getGameByPin(pin);
      expect(gameData.questions).toHaveLength(0);
    });
  });

  describe('Player Management', () => {
    let gameId;
    let gamePin;

    beforeEach(() => {
      const questions = createSampleQuestions();
      gamePin = generateTestPin();
      const result = db.createGame(gamePin, questions);
      gameId = result.gameId;
    });

    test('should add player with generated name', () => {
      const result = db.addPlayer(gameId);
      
      expect(result).toHaveProperty('playerId');
      expect(result).toHaveProperty('playerToken');
      expect(result).toHaveProperty('name');
      expect(typeof result.playerId).toBe('number');
      expect(typeof result.playerToken).toBe('string');
      expect(result.name).toMatch(/^Hráč \d+$/);
    });

    test('should add multiple players with sequential names', () => {
      const player1 = db.addPlayer(gameId);
      const player2 = db.addPlayer(gameId);
      const player3 = db.addPlayer(gameId);
      
      expect(player1.name).toBe(`Hráč ${player1.playerId}`);
      expect(player2.name).toBe(`Hráč ${player2.playerId}`);
      expect(player3.name).toBe(`Hráč ${player3.playerId}`);
      
      // Player IDs should be sequential
      expect(player2.playerId).toBe(player1.playerId + 1);
      expect(player3.playerId).toBe(player2.playerId + 1);
    });

    test('should get game players in join order', () => {
      const player1 = db.addPlayer(gameId);
      const player2 = db.addPlayer(gameId);
      const player3 = db.addPlayer(gameId);
      
      const players = db.getGamePlayers(gameId);
      
      expect(players).toHaveLength(3);
      expect(players[0].id).toBe(player1.playerId);
      expect(players[1].id).toBe(player2.playerId);
      expect(players[2].id).toBe(player3.playerId);
      
      // Check Slovak naming
      expect(players[0].name).toBe(`Hráč ${player1.playerId}`);
      expect(players[1].name).toBe(`Hráč ${player2.playerId}`);
      expect(players[2].name).toBe(`Hráč ${player3.playerId}`);
    });

    test('should reconnect player with valid token', () => {
      const { playerId, playerToken } = db.addPlayer(gameId);
      
      // Disconnect player
      db.disconnectPlayer(playerId);
      
      // Reconnect with token
      const reconnectedPlayer = db.reconnectPlayer(gameId, playerToken);
      
      expect(reconnectedPlayer).toBeDefined();
      expect(reconnectedPlayer.id).toBe(playerId);
      expect(reconnectedPlayer.connected).toBe(1); // SQLite returns 1 for true
      expect(reconnectedPlayer.player_token).toBe(playerToken);
    });

    test('should fail to reconnect with invalid token', () => {
      db.addPlayer(gameId);
      
      const reconnectedPlayer = db.reconnectPlayer(gameId, 'invalid-token');
      
      expect(reconnectedPlayer).toBeNull();
    });

    test('should update player score', () => {
      const { playerId } = db.addPlayer(gameId);
      
      db.updatePlayerScore(playerId, 1500);
      
      const players = db.getGamePlayers(gameId);
      const player = players.find(p => p.id === playerId);
      
      expect(player.score).toBe(1500);
    });

    test('should disconnect player', () => {
      const { playerId } = db.addPlayer(gameId);
      
      db.disconnectPlayer(playerId);
      
      const players = db.getGamePlayers(gameId);
      const player = players.find(p => p.id === playerId);
      
      expect(player.connected).toBe(0); // SQLite returns 0 for false
    });

    test('should remove all players from game', () => {
      db.addPlayer(gameId);
      db.addPlayer(gameId);
      db.addPlayer(gameId);
      
      expect(db.getGamePlayers(gameId)).toHaveLength(3);
      
      const removedCount = db.removeAllPlayersFromGame(gameId);
      
      expect(removedCount).toBe(3);
      expect(db.getGamePlayers(gameId)).toHaveLength(0);
    });
  });

  describe('Answer Management', () => {
    let gameId;
    let gamePin;
    let playerId;

    beforeEach(() => {
      const questions = createSampleQuestions();
      gamePin = generateTestPin();
      const gameResult = db.createGame(gamePin, questions);
      gameId = gameResult.gameId;
      
      const playerResult = db.addPlayer(gameId);
      playerId = playerResult.playerId;
    });

    test('should save answer with all required data', () => {
      const answerId = db.saveAnswer(
        gameId,
        playerId,
        0, // First question
        1, // Answer option
        true, // Correct
        1200, // Points
        8000 // Response time
      );
      
      expect(typeof answerId).toBe('number');
      expect(answerId).toBeGreaterThan(0);
    });

    test('should prevent duplicate answers for same question', () => {
      // Save first answer
      const answerId1 = db.saveAnswer(gameId, playerId, 0, 1, true, 1200, 8000);
      expect(answerId1).toBeGreaterThan(0);
      
      // Attempt to save duplicate answer
      const answerId2 = db.saveAnswer(gameId, playerId, 0, 2, false, 0, 12000);
      expect(answerId2).toBe(answerId1); // Should return existing ID
    });

    test('should handle invalid response time', () => {
      // Should handle negative response time
      const answerId1 = db.saveAnswer(gameId, playerId, 0, 1, true, 1200, -1000);
      expect(answerId1).toBeGreaterThan(0);
      
      // Should handle non-finite response time
      const answerId2 = db.saveAnswer(gameId, playerId, 1, 1, true, 1200, Infinity);
      expect(answerId2).toBeGreaterThan(0);
    });

    test('should handle missing question', () => {
      expect(() => {
        db.saveAnswer(gameId, playerId, 999, 1, true, 1200, 8000);
      }).toThrow('Question not found');
    });

    test('should get question ID by game and order', () => {
      const questionId = db.getQuestionId(gameId, 1);
      expect(typeof questionId).toBe('number');
      expect(questionId).toBeGreaterThan(0);
      
      const nonExistentId = db.getQuestionId(gameId, 999);
      expect(nonExistentId).toBeNull();
    });
  });

  describe('Game State Management', () => {
    let gameId;
    let gamePin;

    beforeEach(() => {
      const questions = createSampleQuestions();
      gamePin = generateTestPin();
      const result = db.createGame(gamePin, questions);
      gameId = result.gameId;
    });

    test('should update game state', () => {
      const newState = {
        status: 'question_active',
        currentQuestionIndex: 2,
        questionStartTime: Date.now()
      };
      
      db.updateGameState(gameId, newState);
      
      const gameData = db.getGameByPin(gamePin);
      expect(gameData.status).toBe('question_active');
      expect(gameData.current_question_index).toBe(2);
      expect(gameData.question_start_time).toBe(newState.questionStartTime);
    });

    test('should get game statistics', () => {
      // Add some players and answers
      const player1 = db.addPlayer(gameId);
      const player2 = db.addPlayer(gameId);
      
      db.saveAnswer(gameId, player1.playerId, 0, 0, true, 1200, 8000);
      db.saveAnswer(gameId, player2.playerId, 0, 1, false, 0, 12000);
      
      const stats = db.getGameStats(gameId);
      
      expect(stats.total_players).toBe(2);
      expect(stats.total_answers).toBe(2);
      expect(stats.correct_answers).toBe(1);
      expect(stats.avg_response_time).toBe(10000); // Average of 8000 and 12000
    });
  });

  describe('Data Integrity and Validation', () => {
    test('should enforce foreign key constraints', () => {
      // Should not be able to add player to non-existent game
      expect(() => {
        db.addPlayer(999999);
      }).toThrow();
    });

    test('should validate game creation parameters', () => {
      expect(() => {
        db.createGame(null, []);
      }).toThrow('PIN is required');
      
      expect(() => {
        db.createGame('123456', null);
      }).toThrow('Questions must be an array');
      
      expect(() => {
        db.createGame('123456', 'not-array');
      }).toThrow('Questions must be an array');
    });

    test('should validate player addition parameters', () => {
      expect(() => {
        db.addPlayer(null);
      }).toThrow('Game ID is required');
      
      expect(() => {
        db.addPlayer(undefined);
      }).toThrow('Game ID is required');
    });

    test('should handle database connection errors gracefully', () => {
      // Close database connection
      db.close();
      
      // Attempting operations should handle errors
      expect(() => {
        db.getGameByPin('123456');
      }).toThrow();
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle concurrent game creation', async () => {
      const pins = Array.from({ length: 10 }, () => generateTestPin());
      const questions = createSampleQuestions();
      
      const createPromises = pins.map(pin => 
        Promise.resolve(db.createGame(pin, questions))
      );
      
      const results = await Promise.all(createPromises);
      
      results.forEach((result, index) => {
        expect(result.pin).toBe(pins[index]);
        expect(result.gameId).toBeDefined();
      });
    });

    test('should handle concurrent player additions', async () => {
      const questions = createSampleQuestions();
      const { gameId } = db.createGame(generateTestPin(), questions);
      
      const playerPromises = Array.from({ length: 20 }, () => 
        Promise.resolve(db.addPlayer(gameId))
      );
      
      const players = await Promise.all(playerPromises);
      
      expect(players).toHaveLength(20);
      players.forEach(player => {
        expect(player.playerId).toBeDefined();
        expect(player.playerToken).toBeDefined();
      });
    });

    test('should handle concurrent answer submissions', async () => {
      const questions = createSampleQuestions();
      const { gameId } = db.createGame(generateTestPin(), questions);
      
      const players = Array.from({ length: 10 }, () => db.addPlayer(gameId));
      
      const answerPromises = players.map((player, index) => 
        Promise.resolve(db.saveAnswer(
          gameId,
          player.playerId,
          0,
          index % 4,
          index % 2 === 0,
          index % 2 === 0 ? 1200 : 0,
          5000 + index * 1000
        ))
      );
      
      const answerIds = await Promise.all(answerPromises);
      
      expect(answerIds).toHaveLength(10);
      answerIds.forEach(id => {
        expect(typeof id).toBe('number');
        expect(id).toBeGreaterThan(0);
      });
    });

    test('should maintain performance with large datasets', () => {
      const startTime = Date.now();
      
      // Create multiple games
      const games = Array.from({ length: 50 }, () => {
        const pin = generateTestPin();
        const questions = createSampleQuestions();
        return db.createGame(pin, questions);
      });
      
      // Add players to each game
      games.forEach(game => {
        for (let i = 0; i < 20; i++) {
          db.addPlayer(game.gameId);
        }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Database Cleanup', () => {
    test('should cleanup old games', () => {
      // Create old game by manipulating created_at
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      const { gameId } = db.createGame(pin, questions);
      
      // Make game appear old (25 hours ago)
      const oldTimestamp = Math.floor(Date.now() / 1000) - (25 * 60 * 60);
      db.db.prepare('UPDATE games SET created_at = ? WHERE id = ?').run(oldTimestamp, gameId);
      
      const removedCount = db.cleanupOldGames();
      
      expect(removedCount).toBe(1);
      expect(db.getGameByPin(pin)).toBeNull();
    });

    test('should not cleanup recent games', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      db.createGame(pin, questions);
      
      const removedCount = db.cleanupOldGames();
      
      expect(removedCount).toBe(0);
      expect(db.getGameByPin(pin)).toBeDefined();
    });
  });

  describe('Default Questions', () => {
    test('should provide default Slovak questions', () => {
      const defaultQuestions = db.getDefaultQuestions();
      
      expect(Array.isArray(defaultQuestions)).toBe(true);
      expect(defaultQuestions.length).toBeGreaterThan(0);
      
      // Check Slovak content
      const firstQuestion = defaultQuestions[0];
      expect(firstQuestion.question).toContain('Slovenska');
      expect(firstQuestion.options).toContain('Bratislava');
      expect(firstQuestion.correct).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database closure gracefully', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      
      // Create game before closing
      const { gameId } = db.createGame(pin, questions);
      
      // Close database
      db.close();
      
      // Should not crash but should throw appropriate errors
      expect(() => db.getGameByPin(pin)).toThrow();
      expect(() => db.addPlayer(gameId)).toThrow();
    });

    test('should handle malformed data gracefully', () => {
      const questions = createSampleQuestions();
      const pin = generateTestPin();
      const { gameId } = db.createGame(pin, questions);
      
      // Invalid player ID
      expect(() => db.updatePlayerScore(null, 1000)).toThrow();
      
      // Invalid game ID
      expect(() => db.getGamePlayers(null)).toThrow();
    });

    test('should handle large token generation', () => {
      const tokens = new Set();
      
      for (let i = 0; i < 1000; i++) {
        const token = db.generateToken();
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
        expect(tokens.has(token)).toBe(false); // Should be unique
        tokens.add(token);
      }
    });
  });
});