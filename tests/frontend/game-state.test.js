/**
 * Frontend Tests for GameState Management
 * - Tests client-side state management logic
 * - Tests localStorage integration
 * - Tests Slovak language context
 * - Tests state transitions and persistence
 * - Uses JSDOM environment for DOM simulation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { GameState } from '../../public/shared/gameState.js';

// Mock localStorage for JSDOM environment
const localStorageMock = {
  store: {},
  getItem: function(key) {
    return this.store[key] || null;
  },
  setItem: function(key, value) {
    this.store[key] = value.toString();
  },
  removeItem: function(key) {
    delete this.store[key];
  },
  clear: function() {
    this.store = {};
  }
};

// Setup JSDOM environment
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

global.localStorage = localStorageMock;

describe('GameState Management Frontend Tests', () => {
  let gameState;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();
    
    // Create fresh GameState instance
    gameState = new GameState();
  });

  afterEach(() => {
    // Clean up timers
    gameState.clearTimers();
  });

  describe('Initialization and Basic State', () => {
    test('should initialize with correct default values', () => {
      expect(gameState.gamePin).toBeNull();
      expect(gameState.currentGame).toBeNull();
      expect(gameState.currentQuestion).toBeNull();
      expect(gameState.hasAnswered).toBe(false);
      expect(gameState.isWaiting).toBe(true);
      expect(gameState.playerToken).toBeNull();
      expect(gameState.moderatorToken).toBeNull();
      expect(gameState.playerId).toBeNull();
      expect(gameState.playerName).toBeNull();
      expect(gameState.timerInterval).toBeNull();
      expect(gameState.lastResult).toBeNull();
      expect(gameState.gameStatus).toBe('waiting');
    });

    test('should load saved state from localStorage on initialization', () => {
      // Set up localStorage with saved state
      localStorageMock.setItem('playerToken', 'test-token-123');
      localStorageMock.setItem('moderatorToken', 'mod-token-456');
      localStorageMock.setItem('gameState', JSON.stringify({
        gamePin: '123456',
        currentGame: { id: 1, name: 'Test Game' },
        gameStatus: 'active',
        lastSaved: Date.now()
      }));
      localStorageMock.setItem('game_123456_id', 'player-1');
      localStorageMock.setItem('game_123456_name', 'Test Player');

      // Create new GameState instance (should load from storage)
      const newGameState = new GameState();

      expect(newGameState.playerToken).toBe('test-token-123');
      expect(newGameState.moderatorToken).toBe('mod-token-456');
      expect(newGameState.gamePin).toBe('123456');
      expect(newGameState.currentGame).toEqual({ id: 1, name: 'Test Game' });
      expect(newGameState.gameStatus).toBe('active');
      expect(newGameState.playerId).toBe('player-1');
      expect(newGameState.playerName).toBe('Test Player');
    });

    test('should handle corrupt localStorage data gracefully', () => {
      // Set up corrupt localStorage data
      localStorageMock.setItem('gameState', 'invalid-json');
      
      // Should not throw error
      expect(() => {
        new GameState();
      }).not.toThrow();
    });
  });

  describe('Game PIN Management', () => {
    test('should set and persist game PIN correctly', () => {
      const testPin = '123456';
      
      gameState.setGamePin(testPin);
      
      expect(gameState.gamePin).toBe(testPin);
      
      // Verify localStorage was updated
      const savedState = JSON.parse(localStorageMock.getItem('gameState'));
      expect(savedState.gamePin).toBe(testPin);
    });

    test('should handle Slovak PIN format', () => {
      const slovakPin = '123456'; // Slovak games use 6-digit PINs
      
      gameState.setGamePin(slovakPin);
      
      expect(gameState.gamePin).toBe(slovakPin);
      expect(gameState.gamePin.length).toBe(6);
    });
  });

  describe('Player Token Management', () => {
    test('should set and persist player token', () => {
      const testToken = 'player-token-123';
      
      gameState.setPlayerToken(testToken);
      
      expect(gameState.playerToken).toBe(testToken);
      expect(localStorageMock.getItem('playerToken')).toBe(testToken);
    });

    test('should set and persist moderator token', () => {
      const testToken = 'mod-token-456';
      
      gameState.setModeratorToken(testToken);
      
      expect(gameState.moderatorToken).toBe(testToken);
      expect(localStorageMock.getItem('moderatorToken')).toBe(testToken);
    });
  });

  describe('Player Identity Management', () => {
    test('should set and persist player ID with game PIN', () => {
      const testPin = '123456';
      const testId = 'player-1';
      
      gameState.setGamePin(testPin);
      gameState.setPlayerId(testId);
      
      expect(gameState.playerId).toBe(testId);
      expect(localStorageMock.getItem('game_123456_id')).toBe(testId);
    });

    test('should set and persist Slovak player name', () => {
      const testPin = '123456';
      const testName = 'Hráč 1'; // Slovak player name
      
      gameState.setGamePin(testPin);
      gameState.setPlayerName(testName);
      
      expect(gameState.playerName).toBe(testName);
      expect(localStorageMock.getItem('game_123456_name')).toBe(testName);
    });

    test('should handle special Slovak characters in names', () => {
      const testPin = '123456';
      const testName = 'Ján Novák'; // Slovak name with special characters
      
      gameState.setGamePin(testPin);
      gameState.setPlayerName(testName);
      
      expect(gameState.playerName).toBe(testName);
      expect(localStorageMock.getItem('game_123456_name')).toBe(testName);
    });
  });

  describe('Game Data Management', () => {
    test('should set and persist current game data', () => {
      const testGame = {
        id: 1,
        name: 'Test Slovak Quiz',
        questions: [
          {
            question: 'Aké je hlavné mesto Slovenska?',
            options: ['Bratislava', 'Košice', 'Prešov', 'Žilina'],
            correct: 0
          }
        ]
      };
      
      gameState.setCurrentGame(testGame);
      
      expect(gameState.currentGame).toEqual(testGame);
      
      // Verify localStorage was updated
      const savedState = JSON.parse(localStorageMock.getItem('gameState'));
      expect(savedState.currentGame).toEqual(testGame);
    });

    test('should handle Slovak question data correctly', () => {
      const slovakQuestion = {
        question: 'Ktorý je najvyšší vrch Slovenska?',
        options: ['Gerlachovský štít', 'Kriváň', 'Rysy', 'Lomnický štít'],
        correct: 0,
        timeLimit: 30
      };
      
      gameState.setCurrentQuestion(slovakQuestion);
      
      expect(gameState.currentQuestion).toEqual(slovakQuestion);
      expect(gameState.hasAnswered).toBe(false);
      expect(gameState.isWaiting).toBe(false);
    });
  });

  describe('Answer Management', () => {
    beforeEach(() => {
      const testQuestion = {
        question: 'Test question',
        options: ['A', 'B', 'C', 'D'],
        correct: 0
      };
      gameState.setCurrentQuestion(testQuestion);
    });

    test('should allow answer submission when not answered', () => {
      const result = gameState.submitAnswer(1);
      
      expect(result).toBe(true);
      expect(gameState.hasAnswered).toBe(true);
      expect(gameState.selectedAnswer).toBe(1);
    });

    test('should prevent duplicate answer submission', () => {
      // First answer should succeed
      const firstResult = gameState.submitAnswer(1);
      expect(firstResult).toBe(true);
      
      // Second answer should fail
      const secondResult = gameState.submitAnswer(2);
      expect(secondResult).toBe(false);
      expect(gameState.selectedAnswer).toBe(1); // Should remain first answer
    });

    test('should handle answer result with Slovak messages', () => {
      const slovakResult = {
        correct: true,
        correctAnswer: 0,
        points: 1500,
        totalScore: 1500,
        message: 'Správne! Získali ste 1500 bodov.'
      };
      
      gameState.setAnswerResult(slovakResult);
      
      expect(gameState.lastResult).toEqual(slovakResult);
    });

    test('should handle incorrect answer with Slovak messages', () => {
      const slovakResult = {
        correct: false,
        correctAnswer: 0,
        points: 0,
        totalScore: 0,
        message: 'Nesprávne. Správna odpoveď bola: Bratislava'
      };
      
      gameState.setAnswerResult(slovakResult);
      
      expect(gameState.lastResult).toEqual(slovakResult);
    });
  });

  describe('Game Status Management', () => {
    test('should set waiting state correctly', () => {
      gameState.setWaiting(true);
      expect(gameState.isWaiting).toBe(true);
      
      gameState.setWaiting(false);
      expect(gameState.isWaiting).toBe(false);
    });

    test('should set game status correctly', () => {
      const statusValues = ['waiting', 'active', 'question_active', 'results', 'finished'];
      
      statusValues.forEach(status => {
        gameState.setGameStatus(status);
        expect(gameState.gameStatus).toBe(status);
      });
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      gameState.setGamePin('123456');
      gameState.setPlayerToken('test-token');
      gameState.setPlayerId('player-1');
    });

    test('should detect saved session correctly', () => {
      expect(gameState.hasSavedSession()).toBe(true);
      
      // Remove one required piece
      gameState.playerToken = null;
      expect(gameState.hasSavedSession()).toBe(false);
    });

    test('should detect reconnection data correctly', () => {
      expect(gameState.hasReconnectionData()).toBe(true);
      
      // Remove required data
      gameState.playerToken = null;
      expect(gameState.hasReconnectionData()).toBe(false);
    });

    test('should get saved player ID correctly', () => {
      expect(gameState.getSavedPlayerId()).toBe('player-1');
      
      // Clear game PIN
      gameState.gamePin = null;
      expect(gameState.getSavedPlayerId()).toBeNull();
    });

    test('should clear saved session correctly', () => {
      gameState.clearSavedSession();
      
      expect(gameState.playerToken).toBeNull();
      expect(gameState.playerId).toBeNull();
      expect(gameState.playerName).toBeNull();
      expect(localStorageMock.getItem('playerToken')).toBeNull();
      expect(localStorageMock.getItem('game_123456_id')).toBeNull();
      expect(localStorageMock.getItem('game_123456_name')).toBeNull();
    });
  });

  describe('Timer Management', () => {
    test('should clear timers correctly', () => {
      // Mock timer
      gameState.timerInterval = setInterval(() => {}, 1000);
      
      gameState.clearTimers();
      
      expect(gameState.timerInterval).toBeNull();
    });

    test('should handle clearing null timers', () => {
      gameState.timerInterval = null;
      
      expect(() => {
        gameState.clearTimers();
      }).not.toThrow();
    });
  });

  describe('Game State Clearing', () => {
    beforeEach(() => {
      // Set up full game state
      gameState.setGamePin('123456');
      gameState.setPlayerToken('test-token');
      gameState.setPlayerId('player-1');
      gameState.setPlayerName('Test Player');
      gameState.setCurrentGame({ id: 1, name: 'Test Game' });
      gameState.setCurrentQuestion({ question: 'Test?', options: ['A', 'B', 'C', 'D'] });
      gameState.submitAnswer(1);
      gameState.setAnswerResult({ correct: true, points: 1000 });
      gameState.setGameStatus('active');
      gameState.setWaiting(false);
      gameState.timerInterval = setInterval(() => {}, 1000);
    });

    test('should clear game state completely', () => {
      gameState.clearGame();
      
      expect(gameState.gamePin).toBeNull();
      expect(gameState.currentGame).toBeNull();
      expect(gameState.currentQuestion).toBeNull();
      expect(gameState.hasAnswered).toBe(false);
      expect(gameState.isWaiting).toBe(true);
      expect(gameState.lastResult).toBeNull();
      expect(gameState.gameStatus).toBe('waiting');
      expect(gameState.playerName).toBeNull();
      expect(gameState.timerInterval).toBeNull();
      
      // Verify localStorage was updated
      const savedState = JSON.parse(localStorageMock.getItem('gameState'));
      expect(savedState.gamePin).toBeNull();
      expect(savedState.currentGame).toBeNull();
      expect(savedState.gameStatus).toBe('waiting');
    });
  });

  describe('State Snapshot', () => {
    test('should provide complete state snapshot', () => {
      // Set up state
      gameState.setGamePin('123456');
      gameState.setPlayerToken('test-token');
      gameState.setPlayerId('player-1');
      gameState.setPlayerName('Test Player');
      gameState.setCurrentGame({ id: 1 });
      gameState.setCurrentQuestion({ question: 'Test?' });
      gameState.submitAnswer(2);
      gameState.setAnswerResult({ correct: false });
      gameState.setGameStatus('active');
      gameState.setWaiting(false);
      
      const state = gameState.getState();
      
      expect(state).toEqual({
        gamePin: '123456',
        currentGame: { id: 1 },
        currentQuestion: { question: 'Test?' },
        hasAnswered: true,
        isWaiting: false,
        playerToken: 'test-token',
        playerId: 'player-1',
        playerName: 'Test Player',
        lastResult: { correct: false },
        gameStatus: 'active',
        selectedAnswer: 2
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw error
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = () => {
        throw new Error('localStorage error');
      };
      
      // Should not throw error
      expect(() => {
        gameState.setPlayerToken('test-token');
      }).not.toThrow();
      
      // Restore localStorage
      localStorageMock.setItem = originalSetItem;
    });

    test('should handle missing game PIN gracefully', () => {
      gameState.gamePin = null;
      
      // Should not throw error
      expect(() => {
        gameState.setPlayerId('player-1');
        gameState.setPlayerName('Test Player');
      }).not.toThrow();
      
      // Should not save to localStorage without game PIN
      expect(localStorageMock.getItem('game_null_id')).toBeNull();
    });
  });

  describe('Performance and Memory Management', () => {
    test('should handle rapid state changes efficiently', () => {
      const startTime = Date.now();
      
      // Perform many state changes
      for (let i = 0; i < 1000; i++) {
        gameState.setGamePin(`${i}`.padStart(6, '0'));
        gameState.setPlayerId(`player-${i}`);
        gameState.setPlayerName(`Hráč ${i}`);
        gameState.setGameStatus(i % 2 === 0 ? 'active' : 'waiting');
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
      
      // Final state should be correct
      expect(gameState.gamePin).toBe('000999');
      expect(gameState.playerId).toBe('player-999');
      expect(gameState.playerName).toBe('Hráč 999');
    });

    test('should not leak memory with repeated operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        gameState.setCurrentQuestion({
          question: `Question ${i}`,
          options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`]
        });
        gameState.submitAnswer(i % 4);
        gameState.setAnswerResult({ correct: i % 2 === 0, points: i * 100 });
        gameState.clearGame();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(1024 * 1024); // Less than 1MB
    });
  });
});