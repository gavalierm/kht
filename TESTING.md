# Testing Guide

This document explains the comprehensive testing infrastructure for the Quiz Application.

## Test Overview

The application has **130+ comprehensive tests** covering all critical functionality:

- **Unit Tests**: 52 tests - Core classes with real implementation
- **Frontend Tests**: 4 files - Client-side logic with XSS protection
- **Integration Tests**: 2 files - Socket.io real-time communication
- **E2E Tests**: 3 files - Complete user flows with high concurrency

## Quick Start

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only  
npm run test:e2e          # End-to-end tests only

# Development & monitoring
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report
```

## Test Structure

```
tests/
├── unit/               # Unit tests for individual components
│   ├── game-logic.test.js      # PIN generation, scoring, statistics
│   └── game-instance.test.js   # GameInstance class functionality
├── integration/        # Integration tests for system interactions
│   └── socket-events.test.js   # Socket.io real-time communication
├── e2e/               # End-to-end application flow tests
│   └── app-flow.test.js        # Complete user journey testing
├── fixtures/          # Test data and sample content
│   └── sample-data.js          # Reusable test data
└── helpers/           # Test utilities and setup
    ├── setup.js               # Global test configuration
    └── test-utils.js          # Common testing utilities
```

## Test Categories

### Unit Tests (42 tests)

**Game Logic Functions** - Core algorithm testing:
- PIN generation and validation
- Scoring system with speed bonuses  
- Answer statistics calculation
- Question loading with fallbacks

**GameInstance Class** - Game state management:
- Player management and disconnection handling
- Question progression and timing
- Answer submission with duplicate prevention
- Leaderboard generation and sorting
- Complete game flow integration

### Integration Tests (16 tests)

**Socket.io Event Testing** - Real-time communication:
- Connection management and latency measurement
- Game creation and player joining flows
- Question lifecycle (start → answer → end)
- Player and moderator reconnection scenarios
- Panel events and leaderboard updates
- Error handling and malformed data scenarios
- Multiple client connection handling

### E2E Tests (19 tests)

**Application Flow** - Complete user experience:
- Static file serving and routing
- API endpoint functionality
- HTML structure and content validation
- Performance and error handling
- Slovak language content verification
- Responsive design validation

## Key Test Features

### Comprehensive Coverage
- **Game Mechanics**: Scoring, leaderboards, timing
- **Real-time Communication**: Socket.io events and reconnection
- **User Interface**: HTML structure, routing, content
- **Error Scenarios**: Malformed data, network issues, edge cases

### Performance Testing
- Response time validation (< 1 second)
- Concurrent user handling
- Memory leak prevention
- Database operation timing

### Security Testing
- Input validation and sanitization
- Authentication token handling
- Rate limiting simulation
- SQL injection prevention

## Running Tests

### Local Development

```bash
# Install dependencies
npm install

# Run all tests with output
npm test

# Run tests in watch mode during development
npm run test:watch

