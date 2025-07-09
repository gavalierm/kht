/**
 * Enhanced global test setup for comprehensive testing
 * - Configures test environment for both Node.js and browser testing
 * - Sets up proper database isolation
 * - Configures Socket.io testing environment
 * - Provides cleanup utilities
 */

const { performance } = require('perf_hooks');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = 0; // Use random port for testing
process.env.SKIP_TEST_GAME = 'true'; // Don't create test game automatically

// Configure test database to use memory
process.env.TEST_DATABASE_PATH = ':memory:';

// Disable console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  const originalConsole = global.console;
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: originalConsole.error, // Keep errors visible
    
    // Allow console methods to be restored for debugging
    _restore: () => {
      global.console = originalConsole;
    }
  };
}

// Global test timeout for async operations
jest.setTimeout(15000);

// Performance monitoring for tests
const testMetrics = {
  startTime: null,
  endTime: null,
  duration: null,
  memoryUsage: null
};

// Track test performance
beforeEach(() => {
  testMetrics.startTime = performance.now();
  testMetrics.memoryUsage = process.memoryUsage();
});

afterEach(() => {
  testMetrics.endTime = performance.now();
  testMetrics.duration = testMetrics.endTime - testMetrics.startTime;
  
  // Log slow tests
  if (testMetrics.duration > 5000) { // 5 seconds
    console.warn(`Slow test detected: ${testMetrics.duration.toFixed(2)}ms`);
  }
  
  // Clear all mocks after each test
  jest.clearAllMocks();
});

// Global cleanup for database connections
const openDatabases = new Set();

global.registerDatabase = (db) => {
  openDatabases.add(db);
};

global.unregisterDatabase = (db) => {
  openDatabases.delete(db);
};

afterAll(() => {
  // Clean up all open database connections
  openDatabases.forEach(db => {
    try {
      if (db && typeof db.close === 'function') {
        db.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  openDatabases.clear();
});

// Socket.io test utilities
global.createTestSocketPair = () => {
  const events = new Map();
  
  const clientSocket = {
    id: `client_${Math.random().toString(36).substr(2, 9)}`,
    connected: true,
    
    on: jest.fn((event, callback) => {
      events.set(`client_${event}`, callback);
    }),
    
    emit: jest.fn((event, data) => {
      if (events.has(`server_${event}`)) {
        events.get(`server_${event}`)(data);
      }
    }),
    
    disconnect: jest.fn(() => {
      events.clear();
    })
  };
  
  const serverSocket = {
    id: `server_${Math.random().toString(36).substr(2, 9)}`,
    
    on: jest.fn((event, callback) => {
      events.set(`server_${event}`, callback);
    }),
    
    emit: jest.fn((event, data) => {
      if (events.has(`client_${event}`)) {
        events.get(`client_${event}`)(data);
      }
    }),
    
    join: jest.fn(),
    leave: jest.fn()
  };
  
  return { clientSocket, serverSocket };
};

// Utility for waiting for async operations
global.waitForAsync = (fn, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      try {
        const result = fn();
        if (result) {
          resolve(result);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for async operation'));
        } else {
          setImmediate(check);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    check();
  });
};

// Utility for testing concurrent operations
global.runConcurrently = async (tasks, maxConcurrency = 10) => {
  const results = [];
  const executing = [];
  
  for (const task of tasks) {
    const promise = Promise.resolve(task()).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });
    
    results.push(promise);
    executing.push(promise);
    
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
};

// Mock timers utility
global.withMockTimers = (testFn) => {
  return async () => {
    jest.useFakeTimers();
    try {
      await testFn();
    } finally {
      jest.useRealTimers();
    }
  };
};

// Memory leak detection
const originalMemoryUsage = process.memoryUsage;
let memoryLeakDetection = false;

global.enableMemoryLeakDetection = () => {
  memoryLeakDetection = true;
  const initialMemory = originalMemoryUsage();
  
  afterAll(() => {
    if (memoryLeakDetection) {
      const finalMemory = originalMemoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      if (heapGrowth > 10 * 1024 * 1024) { // 10MB threshold
        console.warn(`Potential memory leak detected: ${heapGrowth} bytes heap growth`);
      }
    }
  });
};

// Error handling for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in tests, but log for debugging
});

// Graceful shutdown for test processes
process.on('SIGTERM', () => {
  console.log('Test process received SIGTERM, cleaning up...');
  openDatabases.forEach(db => {
    try {
      if (db && typeof db.close === 'function') {
        db.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  process.exit(0);
});

// Export utilities for use in tests
module.exports = {
  testMetrics,
  openDatabases
};