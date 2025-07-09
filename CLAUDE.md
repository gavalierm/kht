# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Start Development Server
```bash
npm run dev
```
Uses nodemon to run server.js with automatic restarts on file changes.

### Start Production Server
```bash
npm start
```
Runs server.js directly with Node.js.

### Install Dependencies
```bash
npm install
```

### Process Management
```bash
npm run cleanup           # Kill any running server processes
npm run dev:clean        # Clean up and start fresh dev server
```

### Testing Commands
```bash
npm test                    # Run all tests (67 tests)
npm run test:unit          # Run unit tests (42 tests)
npm run test:integration   # Run integration tests (16 tests) 
npm run test:e2e          # Run E2E tests (19 tests)
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
```

## Architecture Overview

This is a real-time multiplayer quiz application built with Node.js, Express, Socket.io, and SQLite. The application has three main interfaces:

### Core Components

**Server Architecture (server.js)**
- Express server with Socket.io for real-time communication
- In-memory game state management with database persistence
- SQLite database for data persistence and recovery
- Three main user interfaces served from `/public/` directories

**Database Layer (database.js)**
- SQLite database with GameDatabase class
- Handles games, players, and answers storage
- Automatic test game creation with PIN `123456`
- Cleanup routines for old games

**Client Applications**
- **Player Game** (`/game`): Players join games and answer questions
- **Moderator** (`/moderator`): Moderators create and control games  
- **Panel** (`/panel`): Display boards for showing leaderboards and questions
- **Stage** (`/stage`): Post-game leaderboard displays
- **Join** (`/join`): Main entry point for players to join games
- **Create** (`/create`): Interface for creating new games

### Key Game Flow

1. **Game Creation**: Moderators create games via moderator panel with optional custom PIN
2. **Player Joining**: Players use 6-digit PIN to join games
3. **Question Flow**: Questions are broadcast to all players simultaneously
4. **Answer Submission**: Players submit answers with latency compensation
5. **Results Display**: Leaderboards and answer statistics shown after each question

### Data Flow

- **In-Memory State**: Active games stored in `activeGames` Map for performance
- **Database Persistence**: Game state synced to SQLite every 30 seconds
- **Real-time Updates**: Socket.io events for live game interactions
- **Reconnection Support**: Players and moderators can rejoin games using tokens

### Important Classes

**GameInstance Class**
- Manages individual game state in memory
- Handles player management, scoring, and question progression
- Provides database synchronization methods

**GameDatabase Class**
- SQLite database operations
- Player and game management
- Token-based authentication for reconnection

## Project Structure

```
/public/
  /game/         # Player interface (SPA)
  /join/         # Main entry point for players
  /moderator/    # Moderator interface  
  /panel/        # Display panel interface
  /stage/        # Post-game leaderboard display
  /create/       # Game creation interface
  /shared/       # Shared frontend utilities
    ├── router.js       # Client-side routing
    ├── socket.js       # Socket.io client wrapper
    ├── constants.js    # Event constants and UI constants
    ├── api.js          # API utilities
    ├── dom.js          # DOM manipulation helpers
    ├── gameState.js    # Client state management
    ├── notifications.js # UI notification system
    └── common.css      # Shared styles
server.js        # Main server and Socket.io handling
database.js      # Database abstraction layer
quiz.db          # SQLite database file
/tests/          # Comprehensive test suite (67 tests)
  ├── unit/      # Unit tests (42 tests)
  ├── integration/ # Integration tests (16 tests)
  ├── e2e/       # End-to-end tests (19 tests)
  ├── fixtures/  # Test data
  └── helpers/   # Test utilities
```

## Socket.io Events

### Player Events
- `join_game` - Player joins with PIN
- `reconnect_player` - Reconnect with player token
- `submit_answer` - Submit answer to current question

### Moderator Events  
- `create_game` - Create new game
- `reconnect_moderator` - Reconnect with moderator token
- `start_question` - Start next question
- `end_question` - End current question early

### Panel Events
- `join_panel` - Join as display panel viewer

## Key Features

- **Latency Compensation**: Answer timing adjusted for network delays
- **Reconnection Support**: Players and moderators can rejoin games
- **Database Persistence**: Games survive server restarts
- **Real-time Updates**: Live leaderboards and statistics
- **Multiple Interfaces**: Separate apps for different user types
- **Smart Routing**: URL-based game joining with context-aware redirects
- **Performance Optimization**: In-memory state with periodic database sync

## Development Workflow

### Frontend Architecture
- **Shared Utilities**: Common code in `/public/shared/` directory
- **Event-Driven**: Socket.io events defined in `constants.js`
- **Client-Side Routing**: SPA routing with history management
- **State Management**: Local storage for game state persistence

### Backend Architecture
- **Event-Driven**: Socket.io event handlers in `server.js`
- **Database Layer**: SQLite with GameDatabase class abstraction
- **In-Memory Performance**: Active games stored in `activeGames` Map
- **Periodic Sync**: Database state synchronized every 30 seconds

### Testing Strategy
- **Unit Tests**: Game logic, PIN generation, scoring algorithms
- **Integration Tests**: Socket.io real-time communication
- **E2E Tests**: Complete application flow validation
- **CI/CD**: GitHub Actions with multi-Node.js version testing

## Language & Localization

- **Primary Language**: Slovak (Slovenčina)
- **UI Text**: All user-facing text in Slovak
- **Test Data**: Includes Slovak language content
- **Error Messages**: Localized error handling

## Test Setup

A test game is automatically created with PIN `123456` for development purposes.