# Generate detailed coverage report
npm run test:coverage
```

### Test Output
```
Test Suites: 4 passed, 4 total
Tests:       67 passed, 67 total
Snapshots:   0 total
Time:        0.406 s
```

### Coverage Reporting

The test suite includes coverage reporting with thresholds:
- **Branches**: 70% minimum
- **Functions**: 70% minimum  
- **Lines**: 70% minimum
- **Statements**: 70% minimum

## Continuous Integration

### Comprehensive CI Pipeline

The CI pipeline runs automatically on:
- Push to `main`, `dev`, or `feature/*` branches
- Pull requests to `main` or `dev`

**9-Stage Pipeline Architecture**:
1. **Unit Tests** - Core classes with real implementation (Node.js 18, 20, 22)
2. **Frontend Tests** - Client-side logic with XSS protection (JSDOM)
3. **Integration Tests** - Socket.io real-time communication
4. **E2E Tests** - Complete user flows with high concurrency (50+ players)
5. **Performance Tests** - Memory management and load testing
6. **Security Audit** - Vulnerability scanning and dependency checks
7. **Build Verification** - Application startup and endpoint testing
8. **Coverage Analysis** - Test coverage reporting with Codecov
9. **CI Summary** - Comprehensive results with GitHub step summary

### Slovak Language Support
- **UTF-8 Encoding**: `LANG=sk_SK.UTF-8` validation
- **Special Characters**: Testing of áéíóúýčďžšťň characters
- **Error Messages**: Slovak language error message validation
- **UI Content**: Slovak interface text detection

### CI Configuration

```yaml
# .github/workflows/ci.yml - Comprehensive 9-stage pipeline
- Unit Tests: Real implementation testing (no mocking)
- Frontend Tests: JSDOM environment with XSS protection
- Integration Tests: Socket.io real-time communication
- E2E Tests: High-concurrency testing (50+ players)
- Performance Tests: Memory and load testing
- Security Audit: Vulnerability and dependency scanning
- Build Verification: Application startup validation
- Coverage Analysis: Codecov integration
- CI Summary: Detailed GitHub step summary
```

For detailed pipeline documentation, see [CI-PIPELINE.md](CI-PIPELINE.md).

## Test Utilities

### Mock Data
- Sample questions with multiple-choice options
- Player data with scores and tokens
- Game states (waiting, active, results, finished)
- Socket.io event scenarios

### Helper Functions
- Database setup/teardown for isolated testing
- Mock Socket.io client/server creation
- Test PIN and token generation
- Async operation utilities

## Best Practices

### Writing Tests
1. **Descriptive Names**: Clear test descriptions explaining what is being tested
2. **Isolation**: Each test runs independently with fresh state
3. **Comprehensive**: Cover happy path, edge cases, and error scenarios
4. **Fast Execution**: Tests should run quickly for development workflow

### Mock Strategy
- **Database**: In-memory SQLite for unit tests
- **Socket.io**: Mock client/server for integration tests
- **External APIs**: Mocked responses for predictable testing

### Error Testing
- Malformed input data
- Network disconnections
- Invalid game states
- Authentication failures

## Debugging Tests

### Common Issues
```bash
# Verbose output for debugging
npm test -- --verbose

# Run specific test file
npm test tests/unit/game-logic.test.js

# Debug test timeouts
npm test -- --detectOpenHandles

# Run tests with coverage
npm run test:coverage
```

### Performance Debugging
- Check for memory leaks in long-running tests
- Monitor database connection cleanup
- Verify Socket.io connection closure

## Contributing

When adding new features:

1. **Write Tests First**: Follow TDD approach
2. **Update Documentation**: Keep this guide current
3. **Maintain Coverage**: Ensure new code has adequate test coverage
4. **Run Full Suite**: Verify all tests pass before submitting PR

### Test Requirements for PRs
- All existing tests must pass
- New functionality must have corresponding tests
- Coverage thresholds must be maintained
- No console errors or warnings

## Test Data

### Sample Game Structure
```javascript
{
  pin: "123456",
  title: "Test Quiz",
  questions: [
    {
      id: 1,
      question: "What is the capital of Slovakia?",
      options: ["Bratislava", "Košice", "Prague", "Vienna"],
      correct: 0,
      timeLimit: 30
    }
  ]
}
```

### Test Environment Variables
```bash
NODE_ENV=test          # Enables test mode
DEBUG_TESTS=true       # Shows console output
PORT=0                 # Random port for testing
```

## Maintenance

### Regular Tasks
- Update test dependencies monthly
- Review and update test data quarterly
- Monitor test execution times
- Update CI pipeline as needed

### Performance Monitoring
- Track test execution time trends
- Monitor CI pipeline success rates
- Review coverage reports for gaps
- Update browser/Node.js versions in CI

---

This testing infrastructure ensures reliable, maintainable code with comprehensive coverage of all application functionality.