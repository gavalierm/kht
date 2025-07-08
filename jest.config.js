module.exports = {
  // Test environment - use jsdom for DOM tests
  testEnvironment: 'node',
  
  // Override test environment for specific files
  testEnvironmentOptions: {},
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable only when needed
  collectCoverageFrom: [
    'database.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!tests/**',
    '!_server.js',
    '!server.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 25,
      lines: 25,
      statements: 25
    }
  },
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],
  
  // Test timeout (important for Socket.io tests)
  testTimeout: 10000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output for debugging
  verbose: true,
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Transform configuration (if needed for ES modules)
  transform: {},
  
  // Global variables available in tests
  globals: {
    'process.env.NODE_ENV': 'test'
  }
};