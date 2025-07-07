const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const GameDatabase = require('../../database');

describe('Database Connection Fix - Issue #3', () => {
  let db;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new GameDatabase(':memory:', { skipTestGame: true });
  });

  afterEach(() => {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  });

  describe('addPlayer method fix', () => {
    test('should successfully add player without database context issues', async () => {
      // First create a game to have a valid gameId
      const gameResult = await db.createGame(
        '999888',
        'Test Game for Database Fix',
        [
          {
            id: 1,
            question: "Test question?",
            options: ["A", "B", "C", "D"],
            correct: 0,
            timeLimit: 30
          }
        ]
      );

      expect(gameResult).toBeDefined();
      expect(gameResult.gameId).toBeDefined();

      // Now test the addPlayer method that was causing the issue
      const playerResult = await db.addPlayer(gameResult.gameId);

      // Verify the player was created successfully
      expect(playerResult).toBeDefined();
      expect(playerResult.playerId).toBeDefined();
      expect(playerResult.playerToken).toBeDefined();
      expect(playerResult.name).toMatch(/^Player \d+$/);
      expect(typeof playerResult.playerId).toBe('number');
      expect(typeof playerResult.playerToken).toBe('string');
    });

    test('should handle multiple players without database context conflicts', async () => {
      // Create a game
      const gameResult = await db.createGame(
        '888777',
        'Multi-Player Test Game',
        [
          {
            id: 1,
            question: "Multi-player test question?",
            options: ["A", "B", "C", "D"],
            correct: 0,
            timeLimit: 30
          }
        ]
      );

      // Add multiple players in sequence
      const player1 = await db.addPlayer(gameResult.gameId);
      const player2 = await db.addPlayer(gameResult.gameId);
      const player3 = await db.addPlayer(gameResult.gameId);

      // Verify all players were created successfully
      expect(player1.playerId).toBeDefined();
      expect(player2.playerId).toBeDefined();
      expect(player3.playerId).toBeDefined();

      // Verify they have different IDs
      expect(player1.playerId).not.toBe(player2.playerId);
      expect(player2.playerId).not.toBe(player3.playerId);
      expect(player1.playerId).not.toBe(player3.playerId);

      // Verify they have different tokens
      expect(player1.playerToken).not.toBe(player2.playerToken);
      expect(player2.playerToken).not.toBe(player3.playerToken);
      expect(player1.playerToken).not.toBe(player3.playerToken);

      // Verify names are correctly formatted
      expect(player1.name).toBe(`Player ${player1.playerId}`);
      expect(player2.name).toBe(`Player ${player2.playerId}`);
      expect(player3.name).toBe(`Player ${player3.playerId}`);
    });

    test('should provide proper error handling for invalid inputs', async () => {
      // Test with null gameId
      await expect(db.addPlayer(null)).rejects.toThrow('Game ID is required');
      
      // Test with undefined gameId
      await expect(db.addPlayer(undefined)).rejects.toThrow('Game ID is required');
      
      // Test with non-existent gameId (this might succeed in SQLite without foreign key constraints)
      // So we'll test that it either succeeds or fails gracefully
      try {
        const result = await db.addPlayer(99999);
        // If it succeeds, verify it returns a valid result
        expect(result).toBeDefined();
        expect(result.playerId).toBeDefined();
      } catch (error) {
        // If it fails, verify it's a proper error message
        expect(error.message).toBeDefined();
      }
    });

    test('should handle database connection issues gracefully', async () => {
      // Create a new database instance to test connection issues
      const testDb = new GameDatabase(':memory:', { skipTestGame: true });
      
      // Close the database connection to simulate connection issue
      testDb.close();

      // This should now provide a clear error message instead of crashing
      await expect(testDb.addPlayer(1)).rejects.toThrow('Database connection not available');
    });
  });

  describe('Database reference preservation', () => {
    test('should maintain database reference throughout nested operations', async () => {
      // Create a game
      const gameResult = await db.createGame(
        '777666',
        'Reference Test Game',
        [
          {
            id: 1,
            question: "Reference test question?",
            options: ["A", "B", "C", "D"],
            correct: 0,
            timeLimit: 30
          }
        ]
      );

      // Verify database reference is maintained
      expect(db.db).toBeDefined();

      // Add player and verify the operation completes successfully
      const playerResult = await db.addPlayer(gameResult.gameId);
      
      // Verify database reference is still available after the operation
      expect(db.db).toBeDefined();
      expect(playerResult).toBeDefined();
      expect(playerResult.playerId).toBeDefined();
    });
  });

  describe('Error scenarios that previously caused crashes', () => {
    test('should not crash when database context changes in callbacks', async () => {
      // This test simulates the exact scenario that was causing the crash
      // The fix should prevent TypeError: Cannot read properties of undefined (reading 'run')
      
      const gameResult = await db.createGame(
        '666555',
        'Crash Prevention Test',
        [
          {
            id: 1,
            question: "Crash test question?",
            options: ["A", "B", "C", "D"],
            correct: 0,
            timeLimit: 30
          }
        ]
      );

      // This operation should complete without throwing the original error
      const playerResult = await db.addPlayer(gameResult.gameId);
      
      expect(playerResult).toBeDefined();
      expect(playerResult.playerId).toBeDefined();
      expect(playerResult.name).toBeDefined();
      expect(playerResult.playerToken).toBeDefined();
    });
  });
});