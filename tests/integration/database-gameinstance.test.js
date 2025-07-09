/**
 * Database and GameInstance Integration Tests
 * - Tests synchronization between in-memory game state and database
 * - Tests data persistence and recovery scenarios
 * - Tests concurrent access patterns
 * - Tests game state transitions with database backing
 * - Uses real database and GameInstance implementations
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const GameDatabase = require('../../database');
const { GameInstance } = require('../../lib/gameInstance');
const { 
  createTestDatabase,
  createSampleQuestions,
  generateTestPin,
  generateTestToken,
  createGameWithPlayers,
  delay,
  cleanupTestDatabase
} = require('../helpers/test-utils');

describe('Database and GameInstance Integration Tests', () => {
  let db;
  let gameInstance;
  let gamePin;
  let gameId;
  let questions;

  beforeEach(() => {
    db = createTestDatabase();
    questions = createSampleQuestions();
    gamePin = generateTestPin();
    
    // Create game in database
    const dbResult = db.createGame(gamePin, questions, 'test123');
    gameId = dbResult.gameId;
    
    // Create corresponding GameInstance
    gameInstance = new GameInstance(gamePin, questions, gameId);
  });

  afterEach(() => {
    if (gameInstance) {
      gameInstance.shutdown();
    }
    cleanupTestDatabase(db);
  });

  describe('Game State Synchronization', () => {
    test('should sync game state to database', async () => {
      // Change game state in memory
      gameInstance.phase = 'QUESTION_ACTIVE';
      gameInstance.currentQuestionIndex = 2;
      gameInstance.questionStartTime = Date.now();
      
      // Sync to database
      await gameInstance.syncToDatabase(db);
      
      // Verify state was persisted
      const gameData = db.getGameByPin(gamePin);
      expect(gameData.status).toBe('question_active');
      expect(gameData.current_question_index).toBe(2);
      expect(gameData.question_start_time).toBe(gameInstance.questionStartTime);
      expect(gameData.updated_at).toBeDefined();
    });

    test('should restore game state from database', async () => {
      // Create game state in database
      const state = {
        status: 'results',
        currentQuestionIndex: 3,
        questionStartTime: Date.now() - 30000
      };
      
      db.updateGameState(gameId, state);
      
      // Create new GameInstance from database data
      const gameData = db.getGameByPin(gamePin);
      const restoredGame = new GameInstance(gamePin, gameData.questions, gameId);
      
      // Restore state
      restoredGame.phase = gameData.status.toUpperCase();
      restoredGame.currentQuestionIndex = gameData.current_question_index;
      restoredGame.questionStartTime = gameData.question_start_time;
      
      expect(restoredGame.phase).toBe('RESULTS');
      expect(restoredGame.currentQuestionIndex).toBe(3);
      expect(restoredGame.questionStartTime).toBe(state.questionStartTime);
      
      restoredGame.shutdown();
    });

    test('should handle sync errors gracefully', async () => {
      // Close database to force error
      db.close();
      
      // Should not throw
      await expect(gameInstance.syncToDatabase(db)).resolves.not.toThrow();
    });

    test('should track last sync time', async () => {
      const initialSyncTime = gameInstance.lastSync;
      
      // Add small delay to ensure time difference
      await delay(1);
      
      await gameInstance.syncToDatabase(db);
      
      expect(gameInstance.lastSync).toBeGreaterThan(initialSyncTime);
    });
  });

  describe('Player Data Persistence', () => {
    test('should persist player data between memory and database', async () => {
      // Add player to database
      const playerResult = db.addPlayer(gameId);
      
      // Add player to game instance
      gameInstance.addPlayer(playerResult.playerId, {
        player_token: playerResult.playerToken,
        score: 0
      });
      
      // Update player score in memory
      const player = gameInstance.getPlayer(playerResult.playerId);
      player.score = 1500;
      
      // Persist to database
      db.updatePlayerScore(playerResult.playerId, player.score);
      
      // Verify consistency
      const dbPlayers = db.getGamePlayers(gameId);
      const dbPlayer = dbPlayers.find(p => p.id === playerResult.playerId);
      
      expect(dbPlayer.score).toBe(1500);
      expect(player.score).toBe(1500);
    });

    test('should handle player reconnection across memory and database', async () => {
      // Add player to database
      const playerResult = db.addPlayer(gameId);
      
      // Add to game instance
      gameInstance.addPlayer(playerResult.playerId, {
        player_token: playerResult.playerToken,
        score: 1200
      });
      
      // Simulate disconnection
      gameInstance.removePlayer(playerResult.playerId, false);
      db.disconnectPlayer(playerResult.playerId);
      
      // Reconnect via database
      const reconnectedPlayer = db.reconnectPlayer(gameId, playerResult.playerToken);
      expect(reconnectedPlayer).toBeDefined();
      expect(reconnectedPlayer.id).toBe(playerResult.playerId);
      
      // Restore in memory
      gameInstance.addPlayer(reconnectedPlayer.id, {
        player_token: reconnectedPlayer.player_token,
        score: reconnectedPlayer.score
      });
      
      const memoryPlayer = gameInstance.getPlayer(reconnectedPlayer.id);
      expect(memoryPlayer.connected).toBe(true);
      expect(memoryPlayer.score).toBe(1200);
    });

    test('should maintain player join order consistency', async () => {
      const playerCount = 5;
      const players = [];
      
      // Add players to both database and memory
      for (let i = 0; i < playerCount; i++) {
        const playerResult = db.addPlayer(gameId);
        players.push(playerResult);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 0
        });
      }
      
      // Verify join order in database
      const dbPlayers = db.getGamePlayers(gameId);
      expect(dbPlayers).toHaveLength(playerCount);
      
      // Verify join order in memory
      const memoryPlayers = gameInstance.getConnectedPlayers();
      expect(memoryPlayers).toHaveLength(playerCount);
      
      // Check that join order is consistent
      for (let i = 0; i < playerCount; i++) {
        const memoryPlayer = gameInstance.getPlayer(players[i].playerId);
        expect(memoryPlayer.joinOrder).toBe(i + 1);
      }
    });
  });

  describe('Answer Submission and Persistence', () => {
    let playerId;
    let playerToken;

    beforeEach(async () => {
      // Add a player
      const playerResult = db.addPlayer(gameId);
      playerId = playerResult.playerId;
      playerToken = playerResult.playerToken;
      
      gameInstance.addPlayer(playerId, {
        player_token: playerToken,
        score: 0
      });
    });

    test('should persist answer data from memory to database', async () => {
      // Set up question
      gameInstance.phase = 'QUESTION_ACTIVE';
      gameInstance.questionStartTime = Date.now();
      
      // Submit answer in memory
      const latencies = new Map();
      latencies.set('test-socket', 100);
      
      gameInstance.setPlayerSocket(playerId, 'test-socket');
      const answerData = gameInstance.submitAnswer(playerId, 0, latencies);
      
      expect(answerData).toBeDefined();
      expect(answerData.playerId).toBe(playerId);
      expect(answerData.answer).toBe(0);
      
      // Persist to database
      const question = gameInstance.getCurrentQuestion();
      const isCorrect = answerData.answer === question.correct;
      const points = gameInstance.calculateScore(answerData.responseTime, isCorrect, question.timeLimit);
      
      const answerId = db.saveAnswer(
        gameId,
        playerId,
        gameInstance.currentQuestionIndex,
        answerData.answer,
        isCorrect,
        points,
        answerData.responseTime
      );
      
      expect(answerId).toBeDefined();
      expect(answerId).toBeGreaterThan(0);
      
      // Update player score
      const player = gameInstance.getPlayer(playerId);
      player.score += points;
      db.updatePlayerScore(playerId, player.score);
      
      // Verify data persistence
      const dbPlayers = db.getGamePlayers(gameId);
      const dbPlayer = dbPlayers.find(p => p.id === playerId);
      expect(dbPlayer.score).toBe(player.score);
    });

    test('should handle duplicate answer prevention', async () => {
      gameInstance.phase = 'QUESTION_ACTIVE';
      gameInstance.questionStartTime = Date.now();
      
      const latencies = new Map();
      gameInstance.setPlayerSocket(playerId, 'test-socket');
      
      // Submit first answer
      const firstAnswer = gameInstance.submitAnswer(playerId, 0, latencies);
      expect(firstAnswer).toBeDefined();
      
      // Try to submit duplicate answer
      const duplicateAnswer = gameInstance.submitAnswer(playerId, 1, latencies);
      expect(duplicateAnswer).toBeNull();
      
      // Verify only one answer in memory
      expect(gameInstance.answers).toHaveLength(1);
      
      // Save to database
      const question = gameInstance.getCurrentQuestion();
      const isCorrect = firstAnswer.answer === question.correct;
      const points = gameInstance.calculateScore(firstAnswer.responseTime, isCorrect, question.timeLimit);
      
      const answerId1 = db.saveAnswer(gameId, playerId, 0, firstAnswer.answer, isCorrect, points, firstAnswer.responseTime);
      const answerId2 = db.saveAnswer(gameId, playerId, 0, 1, false, 0, 5000);
      
      // Database should return same ID for duplicate
      expect(answerId1).toBe(answerId2);
    });

    test('should handle multiple players answering concurrently', async () => {
      const playerCount = 10;
      const players = [];
      
      // Add multiple players
      for (let i = 0; i < playerCount; i++) {
        const playerResult = db.addPlayer(gameId);
        players.push(playerResult);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 0
        });
      }
      
      // Set up question
      gameInstance.phase = 'QUESTION_ACTIVE';
      gameInstance.questionStartTime = Date.now();
      
      const latencies = new Map();
      
      // Submit answers from all players
      const answers = [];
      for (let i = 0; i < playerCount; i++) {
        const socketId = `socket-${i}`;
        gameInstance.setPlayerSocket(players[i].playerId, socketId);
        latencies.set(socketId, 50 + i * 10);
        
        const answerData = gameInstance.submitAnswer(players[i].playerId, i % 4, latencies);
        answers.push(answerData);
      }
      
      // Verify all answers were recorded
      expect(answers.filter(a => a !== null)).toHaveLength(playerCount);
      expect(gameInstance.answers).toHaveLength(playerCount);
      
      // Persist all answers to database
      const question = gameInstance.getCurrentQuestion();
      const answerIds = [];
      
      for (let i = 0; i < playerCount; i++) {
        const answer = answers[i];
        const isCorrect = answer.answer === question.correct;
        const points = gameInstance.calculateScore(answer.responseTime, isCorrect, question.timeLimit);
        
        const answerId = db.saveAnswer(
          gameId,
          answer.playerId,
          gameInstance.currentQuestionIndex,
          answer.answer,
          isCorrect,
          points,
          answer.responseTime
        );
        
        answerIds.push(answerId);
        
        // Update player score
        const player = gameInstance.getPlayer(answer.playerId);
        player.score += points;
        db.updatePlayerScore(answer.playerId, player.score);
      }
      
      // Verify all answers were persisted
      expect(answerIds).toHaveLength(playerCount);
      answerIds.forEach(id => expect(id).toBeGreaterThan(0));
    });
  });

  describe('Game Recovery and Restoration', () => {
    test('should recover complete game state from database', async () => {
      // Create complex game state
      const { gameId, gamePin, players } = await createGameWithPlayers(db, {
        playerCount: 3,
        addAnswers: true
      });
      
      // Create game instance from database
      const gameData = db.getGameByPin(gamePin);
      const recoveredGame = new GameInstance(gamePin, gameData.questions, gameId);
      
      // Restore state
      recoveredGame.phase = gameData.status.toUpperCase();
      recoveredGame.currentQuestionIndex = gameData.current_question_index;
      recoveredGame.questionStartTime = gameData.question_start_time;
      
      // Restore players
      const dbPlayers = db.getGamePlayers(gameId);
      dbPlayers.forEach((playerData, index) => {
        recoveredGame.addPlayer(playerData.id, {
          name: `Hráč ${index + 1}`,
          player_token: playerData.player_token,
          score: playerData.score
        });
      });
      
      // Verify recovery
      expect(recoveredGame.players.size).toBe(3);
      expect(recoveredGame.questions).toHaveLength(gameData.questions.length);
      
      // Verify players have correct data
      const recoveredPlayers = recoveredGame.getConnectedPlayers();
      expect(recoveredPlayers).toHaveLength(3);
      
      recoveredGame.shutdown();
    });

    test('should handle partial game state recovery', async () => {
      // Create game with some players
      const playerResults = [];
      for (let i = 0; i < 3; i++) {
        const playerResult = db.addPlayer(gameId);
        playerResults.push(playerResult);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 500 + i * 100
        });
      }
      
      // Update game state
      gameInstance.phase = 'QUESTION_ACTIVE';
      gameInstance.currentQuestionIndex = 2;
      gameInstance.questionStartTime = Date.now();
      
      // Sync to database
      await gameInstance.syncToDatabase(db);
      
      // Simulate server restart - create new instance
      const gameData = db.getGameByPin(gamePin);
      const newGameInstance = new GameInstance(gamePin, gameData.questions, gameId);
      
      // Restore state
      newGameInstance.phase = gameData.status.toUpperCase();
      newGameInstance.currentQuestionIndex = gameData.current_question_index;
      newGameInstance.questionStartTime = gameData.question_start_time;
      
      // Restore players
      const dbPlayers = db.getGamePlayers(gameId);
      dbPlayers.forEach((playerData, index) => {
        newGameInstance.addPlayer(playerData.id, {
          name: `Hráč ${index + 1}`,
          player_token: playerData.player_token,
          score: playerData.score
        });
      });
      
      expect(newGameInstance.phase).toBe('QUESTION_ACTIVE');
      expect(newGameInstance.currentQuestionIndex).toBe(2);
      expect(newGameInstance.players.size).toBe(3);
      
      // Verify scores were restored
      const restoredPlayers = newGameInstance.getConnectedPlayers();
      restoredPlayers.forEach((player, index) => {
        expect(player.score).toBe(500 + index * 100);
      });
      
      newGameInstance.shutdown();
    });

    test('should handle game recovery with missing data', async () => {
      // Create game with minimal data
      const gameData = db.getGameByPin(gamePin);
      
      // Create new instance with potentially missing data
      const recoveredGame = new GameInstance(gamePin, gameData.questions || [], gameId);
      
      // Should initialize properly even with missing data
      expect(recoveredGame.phase).toBe('WAITING');
      expect(recoveredGame.currentQuestionIndex).toBe(0);
      expect(recoveredGame.players.size).toBe(0);
      
      recoveredGame.shutdown();
    });
  });

  describe('Concurrent Access and Data Integrity', () => {
    test('should handle concurrent game state updates', async () => {
      const updatePromises = [];
      
      // Simulate concurrent updates
      for (let i = 0; i < 10; i++) {
        const promise = (async () => {
          gameInstance.currentQuestionIndex = i;
          await gameInstance.syncToDatabase(db);
          return i;
        })();
        
        updatePromises.push(promise);
      }
      
      const results = await Promise.all(updatePromises);
      
      expect(results).toHaveLength(10);
      
      // Verify final state
      const gameData = db.getGameByPin(gamePin);
      expect(gameData.current_question_index).toBeDefined();
      expect(gameData.current_question_index).toBeGreaterThanOrEqual(0);
      expect(gameData.current_question_index).toBeLessThan(10);
    });

    test('should handle concurrent player operations', async () => {
      const playerPromises = [];
      
      // Add multiple players concurrently
      for (let i = 0; i < 20; i++) {
        const promise = (async () => {
          const playerResult = db.addPlayer(gameId);
          
          gameInstance.addPlayer(playerResult.playerId, {
            player_token: playerResult.playerToken,
            score: 0
          });
          
          return playerResult.playerId;
        })();
        
        playerPromises.push(promise);
      }
      
      const playerIds = await Promise.all(playerPromises);
      
      expect(playerIds).toHaveLength(20);
      expect(gameInstance.players.size).toBe(20);
      
      // Verify database consistency
      const dbPlayers = db.getGamePlayers(gameId);
      expect(dbPlayers).toHaveLength(20);
    });

    test('should maintain data integrity during rapid operations', async () => {
      // Add players
      const playerResults = [];
      for (let i = 0; i < 5; i++) {
        const playerResult = db.addPlayer(gameId);
        playerResults.push(playerResult);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 0
        });
      }
      
      // Set up question
      gameInstance.phase = 'QUESTION_ACTIVE';
      gameInstance.questionStartTime = Date.now();
      
      // Submit answers rapidly
      const operations = [];
      for (let i = 0; i < 100; i++) {
        const playerId = playerResults[i % playerResults.length].playerId;
        const socketId = `socket-${i}`;
        
        const operation = (async () => {
          const latencies = new Map();
          latencies.set(socketId, 50);
          
          gameInstance.setPlayerSocket(playerId, socketId);
          const answerData = gameInstance.submitAnswer(playerId, i % 4, latencies);
          
          if (answerData) {
            const question = gameInstance.getCurrentQuestion();
            const isCorrect = answerData.answer === question.correct;
            const points = gameInstance.calculateScore(answerData.responseTime, isCorrect, question.timeLimit);
            
            return db.saveAnswer(
              gameId,
              playerId,
              gameInstance.currentQuestionIndex,
              answerData.answer,
              isCorrect,
              points,
              answerData.responseTime
            );
          }
          
          return null;
        })();
        
        operations.push(operation);
      }
      
      const results = await Promise.all(operations);
      
      // Should have processed some answers (not all due to duplicates)
      const successfulAnswers = results.filter(r => r !== null);
      expect(successfulAnswers.length).toBeLessThanOrEqual(playerResults.length);
      expect(successfulAnswers.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Management and Cleanup', () => {
    test('should clean up disconnected players from both memory and database', async () => {
      // Add players
      const playerResults = [];
      for (let i = 0; i < 5; i++) {
        const playerResult = db.addPlayer(gameId);
        playerResults.push(playerResult);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 0
        });
      }
      
      expect(gameInstance.getConnectedPlayerCount()).toBe(5);
      
      // Disconnect some players
      gameInstance.removePlayer(playerResults[0].playerId, false);
      gameInstance.removePlayer(playerResults[1].playerId, false);
      
      db.disconnectPlayer(playerResults[0].playerId);
      db.disconnectPlayer(playerResults[1].playerId);
      
      expect(gameInstance.getConnectedPlayerCount()).toBe(3);
      
      // Verify database state
      const dbPlayers = db.getGamePlayers(gameId);
      const connectedDbPlayers = dbPlayers.filter(p => p.connected);
      expect(connectedDbPlayers).toHaveLength(3);
    });

    test('should handle memory cleanup with database sync', async () => {
      // Add many players
      for (let i = 0; i < 50; i++) {
        const playerResult = db.addPlayer(gameId);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 0
        });
      }
      
      // Disconnect many players
      for (let i = 1; i <= 25; i++) {
        gameInstance.removePlayer(i, false);
        
        // Set old lastSeen to trigger cleanup
        const player = gameInstance.getPlayer(i);
        if (player) {
          player.lastSeen = Date.now() - gameInstance.disconnectedPlayerTTL - 1000;
        }
      }
      
      // Force memory cleanup
      gameInstance.performMemoryCleanup();
      
      // Verify cleanup
      expect(gameInstance.players.size).toBeLessThan(50);
      expect(gameInstance.getConnectedPlayerCount()).toBe(25);
      
      // Sync to database
      await gameInstance.syncToDatabase(db);
      
      // Verify database reflects cleanup
      const dbPlayers = db.getGamePlayers(gameId);
      expect(dbPlayers).toHaveLength(50); // Database keeps all players
      
      const connectedDbPlayers = dbPlayers.filter(p => p.connected);
      expect(connectedDbPlayers).toHaveLength(25);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large-scale operations efficiently', async () => {
      const startTime = Date.now();
      
      // Create many players
      const playerCount = 100;
      const players = [];
      
      for (let i = 0; i < playerCount; i++) {
        const playerResult = db.addPlayer(gameId);
        players.push(playerResult);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: Math.floor(Math.random() * 1000)
        });
      }
      
      // Generate leaderboard multiple times
      for (let i = 0; i < 10; i++) {
        const leaderboard = gameInstance.getLeaderboard();
        expect(leaderboard).toHaveLength(playerCount);
      }
      
      // Sync to database
      await gameInstance.syncToDatabase(db);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
      
      // Verify data integrity
      const dbPlayers = db.getGamePlayers(gameId);
      expect(dbPlayers).toHaveLength(playerCount);
    });

    test('should maintain performance with frequent sync operations', async () => {
      // Add some players
      for (let i = 0; i < 20; i++) {
        const playerResult = db.addPlayer(gameId);
        
        gameInstance.addPlayer(playerResult.playerId, {
          player_token: playerResult.playerToken,
          score: 0
        });
      }
      
      const startTime = Date.now();
      
      // Perform many sync operations
      const syncPromises = [];
      for (let i = 0; i < 50; i++) {
        gameInstance.currentQuestionIndex = i % 5;
        syncPromises.push(gameInstance.syncToDatabase(db));
      }
      
      await Promise.all(syncPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // 2 seconds
      
      // Verify final state
      const gameData = db.getGameByPin(gamePin);
      expect(gameData.current_question_index).toBeDefined();
    });
  });
});