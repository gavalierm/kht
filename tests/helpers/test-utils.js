const GameDatabase = require('../../database');
const fs = require('fs');
const path = require('path');

/**
 * Enhanced test utilities for comprehensive quiz application testing
 * - Uses real implementation code, not mocks
 * - Provides test data that matches Slovak application context
 * - Includes utilities for database, socket, and multi-client testing
 */

/**
 * Creates an in-memory test database with real GameDatabase implementation
 * @param {Object} options - Database configuration options
 * @returns {GameDatabase} Test database instance
 */
function createTestDatabase(options = {}) {
  const dbOptions = {
    skipTestGame: true, // Don't create test game automatically
    ...options
  };
  
  // Use in-memory database for isolated testing
  const testDb = new GameDatabase(':memory:', dbOptions);
  
  // Wait for initialization to complete
  if (!testDb.waitForInitialization()) {
    throw new Error('Database initialization failed');
  }
  
  return testDb;
}

/**
 * Creates Slovak-context sample questions for testing
 * @returns {Array} Array of Slovak test questions
 */
function createSampleQuestions() {
  return [
    {
      id: 1,
      question: "Aké je hlavné mesto Slovenska?",
      options: ["Bratislava", "Košice", "Prešov", "Žilina"],
      correct: 0,
      timeLimit: 30
    },
    {
      id: 2,
      question: "Koľko kontinentov má Zem?",
      options: ["5", "6", "7", "8"],
      correct: 2,
      timeLimit: 25
    },
    {
      id: 3,
      question: "Ktorá rieka preteká cez Bratislavu?",
      options: ["Váh", "Hron", "Dunaj", "Morava"],
      correct: 2,
      timeLimit: 20
    },
    {
      id: 4,
      question: "Ktorý je najvyšší vrch Slovenska?",
      options: ["Kriváň", "Gerlachovský štít", "Rysy", "Ďumbier"],
      correct: 1,
      timeLimit: 25
    },
    {
      id: 5,
      question: "V ktorom roku vznikla Slovenská republika?",
      options: ["1991", "1992", "1993", "1994"],
      correct: 2,
      timeLimit: 30
    }
  ];
}

/**
 * Creates sample player data with Slovak naming convention
 * @param {number} count - Number of players to create
 * @returns {Array} Array of player data
 */
function createSamplePlayers(count = 3) {
  const players = [];
  for (let i = 1; i <= count; i++) {
    players.push({
      id: i,
      name: `Hráč ${i}`,
      score: Math.floor(Math.random() * 2000),
      connected: Math.random() > 0.2, // 80% chance of being connected
      player_token: `test-token-${i}-${Date.now()}`
    });
  }
  return players;
}

/**
 * Creates sample game data with proper structure
 * @param {Object} options - Game configuration options
 * @returns {Object} Sample game data
 */
function createSampleGame(options = {}) {
  const {
    pin = generateTestPin(),
    questions = createSampleQuestions(),
    moderatorPassword = 'test123',
    status = 'waiting',
    currentQuestionIndex = 0
  } = options;

  return {
    pin,
    questions,
    moderatorPassword,
    status,
    currentQuestionIndex,
    questionStartTime: null,
    createdAt: Date.now()
  };
}

/**
 * Creates mock Socket.io client with real event handling
 * @returns {Object} Mock socket client
 */
function createMockSocket() {
  const events = new Map();
  const rooms = new Set();
  
  return {
    id: `socket_${Math.random().toString(36).substr(2, 9)}`,
    connected: true,
    
    // Event handling - support multiple handlers for same event
    on: jest.fn((event, callback) => {
      if (!events.has(event)) {
        events.set(event, []);
      }
      events.get(event).push(callback);
    }),
    
    emit: jest.fn(),
    
    join: jest.fn((room) => {
      rooms.add(room);
    }),
    
    leave: jest.fn((room) => {
      rooms.delete(room);
    }),
    
    to: jest.fn((room) => ({
      emit: jest.fn()
    })),
    
    // Helper methods for testing
    _trigger: (event, data) => {
      if (events.has(event)) {
        const handlers = events.get(event);
        handlers.forEach(handler => handler(data));
      }
    },
    
    _getEvents: () => events,
    _getRooms: () => rooms,
    
    // Simulate disconnection
    disconnect: jest.fn(() => {
      events.clear();
      rooms.clear();
    })
  };
}

/**
 * Creates mock Socket.io server for testing
 * @returns {Object} Mock Socket.io server
 */
