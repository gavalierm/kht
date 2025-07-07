// Global test setup file
// This file is executed before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = 0; // Use random port for testing

// Suppress console.log during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: console.error // Keep errors visible
  };
}

// Global test timeout for async operations
jest.setTimeout(10000);

// Clean up after tests
afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
});