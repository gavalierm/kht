# Scratchpad: Issue #16 - Refactor: Modularize App Logic and Structure

**Issue Link**: https://github.com/gavalierm/kht/issues/16

## Analysis

### Current Structure
```
/public/
  /app/
    - app.js (511 lines) - Complete player interface
    - _app.js (198 lines) - Simplified/older version
    - app.html, _app.html
  /panel/
    - panel.js (284 lines) - Panel interface  
    - panel.html
  /shared/
    - common.css
```

### Identified Duplication Patterns

1. **Socket.io Setup** - Both app.js and panel.js have similar socket connection logic
2. **API Methods** - Identical `api()` method in app.js and _app.js
3. **Notification System** - Identical notification handling in app.js and _app.js
4. **Element Binding** - Similar patterns for DOM element caching and event binding
5. **Route Handling** - Similar route management logic
6. **Game State Management** - Common patterns for managing game state

### Proposed Modular Structure

```
/public/
  /lib/
    - api.js           # API calls and HTTP requests
    - socket.js        # Socket.io connection and event handling
    - notifications.js # Notification/message system
    - game.js          # Game state management
    - router.js        # Route handling logic
    - dom.js           # DOM manipulation utilities
  /constants.js        # Shared constants
  /components/         # Reusable UI components (if any)
  /styles/            # Feature-specific CSS files
```

## Refactoring Plan

### Phase 1: Core Infrastructure
1. **Create shared library structure** - `/lib/` directory with core modules
2. **Extract API logic** - Move API calls to `/lib/api.js`
3. **Extract socket handling** - Move socket.io logic to `/lib/socket.js`
4. **Extract notification system** - Move to `/lib/notifications.js`

### Phase 2: Application Logic
5. **Extract game state logic** - Move to `/lib/game.js`
6. **Extract router logic** - Move to `/lib/router.js`
7. **Create shared constants** - Move to `/constants.js`
8. **Create DOM utilities** - Move to `/lib/dom.js`

### Phase 3: Application Refactoring
9. **Refactor app.js** - Use new modular structure
10. **Refactor panel.js** - Use new modular structure
11. **Clean up duplicate files** - Remove _app.js if no longer needed

### Phase 4: Testing & Validation
12. **Test all functionality** - Ensure no breaking changes
13. **Run full test suite** - Verify no regressions

## Key Modules to Create

### `/lib/api.js`
- HTTP request utilities
- Game API calls
- Error handling

### `/lib/socket.js`
- Socket.io connection management
- Event handling base class
- Reconnection logic

### `/lib/notifications.js`
- Notification display system
- Message types (error, info, success, warning)
- Auto-dismiss functionality

### `/lib/game.js`
- Game state management
- Player state tracking
- Question/answer logic

### `/lib/router.js`
- Route handling
- Page navigation
- URL parsing

### `/constants.js`
- Socket event names
- API endpoints
- UI constants

## Benefits After Refactoring

1. **Reduced Duplication** - Common logic shared across all pages
2. **Easier Maintenance** - Changes in one place affect all users
3. **Better Testability** - Isolated modules can be tested independently
4. **Improved Readability** - Smaller, focused files
5. **Consistent Behavior** - All pages use same logic patterns

## Technical Requirements

- Use regular JavaScript (no TypeScript)
- Maintain all existing functionality
- Use named exports for better readability
- Avoid circular dependencies
- Clear folder structure by purpose