function createMockSocketServer() {
  const clients = new Map();
  const rooms = new Map();
  
  return {
    on: jest.fn(),
    emit: jest.fn(),
    
    to: jest.fn((room) => ({
      emit: jest.fn((event, data) => {
        // Simulate broadcast to room
        if (rooms.has(room)) {
          rooms.get(room).forEach(socketId => {
            if (clients.has(socketId)) {
              clients.get(socketId)._trigger(event, data);
            }
          });
        }
      })
    })),
    
    // Helper methods
    _addClient: (socket) => {
      clients.set(socket.id, socket);
    },
    
    _removeClient: (socketId) => {
      clients.delete(socketId);
    },
    
    _joinRoom: (socketId, room) => {
      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }
      rooms.get(room).add(socketId);
    },
    
    _leaveRoom: (socketId, room) => {
      if (rooms.has(room)) {
        rooms.get(room).delete(socketId);
      }
    },
    
    _getClients: () => clients,
    _getRooms: () => rooms
  };
}

/**
 * Generates unique test PIN
 * @returns {string} 6-digit PIN
 */
function generateTestPin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generates secure test token
 * @returns {string} Random token
 */
function generateTestToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Creates a game with multiple players for testing
 * @param {GameDatabase} db - Database instance
 * @param {Object} options - Game configuration
 * @returns {Object} Game data with players
 */
async function createGameWithPlayers(db, options = {}) {
  const {
    playerCount = 3,
    gameData = createSampleGame(),
    addAnswers = false
  } = options;

  // Create game
  const gameResult = await db.createGame(
    gameData.pin,
    gameData.questions,
    gameData.moderatorPassword
  );

  // Add players
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const playerResult = await db.addPlayer(gameResult.gameId);
    players.push(playerResult);
  }

  // Optionally add some answers
  if (addAnswers) {
    for (let i = 0; i < Math.min(players.length, 2); i++) {
      await db.saveAnswer(
        gameResult.gameId,
        players[i].playerId,
        0, // First question
        i, // Different answers
        i === 0, // First player correct
        i === 0 ? 1200 : 0, // Points
        5000 + i * 2000 // Response time
      );
    }
  }

  return {
    gameId: gameResult.gameId,
    gamePin: gameData.pin,
    moderatorToken: gameResult.moderatorToken,
    players,
    questions: gameData.questions
  };
}

/**
 * Waits for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise} Promise that resolves when condition is true
 */
function waitFor(condition, timeout = 5000, interval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, interval);
      }
    };
    
    check();
  });
}

/**
 * Simulates latency measurements like the real application
 * @param {number} baseLatency - Base latency in ms
 * @param {number} variance - Variance in ms
 * @returns {Map} Map of socket ID to latency
 */
function createLatencyMap(baseLatency = 50, variance = 20) {
  const latencies = new Map();
  
  return {
    addSocket: (socketId) => {
      const latency = baseLatency + (Math.random() * variance * 2 - variance);
      latencies.set(socketId, Math.max(0, latency));
    },
    
    getLatencies: () => latencies,
    
    removeSocket: (socketId) => {
      latencies.delete(socketId);
    }
  };
}

/**
 * Cleans up test database and closes connections
 * @param {GameDatabase} db - Database instance to clean up
 */
function cleanupTestDatabase(db) {
  if (db && typeof db.close === 'function') {
    try {
      db.close();
    } catch (error) {
      console.error('Error closing test database:', error);
    }
  }
}

/**
 * Creates test data for answer statistics
 * @param {number} totalAnswers - Total number of answers
 * @param {number} correctOption - Index of correct option
 * @returns {Array} Answer statistics array
 */
function createAnswerStats(totalAnswers, correctOption = 0) {
  const stats = [0, 0, 0, 0]; // 4 options
  
  for (let i = 0; i < totalAnswers; i++) {
    // Bias towards correct answer but include wrong answers
    const isCorrect = Math.random() < 0.6;
    const answerIndex = isCorrect ? correctOption : Math.floor(Math.random() * 4);
    stats[answerIndex]++;
  }
  
  return stats.map(count => ({
    count,
    percentage: totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0
  }));
}

module.exports = {
  createTestDatabase,
  createSampleQuestions,
  createSamplePlayers,
  createSampleGame,
  createMockSocket,
  createMockSocketServer,
  generateTestPin,
  generateTestToken,
  createGameWithPlayers,
  delay,
  waitFor,
  createLatencyMap,
  cleanupTestDatabase,
  createAnswerStats
};