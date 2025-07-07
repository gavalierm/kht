# Issue #12: Rename Existing "Stage" Page to "Game"

**GitHub Issue:** https://github.com/gavalierm/kht/issues/12

## Problem Summary
The current gameplay view uses the route `/app/[gameId]/stage` and element `id="stage"`, but this conflicts with a new `/stage` results page. Need to rename the existing "stage" references to "game" for clarity.

## Goal
- `game` = active gameplay  
- `stage` = post-game results

## Analysis

### Current State
Found "stage" references in:
1. `/public/app/app.js` - Lines 98, 113, 210, 212
2. `/public/app/app.html` - Line 365 (`id="stage"`)
3. `/public/app/_app.js` - Lines 58, 59 (template version)
4. `/public/app/_app.html` - Line 261 (`id="stage"`)
5. `/tests/e2e/app-flow.test.js` - Lines 137, 244 (test expectations)

### Required Changes

#### 1. Route Changes
- **app.js:98**: `this.redirectTo(/app/${this.gamePin}/stage)` → `this.redirectTo(/app/${this.gamePin}/game)`
- **app.js:113**: `this.redirectTo(/app/${this.gamePin}/stage)` → `this.redirectTo(/app/${this.gamePin}/game)`
- **app.js:210**: `if (path.startsWith('/app/') && path.includes('/stage'))` → `if (path.startsWith('/app/') && path.includes('/game'))`
- **_app.js:58**: `case '/stage':` → `case '/game':`

#### 2. HTML Element Changes  
- **app.html:365**: `<div class="page" id="stage">` → `<div class="page" id="game">`
- **_app.html:261**: `<div class="page" id="stage">` → `<div class="page" id="game">`

#### 3. JavaScript Selector Changes
- **app.js:212**: `document.querySelector('#stage.page')` → `document.querySelector('#game.page')`
- **_app.js:59**: `document.querySelector('#stage.page')` → `document.querySelector('#game.page')`

#### 4. Test Updates
- **app-flow.test.js:137**: `expect(html).toContain('id="stage"')` → `expect(html).toContain('id="game"')`
- **app-flow.test.js:244**: `expect(html).not.toMatch(/class="page[^"]*visible"[^>]*id="stage"/)` → `expect(html).not.toMatch(/class="page[^"]*visible"[^>]*id="game"/)`

## Implementation Plan

### Phase 1: Core Application Changes
1. Update main app.js routes and redirects
2. Update main app.html element ID
3. Update _app.js routes and redirects  
4. Update _app.html element ID

### Phase 2: Testing
1. Update E2E tests to expect new ID
2. Run full test suite to ensure no regressions

### Phase 3: Verification
1. Test game flow manually
2. Verify routing works correctly
3. Confirm old references are fully replaced

## Files to Modify
- `/public/app/app.js` (4 changes)
- `/public/app/app.html` (1 change)
- `/public/app/_app.js` (2 changes)
- `/public/app/_app.html` (1 change)
- `/tests/e2e/app-flow.test.js` (2 changes)

## Testing Strategy
- Run `npm test` to verify all tests pass
- Test joining game flow at `/app/123456` to ensure redirect works
- Verify no broken references remain using search

## Notes
- This is a pure refactor - no logic changes
- All existing functionality should remain identical
- Consider adding redirect from old `/stage` route to `/game` for backward compatibility