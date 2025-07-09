# Issue #34: Deep Refactor for High-Concurrency Quiz Game (250+ Players)

**Issue Link**: https://github.com/gavalierm/kht/issues/34

## Analysis Summary

The current architecture can handle ~20-50 concurrent players but will face severe bottlenecks at 250+ players. Critical issues identified:

### Critical Bottlenecks
1. **SQLite limitations** - synchronous operations, no connection pooling
2. **Memory management** - unbounded growth, no cleanup strategies  
3. **Socket.io scalability** - single server instance, no horizontal scaling
4. **State management** - all players in single GameInstance objects
5. **Duplicated logic** - repeated patterns across 5 SPAs

### Current Dependencies
- sqlite3: ^5.1.7 (NEEDS REPLACEMENT)
- socket.io: ^4.8.1 ✓
- express: ^5.1.0 ✓

## Refactoring Plan

### Phase 1: Database Layer Optimization (Priority: Critical)
**Target**: Replace SQLite with better-sqlite3 + WAL mode for immediate performance boost

**Tasks**:
1. Replace `sqlite3` with `better-sqlite3` in package.json
2. Convert database.js from callback-based to synchronous better-sqlite3 patterns
3. Enable WAL mode and optimize SQLite settings
4. Add connection pooling simulation with better-sqlite3
5. Optimize database schema with proper indexing
6. Batch database writes to reduce I/O blocking

**Expected Impact**: 3-5x performance improvement for database operations

### Phase 2: Socket.io Broadcasting Optimization (Priority: Critical) 
**Target**: Optimize real-time communication for 250+ players

**Tasks**:
1. Replace individual socket emissions with room-based broadcasting
2. Implement delta updates instead of full state broadcasts
3. Add message compression for large payloads
4. Optimize socket event structure to reduce bandwidth
5. Implement connection rate limiting and management
6. Add socket connection pooling strategies

**Expected Impact**: 5-10x reduction in socket traffic, support for 250+ concurrent connections

### Phase 3: Memory Management & State Optimization (Priority: High)
**Target**: Prevent memory leaks and optimize game state storage

**Tasks**:
1. Implement memory cleanup strategies for old games/players
2. Partition game state by phases (lobby, active, finished)
3. Optimize player data structures - store only essential data
4. Implement efficient leaderboard calculation with caching
5. Add garbage collection triggers for game instances
6. Optimize answer storage with circular buffers

**Expected Impact**: 10x reduction in memory usage per game

### Phase 4: Shared Logic Centralization (Priority: Medium)
**Target**: Eliminate code duplication and create reusable modules

**Tasks**:
1. Create unified Socket Manager in `/lib/socketManager.js`
2. Centralize game state management in `/lib/stateManager.js`
3. Create shared error handling system in `/lib/errorHandler.js`
4. Unify reconnection logic across all interfaces
5. Extract shared UI components for better maintainability
6. Create shared validation modules

**Expected Impact**: 50% reduction in code duplication, improved maintainability

### Phase 5: Performance Monitoring & Scaling (Priority: Medium)
**Target**: Add observability and horizontal scaling capabilities

**Tasks**:
1. Add performance metrics and monitoring
2. Implement connection monitoring dashboard
3. Add load testing capabilities
4. Prepare for Redis integration (future horizontal scaling)
5. Add error tracking and alerting
6. Create scaling indicators and thresholds

**Expected Impact**: Full visibility into system performance, scaling readiness

## Implementation Strategy

### Step 1: Database Migration (Week 1)
- Replace sqlite3 with better-sqlite3
- Enable WAL mode 
- Convert to synchronous patterns
- Add proper indexing

### Step 2: Socket Optimization (Week 1-2)
- Implement room-based broadcasting
- Add delta updates
- Optimize message structure
- Add connection management

### Step 3: Memory & State (Week 2-3)
- Add memory cleanup
- Optimize state structures
- Implement efficient caching
- Add garbage collection

### Step 4: Code Centralization (Week 3-4)
- Extract shared modules
- Unify socket handling
- Create reusable components
- Eliminate duplicated logic

### Step 5: Monitoring & Testing (Week 4)
- Add performance monitoring
- Create load testing suite
- Validate 250+ player capacity
- Document performance characteristics

## Success Criteria

### Performance Targets
- **Concurrent Players**: 250+ in single game
- **Response Time**: <100ms for real-time actions
- **Memory Usage**: <50MB per 100 players
- **CPU Usage**: <50% on single core for 250 players
- **Database Performance**: <10ms for critical operations

### Quality Targets
- **Code Duplication**: <10% across interfaces
- **Test Coverage**: >90% for core logic
- **Module Separation**: Clear boundaries between transport/logic/UI
- **Memory Leaks**: Zero detected memory leaks
- **Error Rate**: <0.1% for normal operations

## Risk Assessment

### High Risk
- Database migration complexity
- Socket.io compatibility with optimizations
- Memory management edge cases
- State consistency during high load

### Medium Risk  
- Test suite compatibility with changes
- Frontend integration complexity
- Performance regression during refactor
- Backward compatibility (not required per issue)

### Mitigation Strategies
- Incremental rollout with feature flags
- Comprehensive testing at each phase
- Performance benchmarking before/after each change
- Rollback procedures for each major change

## Testing Strategy

### Unit Tests
- Database performance tests
- Memory management tests  
- State consistency tests
- Socket event optimization tests

### Integration Tests
- Multi-client socket tests
- Database concurrency tests
- Memory leak detection tests
- End-to-end game flow tests

### Load Tests
- 250+ concurrent player simulation
- Stress testing for memory/CPU
- Network bandwidth optimization validation
- Database performance under load

### Acceptance Tests
- All existing functionality preserved
- Real-time performance meets targets
- Memory usage within limits
- Error rates within acceptable bounds

## Timeline

**Total Duration**: 4 weeks
**Phases**: 5 phases with overlapping execution
**Milestones**: Weekly performance validation
**Final Validation**: Load test with 250+ simulated players

## Notes

- No backward compatibility required (development app)
- Focus on real-world constraints and performance
- Modular architecture for independent testing
- Prepare for future horizontal scaling with Redis