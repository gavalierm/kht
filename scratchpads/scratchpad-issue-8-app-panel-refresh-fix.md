# Issue #8: App panel refresh do not work

**GitHub Issue:** https://github.com/gavalierm/kht/issues/8

## Problem Summary
When users refresh the page on `/app/123456/game` (formerly `/app/123456/stage`), they get a "Cannot GET" error because the Express server doesn't have a route handler for this specific path pattern.

## Current Situation
1. User opens `/app` and joins with PIN (e.g., 123456)
2. App redirects to `/app/123456/game` (updated from `/stage` in issue #12)
3. When user refreshes this page: **Error - Cannot GET /app/123456/game**
4. Expected: Page should load seamlessly, showing the game interface

## Root Cause Analysis
Looking at `server.js` lines 213-220:
```javascript
// Current routes
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/app/app.html'));
});

app.get('/app/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/app/app.html'));
});
```

**Missing route**: `/app/:pin/game` 

The server needs to serve the same `app.html` file for SPA (Single Page Application) routing to work properly.

## Solution Plan

### Primary Fix
Add server route for `/app/:pin/game` pattern:
```javascript
app.get('/app/:pin/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/app/app.html'));
});
```

### No Backward Compatibility 
Per requirements, no backward compatibility for old `/stage` URLs is needed.

### Testing Strategy
1. **E2E Test**: Add test case in `tests/e2e/app-flow.test.js`
   - Test that `/app/123456/game` serves valid HTML
2. **Manual Testing**: 
   - Join game via `/app`
   - Get redirected to `/app/123456/game`
   - Refresh page - should work seamlessly

## Implementation Tasks

### Phase 1: Core Fix
1. Add `/app/:pin/game` route to server.js

### Phase 2: Testing
1. Write E2E tests for new routes
2. Update existing tests if needed
3. Verify all test suites pass

### Phase 3: Verification
1. Test game join → refresh flow manually
2. Verify no regressions in existing functionality

## Files to Modify
- `server.js` - Add new routes
- `tests/e2e/app-flow.test.js` - Add route tests

## Impact Assessment
- **Low Risk**: Adding routes doesn't break existing functionality
- **High Value**: Fixes major UX issue where refresh breaks the app

## Notes
- This is a server-side routing issue, not client-side
- SPA routing requires server to serve same HTML for all app routes
- Following established pattern already used for dashboard and panel routes
- Issue #12 renamed "stage" to "game", so we only need the `/game` route