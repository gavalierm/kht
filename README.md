# KHT Quiz Application

Real-time multiplayer quiz system built with Node.js, Socket.io, and SQLite.

## Quick Start

```bash
# Use npm ci for clean install without modifying package-lock.json
npm ci
npm run dev
```

Visit `http://localhost:3000` to start playing.

## Features

- 🎮 **Real-time multiplayer** - Live quiz sessions
- 📱 **Multi-interface** - Player, moderator, display, and stage views
- 🔐 **Secure** - Token-based authentication
- 🌐 **Slovak localization** - Full Slovak language support

## Interfaces

- `/join` - Player entry point
- `/game` - Player interface
- `/moderator` - Moderator panel
- `/panel` - Display screen
- `/stage` - Results view
- `/create` - Game creation

## Testing

```bash
npm test                # All tests
npm run test:unit       # Unit tests
npm run test:integration # Integration tests
npm run test:frontend   # Frontend tests
```

## License

ISC