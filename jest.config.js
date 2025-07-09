module.exports = {
  // Multiple project configurations for different environments
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '**/tests/unit/*.test.js',
        '**/tests/integration/*.test.js',
        '**/tests/e2e/*.test.js'
      ],
      // Setup and teardown for Node.js tests
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: [
        '**/tests/frontend/*.test.js'
      ],
      // Transform ES6 modules for frontend tests
      transform: {
        '^.+\\.m?js$': 'babel-jest'
      },
      transformIgnorePatterns: [
        'node_modules/(?!(public)/)'
      ],
      // Setup for JSDOM tests
      setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],
    }
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable only when needed
  collectCoverageFrom: [
    'database.js',
    'lib/**/*.js',
    'public/shared/**/*.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!babel.config.js',
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
  
  // Test timeout (important for Socket.io tests)
  testTimeout: 10000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output for debugging
  verbose: true,
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Global variables available in tests
  globals: {
    'process.env.NODE_ENV': 'test'
  }
};