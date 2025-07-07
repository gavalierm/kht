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
- **Player App** (`/app`): Players join games and answer questions
- **Dashboard** (`/dashboard`): Moderators create and control games  
- **Panel** (`/panel`): Display boards for showing leaderboards and questions

### Key Game Flow

1. **Game Creation**: Moderators create games via dashboard with optional custom PIN
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
  /app/          # Player interface (SPA)
  /dashboard/    # Moderator interface  
  /panel/        # Display panel interface
server.js        # Main server and Socket.io handling
database.js      # Database abstraction layer
quiz.db          # SQLite database file
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

## Test Setup

A test game is automatically created with PIN `123456` for development purposes.