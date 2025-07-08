# Issue #25: Better Visibility for Connection Status (Reconnect Notification)

**Link to Issue:** https://github.com/gavalierm/kht/issues/25

## Problem Analysis

### Current State
- Application already has socket.io reconnect logic in `public/shared/socket.js`
- Currently shows temporary warning notification on disconnect: "Connection lost, attempting to reconnect..."
- Notification disappears after 3 seconds (standard notification duration)
- Users lose visibility of connection status during longer disconnections
- No clear indication when connection is restored

### Requirements
- **Persistent banner** that stays visible during disconnection (not temporary notification)
- Banner appears **within 1 second** of disconnection
- **Automatically hides** when connection is restored
- **Non-dismissible** by user
- **Optional visual indicator** (spinner/pulsing animation)
- **Consistent across all pages** (`/game`, `/dashboard`, `/panel`, `/stage`)
- **Clear, simple language** (no technical errors)

## Technical Analysis

### Existing Infrastructure
1. **Socket Manager** (`public/shared/socket.js`):
   - Already tracks `isConnected` state
   - Emits custom events: `socket:connected`, `socket:disconnected`, `socket:reconnected`
   - Currently calls `showWarning()` on disconnect (line 41)

2. **Notification System** (`public/shared/notifications.js`):
   - Temporary notifications (3-second duration)
   - CSS classes: error, info, success, warning
   - Not suitable for persistent banners

3. **Pages with Real-time Communication**:
   - `public/game/game.html` - Player interface
   - `public/dashboard/dashboard.html` - Moderator control panel
   - `public/panel/panel.html` - Fullscreen display for audience
   - `public/stage/stage.html` - Results/leaderboard display

### Design Approach

**Modular Solution:**
1. Create a **Connection Status Banner** component in shared utilities
2. Add banner HTML structure to each page template
3. Enhance socket manager to trigger banner visibility
4. Add CSS for banner styling and animations
5. Write comprehensive tests

## Implementation Plan

### Phase 1: Create Connection Status Banner Component ✅
**File:** `public/shared/connectionStatus.js`
- `ConnectionStatusBanner` class
- Methods: `show()`, `hide()`, `updateMessage()`, `setReconnecting()`
- Integration with existing socket events
- Non-dismissible banner with optional spinner

### Phase 2: Add CSS Styling ✅
**File:** `public/shared/common.css`
- Banner container styles (top/bottom positioning)
- Animation classes (pulsing, spinner)
- Responsive design
- Color scheme integration

### Phase 3: Update Socket Manager ✅
**File:** `public/shared/socket.js`
- Replace temporary notification with persistent banner
- Handle banner visibility on connect/disconnect/reconnect events
- Ensure timing requirements (< 1 second)

### Phase 4: Add Banner to All Pages ✅
**Files:** All HTML templates
- Add banner HTML container to each page
- Include connectionStatus.js script
- Initialize banner component

### Phase 5: Testing ✅
**File:** `tests/unit/connection-status.test.js`
- Test banner show/hide functionality
- Test message updates
- Test timing requirements
- Test integration with socket events

### Phase 6: E2E Testing ✅
- Test on all real-time pages
- Verify banner appears within 1 second
- Test reconnection scenarios
- Ensure no duplicate/flickering notifications

### Phase 7: Deployment ✅
**Pull Request:** https://github.com/gavalierm/kht/pull/27
- Created comprehensive PR with detailed implementation summary
- All acceptance criteria validated and documented
- Ready for code review and merge

## Acceptance Criteria Validation

- [x] Disconnection triggers visible UI element within 1 second
- [x] Notification automatically removed when connection restored
- [x] No duplicate or flickering notifications
- [x] Tested on all real-time pages (`/game`, `/dashboard`, `/panel`, `/stage`)
- [x] Non-dismissible banner with clear messaging
- [x] Optional visual indicator during reconnection

**All acceptance criteria have been successfully implemented and tested.**

## Technical Specifications

### Banner Positioning
- **Top banner** preferred for better visibility
- Fixed positioning to stay visible during scrolling
- High z-index to appear above other content

### Message Content
- **Disconnected:** "Connection lost. Trying to reconnect..."
- **Reconnecting:** "Reconnecting..." (with spinner)
- **Reconnected:** Brief success message before hiding

### Animation Details
- **Appear:** Slide down from top with ease-out
- **Reconnecting:** Subtle pulsing or spinner animation
- **Disappear:** Fade out when connection restored

### Browser Compatibility
- Modern browsers supporting CSS flexbox and animations
- Graceful degradation for older browsers
- Mobile-responsive design