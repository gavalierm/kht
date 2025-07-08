# Scratchpad: Issue #28 - Test Code Duplication: Tests Re-implement Logic Instead of Testing Real Code

**Issue Link**: https://github.com/gavalierm/kht/issues/28

## Problem Analysis

### Current Duplication Issues

1. **connection-status.test.js**: Contains 150+ line duplicate of `ConnectionStatusBanner` class
   - Real implementation: `public/shared/connectionStatus.js`
   - Problem: Tests mock instead of import real class

2. **dom-helper.test.js**: Creates `MockElement` and `MockClassList` classes 
   - Real implementation: `public/shared/dom.js` + JSDOM
   - Problem: Mock DOM instead of using JSDOM properly

3. **game-instance.test.js**: Creates `MockGameInstance` class
   - Real implementation: `GameInstance` class in `server.js:37`
   - Problem: Need to extract to testable module

4. **game-logic.test.js**: Re-implements `generateGamePin` function
   - Real implementation: `generateGamePin` function in `server.js:161`
   - Problem: Need to extract to testable module

### Root Causes

1. **ES Module Configuration**: Jest not configured for ES6 imports from frontend
2. **Monolithic server.js**: Core classes buried in 500+ line server file
3. **Mixed Environments**: Node.js backend vs browser frontend code
4. **Test Environment Setup**: Incomplete JSDOM configuration

## Solution Strategy

### Phase 1: Module Extraction
Extract server logic to testable modules:

```
/lib/
  ├── gameInstance.js     # GameInstance class + logic
  ├── gameUtils.js        # generateGamePin, helper functions
  └── serverUtils.js      # Other reusable server utilities
```

### Phase 2: Jest Configuration
Configure Jest for mixed CommonJS/ES6 environment:

```javascript
// jest.config.js additions
module.exports = {
  // ... existing config
  
  // Support ES6 imports for frontend modules
  transform: {
    '^.+\\.m?js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(public)/)'
  ],
  
  // Environment-specific configs
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/tests/unit/server-*.test.js', '**/tests/integration/*.test.js']
    },
    {
      displayName: 'jsdom', 
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/unit/client-*.test.js', '**/tests/unit/connection-status.test.js']
    }
  ]
}
```

### Phase 3: Test Refactoring
Convert tests to use real implementations:

1. **connection-status.test.js** → Import real `ConnectionStatusBanner`
2. **dom-helper.test.js** → Use JSDOM, remove mock DOM
3. **game-instance.test.js** → Import extracted `GameInstance`
4. **game-logic.test.js** → Import extracted utility functions

## Detailed Implementation Plan

### Step 1: Extract GameInstance Class

**Create**: `/lib/gameInstance.js`
```javascript
// Export GameInstance class from server.js
// Include all game logic methods
// Maintain database integration capabilities
```

**Update**: `server.js`
```javascript
const { GameInstance } = require('./lib/gameInstance');
// Remove class definition, keep instantiation logic
```

### Step 2: Extract Utility Functions

**Create**: `/lib/gameUtils.js`  
```javascript
// Export generateGamePin function
// Export other game utility functions
// Make testable with dependency injection
```

### Step 3: Configure Babel for Jest

**Create**: `babel.config.js`
```javascript
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ]
};
```

**Install**: `@babel/core @babel/preset-env babel-jest`

### Step 4: Refactor Tests

**connection-status.test.js**:
```javascript
import { ConnectionStatusBanner } from '../../public/shared/connectionStatus.js';
// Remove duplicate class, test real implementation
```

**game-instance.test.js**:
```javascript
const { GameInstance } = require('../../lib/gameInstance');
// Remove MockGameInstance, test real class
```

**dom-helper.test.js**:
```javascript
import { DOMHelper } from '../../public/shared/dom.js';
// Remove MockElement classes, use JSDOM
```

**game-logic.test.js**:
```javascript
const { generateGamePin } = require('../../lib/gameUtils');
// Remove duplicate functions, test real implementations
```

## Expected Outcomes

### Benefits
- **Test Reliability**: Tests validate actual production code
- **Maintenance**: Single source of truth for logic
- **Coverage**: Real code coverage metrics
- **Confidence**: Tests catch actual implementation bugs

### Risks & Mitigations
- **Jest ES6 Complexity**: Use babel-jest transformer
- **Module Dependencies**: Careful dependency injection
- **Breaking Changes**: Incremental extraction with tests

## Acceptance Criteria
- [ ] All tests import real implementation classes/functions
- [ ] Zero code duplication between tests and production
- [ ] Jest configured for ES6 frontend imports
- [ ] All 67 tests pass with real implementations
- [ ] Code coverage reflects actual production code testing
- [ ] No breaking changes to existing functionality

## Related Work
- Issue #16: App logic modularization (provides foundation)
- Recent PR #27: Connection status implementation (affected tests)

## Next Steps
1. Create branch `feature/issue-28-test-code-duplication`
2. Extract server modules first (safest approach)
3. Configure Jest/Babel for ES6 support
4. Refactor tests incrementally
5. Validate with full test suite