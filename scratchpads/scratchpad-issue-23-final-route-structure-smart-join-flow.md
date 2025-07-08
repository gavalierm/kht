# Issue #23: Final Route Structure + Smart Join Flow

**Issue Link**: https://github.com/gavalierm/kht/issues/23

## Problem Description

Refactor the routing structure to implement smart join logic and finalize the route structure. The current `/app/:pin` route serves a login page, but should become a smart redirect handler that redirects users based on game state.

## Current State Analysis

### Current Routes
- `/app` → Login screen (PIN entry)
- `/app/:pin` → Login screen (PIN pre-filled) ❌ **NEEDS CHANGE**
- `/app/:pin/game` → Game interface ✅
- `/app/:pin/panel` → Panel view ✅

### Missing Routes
- `/app/:pincode/stage` → Post-game leaderboard ❌ **NEW**
- `/app/:pincode/dashboard` → Operator control panel ❌ **NEW**

## Target Route Structure

| Route                         | Purpose                          | Status |
|------------------------------|----------------------------------|--------|
| `/app`                       | Join screen – enter game PIN     | ✅ Exists |
| `/app/:pincode`              | Redirect handler based on game state | ❌ **REFACTOR** |
| `/app/:pincode/game`         | Player view (in-game)            | ✅ Exists |
| `/app/:pincode/panel`        | Big screen view                   | ✅ Exists |
| `/app/:pincode/stage`        | Post-game leaderboard             | ❌ **NEW** |
| `/app/:pincode/dashboard`    | Operator/master control panel    | ❌ **NEW** |

## Implementation Plan

### Phase 1: Create Missing Components

#### Step 1.1: Create Stage Component
- **File**: `/public/stage/stage.html` and `/public/stage/stage.js`
- **Purpose**: Post-game leaderboard view
- **Features**: 
  - Display final game results
  - Show player rankings
  - Option to return to join screen

#### Step 1.2: Create Dashboard Component
- **File**: `/public/dashboard/dashboard.html` and `/public/dashboard/dashboard.js` (may exist)
- **Purpose**: Operator/master control panel
- **Features**:
  - Game control (start, stop, next question)
  - Player management
  - Real-time monitoring

#### Step 1.3: Update Server Routes
- Add `/app/:pin/stage` → serves `/public/stage/stage.html`
- Add `/app/:pin/dashboard` → serves `/public/dashboard/dashboard.html`
- Add static file serving for `/stage/*` and `/dashboard/*`

### Phase 2: Implement Smart Redirect Logic

#### Step 2.1: Create Redirect Handler
- **File**: Create `/public/redirect/redirect.html` and `/public/redirect/redirect.js`
- **Purpose**: Handle `/app/:pincode` route
- **Logic**:
  1. Extract pincode from URL
  2. Fetch game info from `/api/game/:pincode`
  3. Redirect based on response:
     - `running` → `/app/:pincode/game`
     - `ended` → `/app/:pincode/stage`
     - `not_found` → Show error message or redirect to `/app`

#### Step 2.2: Update Server Route
- Modify `/app/:pin` route to serve redirect handler instead of login page
- Ensure API `/api/game/:pin` returns proper game status

#### Step 2.3: Update Router Logic
- Remove old pattern matching in `/public/shared/router.js`
- Implement explicit route handling for each path
- Update navigation throughout the app

### Phase 3: Update Navigation & Cleanup

#### Step 3.1: Update Internal Navigation
- Update all `href` and programmatic navigation to use new structure
- Ensure forms submit to correct routes
- Update any hardcoded routes in JavaScript

#### Step 3.2: Update Tests
- Update E2E tests to match new route structure
- Add tests for redirect logic
- Test error handling for invalid PIN codes

#### Step 3.3: Clean Up
- Remove unused code from old routing logic
- Update documentation
- Ensure backward compatibility where possible

## Technical Considerations

### API Requirements
- `/api/game/:pin` must return:
  ```json
  {
    "status": "running" | "ended" | "not_found",
    "pin": "123456",
    "title": "Game Title",
    ...
  }
  ```

### Error Handling
- Invalid PIN codes should show user-friendly error messages
- Network errors should be handled gracefully
- Fallback to `/app` for unrecoverable errors

### Performance
- Redirect should happen as quickly as possible
- Minimize API calls
- Cache game state where appropriate

## Files to Modify

### New Files
- `/public/stage/stage.html`
- `/public/stage/stage.js`
- `/public/redirect/redirect.html`
- `/public/redirect/redirect.js`

### Modified Files
- `server.js` - Add new routes and update existing
- `/public/shared/router.js` - Update routing logic
- `/public/game/game.js` - Update navigation
- `/public/panel/panel.js` - Update navigation
- `/tests/e2e/app-flow.test.js` - Update tests

## Success Criteria

1. `/app` shows PIN input and navigates to `/app/:pincode` on submit
2. `/app/:pincode` correctly redirects based on game state
3. All new routes work properly (`/stage`, `/dashboard`)
4. No fallback logic to old `/app` behavior
5. Invalid PIN codes show clear error messages
6. All tests pass
7. Smooth route transitions

## Risks & Mitigation

### Risk: Breaking Existing Functionality
**Mitigation**: Implement changes incrementally, test thoroughly

### Risk: API Changes Required
**Mitigation**: Verify API endpoints return required data format

### Risk: Complex Redirect Logic
**Mitigation**: Keep redirect logic simple and well-tested

## Notes

- Build on existing folder structure from PR #18
- Leverage existing router system in `/public/shared/router.js`
- Maintain ES6 module pattern
- Consider mobile responsiveness for all new components