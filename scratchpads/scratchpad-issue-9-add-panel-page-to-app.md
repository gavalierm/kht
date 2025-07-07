# Issue #9: Add "Panel" Page to the App

**GitHub Issue:** https://github.com/gavalierm/kht/issues/9

## Problem Summary
Create a new fullscreen panel page at `/app/[gameId]/panel` optimized for large displays (LED walls, projectors) that shows the current game state without interactive elements.

## Current State Analysis

### Existing Panel Infrastructure
- **Backend Support**: Server already has panel socket events (`join_panel`, `panel_game_joined`, `panel_question_started`, `panel_leaderboard_update`)
- **Existing Routes**: `/panel` and `/panel/:pin` routes exist in server.js but no frontend files
- **Missing**: Frontend implementation for the panel interface

### What's Different About This Request
- **New Route**: `/app/:pin/panel` (within app context, not standalone `/panel/:pin`)
- **Purpose**: Fullscreen display for public viewing in venues
- **No Interaction**: Read-only view optimized for distance viewing

## Requirements Analysis

### URL Structure
- Target: `http://localhost:3000/app/[gameId]/panel`
- Must reuse existing app logic and data sources
- Should leverage existing panel socket events

### Display Information
- ✅ Current game status (waiting, ingame, finished)
- ✅ Current question (if in-game)
- ✅ Possible answers with visual indicators
- ✅ Number of active players
- ✅ Live leaderboard updates

### UI Requirements
- ✅ Large text for distance visibility
- ✅ High contrast design
- ✅ No interactive controls
- ✅ Fullscreen optimized layout
- ✅ Real-time updates via socket events

## Implementation Plan

### Phase 1: Server Route
1. Add new route `/app/:pin/panel` to serve the same app.html
2. Update app.js to handle panel route in client-side routing

### Phase 2: Panel Frontend
1. Create panel page structure within existing app.html
2. Add panel-specific CSS for fullscreen display
3. Implement panel JavaScript logic to:
   - Detect panel URL and show panel view
   - Connect to existing panel socket events
   - Display game state without interaction

### Phase 3: Integration
1. Connect to existing socket events:
   - `join_panel` - Join as panel viewer
   - `panel_game_joined` - Receive game info
   - `panel_question_started` - Display current question
   - `panel_leaderboard_update` - Show live leaderboard
   - `panel_question_ended` - Show results

### Phase 4: Testing
1. Add E2E tests for new route
2. Test fullscreen display functionality
3. Verify real-time updates work correctly

## ✅ Corrected Technical Approach

After feedback, the implementation was corrected to follow proper separation of concerns:

### Routing Strategy
```javascript
// In server.js - serve separate panel files
app.get('/app/:pin/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/panel/panel.html'));
});
```

### Separate Panel Implementation
- **Separate Directory**: Created `/public/panel/` with dedicated files
- **Shared CSS**: Created `/public/shared/common.css` for shared styles
- **No Duplication**: Avoided embedding panel in app.html

### Panel Structure
```
/public/
  /panel/
    panel.html    # Dedicated panel HTML
    panel.js      # Panel-specific JavaScript with socket integration
  /shared/
    common.css    # Shared styles (colors, utilities)
  /app/
    app.html      # Unchanged - no panel code
    app.js        # Unchanged - no panel code
```

### Panel Features
- **Fullscreen Design**: Optimized for large displays
- **Socket Integration**: Uses existing panel socket events
- **Responsive**: Works on different screen sizes
- **High Contrast**: Visible from distance

## Files Created/Modified

### New Files Created
- `public/panel/panel.html` - Fullscreen panel interface
- `public/panel/panel.js` - Panel JavaScript with socket integration
- `public/shared/common.css` - Shared CSS variables and utilities

### Server Changes
- `server.js` - Added `/app/:pin/panel` route and `/shared` static serving
- `tests/e2e/app-flow.test.js` - Added panel route tests

### No Changes to App Files
- `public/app/app.html` - Unchanged (reverted panel additions)
- `public/app/app.js` - Unchanged (reverted panel routing)

## Implementation Tasks ✅

1. **✅ Route Setup** - Added server route for `/app/:pin/panel`
2. **✅ Separate Structure** - Created dedicated panel directory
3. **✅ Shared CSS** - Created reusable CSS file for common styles
4. **✅ Panel HTML** - Created fullscreen optimized panel interface
5. **✅ Panel JavaScript** - Implemented socket integration
6. **✅ Testing** - Added E2E tests for panel functionality

## Success Criteria

- ✅ `/app/123456/panel` loads successfully
- ✅ Panel shows game status, questions, and player count
- ✅ Real-time updates work via existing socket events
- ✅ UI is optimized for large screen display
- ✅ No interactive elements present
- ✅ All existing functionality remains unaffected

## Notes

- Leverages existing panel socket infrastructure
- Reuses app.html SPA approach for consistency
- Follows established routing patterns from game/dashboard
- No backend changes needed for socket events (already implemented)
- Focus on frontend UI optimized for distance viewing