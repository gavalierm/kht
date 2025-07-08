# Issue #20: Fix Latency Measurement Duplication

**Issue Link**: https://github.com/gavalierm/kht/issues/20

## Problem Description
The `setupLatencyMeasurement()` method in `public/game/game.js` has the same problematic fake latency calculation that was fixed in issue #19. It uses `Math.round(performance.now() % 100)` which generates pseudo-random values instead of measuring actual network latency.

## Current State Analysis
- **Location**: `/public/game/game.js` lines 143-151
- **Problem**: Uses fake latency calculation `Math.round(performance.now() % 100)`
- **Duplication**: The SocketManager already has a proper `setupLatencyMeasurement` method
- **HTML Element**: `latencyDisplay` element exists in `game.html` (line 423)

## Proposed Solution
Replace the current implementation with a call to the SocketManager's `setupLatencyMeasurement` method, which:
1. Properly calculates round-trip latency using ping/pong with server
2. Handles latency display updates
3. Eliminates code duplication

## Implementation Plan

### Step 1: Update setupLatencyMeasurement method
- Replace the current implementation with `this.socket.setupLatencyMeasurement(this.elements.latencyDisplay)`
- Remove the custom interval logic
- Remove the `latencyInterval` property since it's no longer needed

### Step 2: Clean up related code
- Remove `latencyInterval` property from constructor
- Remove any cleanup code related to `latencyInterval`

### Step 3: Update tests
- Ensure existing tests still pass
- Add test for the simplified latency setup if needed

### Step 4: Test the fix
- Run unit tests
- Run integration tests
- Verify latency display works correctly

## Expected Outcome
- Accurate latency measurement instead of fake values
- Elimination of code duplication
- Cleaner, more maintainable code
- Consistent latency measurement across the application

## Files to modify
- `/public/game/game.js` - Main fix location
- Tests if needed