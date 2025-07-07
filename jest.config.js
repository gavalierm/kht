module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable only when needed
  collectCoverageFrom: [
    '*.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
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