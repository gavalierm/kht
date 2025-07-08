const GameDatabase = require('../../database');

/**
 * Test utilities for quiz application testing
 */

/**
 * Creates an in-memory test database
 * @returns {GameDatabase} Test database instance
 */
function createTestDatabase() {
  // Use in-memory database for testing with sqlite3
  const testDb = new GameDatabase(':memory:');
  return testDb;
}

/**
 * Creates sample questions for testing
 * @returns {Array} Array of test questions
 */
function createSampleQuestions() {
  return [
    {
      id: 1,
      question: "What is the capital of Slovakia?",
      options: ["Bratislava", "Košice", "Prague", "Vienna"],
      correct: 0,
      timeLimit: 30
    },
    {
      id: 2,
      question: "How many continents are there?",
      options: ["5", "6", "7", "8"],
      correct: 2,
      timeLimit: 25
    },
    {
      id: 3,
      question: "What is 2 + 2?",
      options: ["3", "4", "5", "6"],
      correct: 1,
      timeLimit: 20
    }
  ];
}

/**
 * Creates sample player data for testing
 * @returns {Object} Sample player data
 */
function createSamplePlayer() {
  return {
    name: `TestPlayer${Math.floor(Math.random() * 1000)}`,
    score: 0,
    connected: true
  };
}

/**
 * Creates sample game data for testing
 * @returns {Object} Sample game data
 */
function createSampleGame() {
  return {
    pin: Math.floor(100000 + Math.random() * 900000).toString(),
    questions: createSampleQuestions(),
    moderatorPassword: null
  };
}

/**
 * Waits for a specified amount of time
 * @param {number} ms Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a mock Socket.io client
 * @returns {Object} Mock socket client
 */
function createMockSocket() {
  const events = {};
  
  return {
    on: jest.fn((event, callback) => {
      events[event] = callback;
    }),
    emit: jest.fn(),
    join: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn()
    })),
    connected: true,
    id: `socket_${Math.random().toString(36).substr(2, 9)}`,
    _trigger: (event, data) => {
      if (events[event]) {
        events[event](data);
      }
    },
    _events: events
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
 * Generates random player token
 * @returns {string} Random token
 */
function generateTestToken() {
  return Math.random().toString(36).substr(2, 32);
}

/**
 * Cleans up test database
 * @param {GameDatabase} db Database instance to clean up
 */
function cleanupTestDatabase(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

module.exports = {
  createTestDatabase,
  createSampleQuestions,
  createSamplePlayer,
  createSampleGame,
  delay,
  createMockSocket,
  generateTestPin,
  generateTestToken,
  cleanupTestDatabase
};