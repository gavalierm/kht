const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const GameDatabase = require('./database');
const { GameInstance } = require('./lib/gameInstance');
const { generateGamePin } = require('./lib/gameUtils');
const SocketManager = require('./lib/socketManager');
const MemoryManager = require('./lib/memoryManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Optimize for high concurrency
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB limit for large payloads
  allowEIO3: false // Disable legacy Engine.IO support
});

// Helper function to validate question structure
function validateQuestions(questions) {
  if (!Array.isArray(questions)) {
    return false;
  }
  
  return questions.every(q => 
    q && 
    typeof q === 'object' &&
    q.question && 
    typeof q.question === 'string' &&
    Array.isArray(q.options) && 
    q.options.length === 4 && 
    q.options.every(opt => typeof opt === 'string') &&
    typeof q.correct === 'number' && 
    q.correct >= 0 && 
    q.correct <= 3 &&
    typeof q.timeLimit === 'number' &&
    q.timeLimit > 0
  );
}

// Middleware
app.use(express.json());

// Static files for each app
app.use('/moderator', express.static(path.join(__dirname, 'public/moderator')));
app.use('/panel', express.static(path.join(__dirname, 'public/panel')));
app.use('/stage', express.static(path.join(__dirname, 'public/stage')));
app.use('/join', express.static(path.join(__dirname, 'public/join')));
app.use('/create', express.static(path.join(__dirname, 'public/create')));
app.use('/shared', express.static(path.join(__dirname, 'public/shared')));
app.use(express.static(path.join(__dirname, 'public/game')));

// Global variables
const activeGames = new Map(); // gamePin -> GameInstance (in-memory for performance)
const playerLatencies = new Map(); // socketId -> latency
const socketToPlayer = new Map(); // socketId -> {gamePin, playerId, playerToken}
const socketToModerator = new Map(); // socketId -> {gamePin, gameId}

// Initialize database and socket manager
const db = new GameDatabase();
const socketManager = new SocketManager(io);

// Initialize memory manager for high-concurrency support
const memoryManager = new MemoryManager(activeGames, {
  maxActiveGames: 100,
  maxMemoryUsageMB: 512,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
  gameInactivityTimeout: 30 * 60 * 1000 // 30 minutes
});

// GameInstance class moved to ./lib/gameInstance.js

// Helper functions moved to ./lib/gameUtils.js

// Routes
app.get('/', (req, res) => {
  res.redirect('/join');
});

// Join page - PIN entry interface
app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/join/join.html'));
});

// Create page - Quick game creation interface
app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/create/create.html'));
});

// Game page - main player interface (check session like join does)
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/game/game.html'));
});

// Game page with PIN - player interface
app.get('/game/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/game/game.html'));
});

// Panel page (fullscreen display for venues)
app.get('/panel/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/panel/panel.html'));
});

// Stage page (post-game leaderboard)
app.get('/stage/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/stage/stage.html'));
});

// Moderator page (moderator control panel)
app.get('/moderator/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/moderator/moderator.html'));
});

// Control routes (legacy - will be phased out, redirecting to moderator)
app.get('/control', (req, res) => {
  res.redirect('/moderator');
});

// Moderator page (without PIN)
app.get('/moderator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/moderator/moderator.html'));
});

// Dashboard routes (legacy - will be phased out, redirecting to moderator)
app.get('/dashboard', (req, res) => {
  res.redirect('/moderator');
});

app.get('/dashboard/:pin', (req, res) => {
  res.redirect(`/moderator/${req.params.pin}`);
});

// Panel routes (legacy - will be phased out)
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/panel/panel.html'));
});

// Favicon fallback
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// API route for game recovery
app.get('/api/games/:pin', async (req, res) => {
  try {
    const gameData = await db.getGameByPin(req.params.pin);
    if (!gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
      pin: gameData.pin,
      status: gameData.status,
      currentQuestionIndex: gameData.current_question_index,
      questionCount: gameData.questions.length
    });
  } catch (error) {
    console.error('Error in /api/game/:pin:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API route for getting game leaderboard (for stage interface)
app.get('/api/games/:pin/leaderboard', async (req, res) => {
  try {
    const gamePin = req.params.pin;
    
    // Check if game exists in active games first
    const activeGame = activeGames.get(gamePin);
    if (activeGame) {
      const leaderboard = activeGame.getLeaderboard();
      return res.json({
        leaderboard: leaderboard,
        totalPlayers: Array.from(activeGame.players.values()).filter(p => p.connected).length,
        totalQuestions: activeGame.questions.length,
        status: activeGame.phase.toLowerCase()
      });
    }
    
    // If not in active games, get from database
    const gameData = await db.getGameByPin(gamePin);
    if (!gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const players = await db.getGamePlayers(gameData.id);
    const leaderboard = players
      .map((player, index) => ({
        id: player.id,
        name: `Hráč ${index + 1}`,
        score: player.score || 0
      }))
      .sort((a, b) => b.score - a.score);
    
    res.json({
      leaderboard: leaderboard,
      totalPlayers: players.length,
      totalQuestions: gameData.questions.length,
      status: gameData.status
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Question Templates API endpoints
app.get('/api/question-templates/:templateId', async (req, res) => {
  try {
    const templateId = req.params.templateId;
    const fs = require('fs').promises;
    const path = require('path');
    
    // Read the template file
    const templatePath = path.join(__dirname, 'questions', `${templateId}.json`);
    const templateData = await fs.readFile(templatePath, 'utf8');
    const template = JSON.parse(templateData);
    
    // Transform the structure to match frontend expectations
    const response = {
      id: templateId,
      title: templateId.charAt(0).toUpperCase() + templateId.slice(1),
      category: templateId,
      questions: template.quiz ? template.quiz.questions : (template.questions || [])
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error loading question template:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Question template not found' });
    } else {
      res.status(500).json({ error: 'Failed to load question template' });
    }
  }
});

app.put('/api/question-templates/:templateId', async (req, res) => {
  try {
    const templateId = req.params.templateId;
    const { questions } = req.body;
    const fs = require('fs').promises;
    const path = require('path');
    
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions array is required' });
    }
    
    // Read the current template to preserve structure
    const templatePath = path.join(__dirname, 'questions', `${templateId}.json`);
    let template;
    try {
      const templateData = await fs.readFile(templatePath, 'utf8');
      template = JSON.parse(templateData);
    } catch (error) {
      // If template doesn't exist, create a new one with the expected structure
      template = {
        quiz: {
          questions: []
        }
      };
    }
    
    // Update the questions while preserving the original structure
    if (template.quiz) {
      template.quiz.questions = questions;
    } else {
      template.questions = questions;
    }
    
    // Write the updated template back to file
    await fs.writeFile(templatePath, JSON.stringify(template, null, 2));
    
    res.json({ success: true, message: 'Questions updated successfully' });
  } catch (error) {
    console.error('Error saving question template:', error);
    res.status(500).json({ error: 'Failed to save question template' });
  }
});

// Game-specific question management API endpoints
app.get('/api/games/:pin/questions', async (req, res) => {
  try {
    const gamePin = req.params.pin;
    
    // Get game and its questions from database
    const gameData = await db.getGameByPin(gamePin);
    
    if (!gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Return questions in the format expected by frontend
    res.json({
      id: gamePin,
      gameId: gameData.id,
      questions: gameData.questions || []
    });
  } catch (error) {
    console.error('Error loading game questions:', error);
    res.status(500).json({ error: 'Failed to load game questions' });
  }
});

app.put('/api/games/:pin/questions', async (req, res) => {
  try {
    const gamePin = req.params.pin;
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions array is required' });
    }
    
    // Get game ID first
    const gameData = await db.getGameByPin(gamePin);
    
    if (!gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Update questions in database
    await new Promise((resolve, reject) => {
      db.updateGameQuestions(gameData.id, questions, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({ success: true, message: 'Questions updated successfully' });
  } catch (error) {
    console.error('Error updating game questions:', error);
    res.status(500).json({ error: 'Failed to update game questions' });
  }
});


// Helper function to reset test game
async function resetTestGame(game, moderatorSocket) {
  console.log(`Resetting test game ${game.gamePin}, preserving ${game.questions?.length || 0} questions`);
  
  // Reset game state
  game.phase = 'WAITING';
  game.currentQuestionIndex = 0;
  game.questionStartTime = null;
  game.answers = [];
  
  // Disconnect all players from their sockets
  for (const player of game.players.values()) {
    if (player.socketId) {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.leave(`game_${game.gamePin}`);
        playerSocket.emit('game_state_update', {
          status: 'reset',
          message: 'Hra bola resetovaná. Pripojte sa znovu.'
        });
      }
    }
  }
  
  // Clear all players from game state
  game.players.clear();
  
  // Remove all players from database
  try {
    await db.removeAllPlayersFromGame(game.dbId);
    console.log(`Removed all players from database for game ${game.gamePin}`);
  } catch (error) {
    console.error(`Error removing players from database for game ${game.gamePin}:`, error);
  }
  
  // Sync to database
  await game.syncToDatabase(db);
  
  // Notify moderator about reset
  moderatorSocket.emit('game_reset_success', {
    message: 'Test hra bola resetovaná'
  });
  
  // Update moderator interface with reset state (no players)
  moderatorSocket.emit('moderator_reconnected', {
    gamePin: game.gamePin,
    questionCount: game.questions.length,
    currentQuestionIndex: 0,
    status: 'waiting',
    players: [],
    totalPlayers: 0,
    moderatorToken: socketToModerator.get(moderatorSocket.id)?.moderatorToken
  });
  
  // Update panel leaderboard (empty)
  socketManager.broadcastLeaderboardUpdate(game.gamePin, game.getLeaderboard());
  
  // Notify panels about the reset
  io.to(`game_${game.gamePin}_panel`).emit('game_state_update', {
    status: 'waiting'
  });
  
  console.log(`Test game ${game.gamePin} has been reset - all players removed`);
}

// Socket.io connection handling with high-concurrency optimizations
io.on('connection', (socket) => {
  // Apply connection throttling and validation
  if (!socketManager.handleConnection(socket)) {
    return; // Connection rejected due to capacity
  }
  
  console.log('New connection:', socket.id, `(${socketManager.getConnectionStats().totalConnections} total)`);

  // Optimized latency measurement with reduced frequency for high load
  socket.on('latency_pong', (timestamp) => {
    const latency = Date.now() - timestamp;
    playerLatencies.set(socket.id, latency);
  });

  // Adaptive latency measurement based on connection count
  const getLatencyInterval = () => {
    const connections = socketManager.getConnectionStats().totalConnections;
    return connections > 100 ? 30000 : connections > 50 ? 20000 : 10000; // Scale with load
  };

  const latencyInterval = setInterval(() => {
    socket.emit('latency_ping', Date.now());
  }, getLatencyInterval());

  // Dashboard: Create new game
  socket.on('create_game', async (data) => {
    try {
      // Validate moderator password is provided
      if (!data.moderatorPassword || data.moderatorPassword.trim().length < 3) {
        socket.emit('create_game_error', { 
          message: 'Heslo moderátora je povinné a musí mať aspoň 3 znaky' 
        });
        return;
      }
      
      const gamePin = generateGamePin(null, activeGames);
      
      // Get default questions
      const questions = []; // Start with empty questions - moderators will add their own
      
      // Save to database
      const dbResult = await db.createGame(
        gamePin, 
        questions,
        data.moderatorPassword
      );
      
      // Create in-memory game instance
      const game = new GameInstance(gamePin, questions, dbResult.gameId);
      game.moderatorSocket = socket.id;
      activeGames.set(gamePin, game);
      
      // Store moderator info
      socketToModerator.set(socket.id, {
        gamePin: gamePin,
        gameId: dbResult.gameId,
        moderatorToken: dbResult.moderatorToken
      });
      
      socketManager.joinGame(socket, gamePin, 'moderator');
      socket.emit('game_created', {
        gamePin: gamePin,
        questionCount: questions.length,
        moderatorToken: dbResult.moderatorToken
      });
      
      // Broadcast initial waiting state to any connected panels
      socketManager.broadcastGameState(gamePin, {
        status: 'waiting',
        questionNumber: 1,
        totalQuestions: questions.length
      });
      
      console.log(`Game created: ${gamePin} (DB ID: ${dbResult.gameId})`);
      
    } catch (error) {
      console.error('Create game error:', error);
      socket.emit('create_game_error', { 
        message: 'Chyba pri vytváraní hry' 
      });
    }
  });


  // Dashboard: Reconnect moderator
  socket.on('reconnect_moderator', async (data) => {
    try {

      // Check if moderator is already connected to prevent duplicates
      const existingModeratorInfo = socketToModerator.get(socket.id);
      if (existingModeratorInfo && existingModeratorInfo.gamePin === data.gamePin) {
        return;
      }

      const gameData = await db.validateModerator(data.gamePin, data.password, data.moderatorToken);
      
      if (!gameData) {
        socket.emit('moderator_reconnect_error', { 
          message: 'Neplatné prihlásenie moderátora alebo hra neexistuje' 
        });
        return;
      }

      // Check if game exists in memory
      let game = activeGames.get(data.gamePin);
      if (!game) {
        // Restore game from database
        const players = await db.getGamePlayers(gameData.id);
        console.log(`Restoring game ${data.gamePin} with ${gameData.questions?.length || 0} questions`);
        game = new GameInstance(data.gamePin, gameData.questions, gameData.id);
        game.phase = gameData.status.toUpperCase();
        game.currentQuestionIndex = gameData.current_question_index;
        game.questionStartTime = gameData.question_start_time;
        
        // Restore players in join order with corrected names
        players.forEach((playerData, index) => {
          game.addPlayer(playerData.id, {
            name: `Hráč ${index + 1}`,
            player_token: playerData.player_token,
            score: playerData.score
          });
        });
        
        // Set join order counter to match restored players
        game.playerJoinOrder = players.length;
        
        activeGames.set(data.gamePin, game);
      }
      
      // Remove any existing moderator connection for this game
      for (const [existingSocketId, info] of socketToModerator.entries()) {
        if (info.gamePin === data.gamePin) {
          socketToModerator.delete(existingSocketId);
        }
      }
      
      game.moderatorSocket = socket.id;
      socketToModerator.set(socket.id, {
        gamePin: data.gamePin,
        gameId: gameData.id,
        moderatorToken: gameData.moderator_token
      });
      
      socketManager.joinGame(socket, data.gamePin, 'moderator');
      
      // Send current state to moderator
      const players = await db.getGamePlayers(gameData.id);
      const connectedPlayers = players.filter(p => p.connected);
      
      socket.emit('moderator_reconnected', {
        gamePin: data.gamePin,
        questionCount: gameData.questions.length,
        currentQuestionIndex: gameData.current_question_index,
        status: gameData.status,
        players: connectedPlayers.map((p, index) => `Hráč ${index + 1}`),
        totalPlayers: connectedPlayers.length,
        moderatorToken: gameData.moderator_token
      });
      
      
    } catch (error) {
      console.error('Moderator reconnect error:', error);
      socket.emit('moderator_reconnect_error', { 
        message: 'Chyba pri pripájaní moderátora' 
      });
    }
  });

  // Dashboard: Moderator logout
  socket.on('moderator_logout', (data) => {
    try {
      const moderatorInfo = socketToModerator.get(socket.id);
      if (moderatorInfo && moderatorInfo.gamePin === data.gamePin) {
        // Clean up moderator session
        const game = activeGames.get(data.gamePin);
        if (game && game.moderatorSocket === socket.id) {
          game.moderatorSocket = null;
        }
        socketToModerator.delete(socket.id);
      }
    } catch (error) {
      console.error('Moderator logout error:', error);
    }
  });

  // Dashboard: Start question
  socket.on('start_question', async (data) => {
    const game = activeGames.get(data.gamePin);
    if (!game || game.moderatorSocket !== socket.id) return;
    
    console.log(`Starting question for game ${data.gamePin}, questions count: ${game.questions.length}, current index: ${game.currentQuestionIndex}`);
    
    // Check if there are any players connected
    const connectedPlayers = Array.from(game.players.values()).filter(p => p.connected);
    if (connectedPlayers.length === 0) {
      socket.emit('start_question_error', { 
        message: 'Nemôžete spustiť otázku bez pripojených hráčov' 
      });
      return;
    }
    
    const question = game.getCurrentQuestion();
    if (!question) {
      console.log(`No question found for game ${data.gamePin} at index ${game.currentQuestionIndex}`);
      socket.emit('start_question_error', { 
        message: 'Žiadne otázky nie sú k dispozícii' 
      });
      return;
    }
    
    game.phase = 'QUESTION_ACTIVE';
    game.questionStartTime = Date.now();
    game.answers = [];
    
    const questionData = {
      questionNumber: game.currentQuestionIndex + 1,
      questionIndex: game.currentQuestionIndex, // 0-based index for internal use
      totalQuestions: game.questions.length,
      question: question.question,
      options: question.options,
      timeLimit: question.timeLimit || 30,
      serverTime: game.questionStartTime
    };
    
    // Use optimized broadcasting for question start
    socketManager.broadcastQuestionStart(data.gamePin, {
      ...questionData,
      correctAnswer: question.correct,
      questionIndex: game.currentQuestionIndex,
      totalPlayers: connectedPlayers.length
    });
    
    // Send to dashboard (moderator who started the question)
    socket.emit('question_started_dashboard', {
      ...questionData,
      correctAnswer: question.correct
    });
    
    // Sync to database
    await game.syncToDatabase(db);
    
    // Auto-end question after time limit
    setTimeout(() => {
      if (game.phase === 'QUESTION_ACTIVE') {
        endQuestion(game);
      }
    }, (question.timeLimit || 30) * 1000);
    
    console.log(`Question started in game ${data.gamePin}`);
  });

  // Dashboard: End question manually
  socket.on('end_question', (data) => {
    const game = activeGames.get(data.gamePin);
    if (!game || game.moderatorSocket !== socket.id) return;
    
    endQuestion(game);
  });

  // Dashboard: End game manually
  socket.on('end_game', (data) => {
    const game = activeGames.get(data.gamePin);
    if (!game || game.moderatorSocket !== socket.id) return;
    
    // Auto-reset test game instead of ending it
    if (data.gamePin === '123456') {
      resetTestGame(game, socket);
      return;
    }
    
    endGame(game);
  });


  // Player: Join game (optimized for high concurrency)
  socket.on('join_game', async (data) => {
    try {
      // Validate game capacity before processing
      if (!socketManager.canJoinGame(data.gamePin, 'player')) {
        socket.emit('join_error', { message: 'Hra je plná. Skúste to znova neskôr.' });
        return;
      }

      const gameData = db.getGameByPin(data.gamePin);
      if (!gameData) {
        socket.emit('join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
        return;
      }

      // Check if game exists in memory, if not restore it
      let game = activeGames.get(data.gamePin);
      if (!game) {
        const players = db.getGamePlayers(gameData.id);
        console.log(`Restoring game ${data.gamePin} for player join with ${gameData.questions?.length || 0} questions`);
        game = new GameInstance(data.gamePin, gameData.questions, gameData.id);
        game.phase = gameData.status.toUpperCase();
        game.currentQuestionIndex = gameData.current_question_index;
      
        // Restore players in join order with corrected names
        players.forEach((playerData, index) => {
          game.addPlayer(playerData.id, {
            name: `Hráč ${index + 1}`,
            player_token: playerData.player_token,
            score: playerData.score
          });
        });
        
        // Set join order counter to match restored players
        game.playerJoinOrder = players.length;
        activeGames.set(data.gamePin, game);
      }

      // Allow joining test game even if finished, but reset it
      if (data.gamePin === '123456' && game.phase === 'FINISHED') {
        // Reset test game to WAITING state
        game.phase = 'WAITING';
        game.currentQuestionIndex = 0;
        game.questionStartTime = null;
        game.answers = [];
        
        // Reset all player scores but keep them connected
        for (const player of game.players.values()) {
          player.score = 0;
        }
        
        // Sync reset state to database
        game.syncToDatabase(db);
        
        // Notify moderator about reset using optimized broadcasting
        const rooms = socketManager.getGameRooms(data.gamePin);
        io.to(rooms.moderators).emit('game_reset', {
          message: 'Test hra bola resetovaná kvôli novému hráčovi'
        });
      } else if (game.phase !== 'WAITING' && game.phase !== 'RESULTS') {
        socket.emit('join_error', { message: 'Hra už prebieha, nemôžete sa pripojiť' });
        return;
      }
    
      // Join optimized room structure
      if (!socketManager.joinGame(socket, data.gamePin, 'player')) {
        return; // Join failed due to capacity
      }

      // Add player to database - no name needed
      const playerResult = db.addPlayer(gameData.id);
    
      // Add to in-memory game (name will be auto-generated based on join order)
      game.addPlayer(playerResult.playerId, {
        player_token: playerResult.playerToken,
        score: 0
      });
    
      const player = game.getPlayer(playerResult.playerId);
      game.setPlayerSocket(playerResult.playerId, socket.id);
    
      // Store player info
      socketToPlayer.set(socket.id, {
        gamePin: data.gamePin,
        playerId: playerResult.playerId,
        playerToken: playerResult.playerToken
      });
    
      socket.emit('game_joined', {
        gamePin: data.gamePin,
        playerId: playerResult.playerId,
        playerName: player.name,
        playersCount: game.getConnectedPlayerCount(),
        playerToken: playerResult.playerToken
      });
    
      // Update dashboard with broadcasting
      const connectedPlayers = game.getConnectedPlayers();
      const rooms = socketManager.getGameRooms(data.gamePin);
      io.to(rooms.moderators).emit('player_joined', {
        playerId: playerResult.playerId,
        playerName: player.name,
        totalPlayers: connectedPlayers.length,
        players: connectedPlayers.map(p => ({ id: p.id, name: p.name }))
      });
    
      // Update panel leaderboard
      socketManager.broadcastLeaderboardUpdate(data.gamePin, game.getLeaderboard());
    
      console.log(`Player ${playerResult.playerId} joined game ${data.gamePin} (${connectedPlayers.length} total players)`);
    
    } catch (error) {
      console.error('Join game error:', error);
      socket.emit('join_error', { message: 'Chyba pri pripájaní do hry' });
    }
  });


  // Player: Reconnect
  socket.on('reconnect_player', async (data) => {
    try {
      // Check if player is already connected to prevent duplicates
      const existingPlayerInfo = socketToPlayer.get(socket.id);
      if (existingPlayerInfo && existingPlayerInfo.gamePin === data.gamePin) {
        console.log(`Player ${socket.id} already connected to game ${data.gamePin}`);
        return;
      }

      const gameData = await db.getGameByPin(data.gamePin);
      if (!gameData) {
        socket.emit('reconnect_error', { message: 'Hra neexistuje' });
        return;
      }

      const playerData = await db.reconnectPlayer(gameData.id, data.playerToken);
      if (!playerData) {
        socket.emit('reconnect_error', { message: 'Neplatný player token alebo hra už skončila' });
        return;
      }

      // Get or restore game
      let game = activeGames.get(data.gamePin);
      if (!game) {
        const players = await db.getGamePlayers(gameData.id);
        game = new GameInstance(data.gamePin, gameData.questions, gameData.id);
        game.phase = gameData.status.toUpperCase();
        game.currentQuestionIndex = gameData.current_question_index;
        
        // Restore players in join order and update join order counter
        players.forEach((p, index) => {
          game.addPlayer(p.id, {
            name: `Hráč ${index + 1}`,
            player_token: p.player_token,
            score: p.score
          });
        });
        
        // Set join order counter to match restored players
        game.playerJoinOrder = players.length;
        
        activeGames.set(data.gamePin, game);
      }

      // Update player in memory with optimized socket management
      if (game.players.has(playerData.id)) {
        game.setPlayerSocket(playerData.id, socket.id);
        const player = game.getPlayer(playerData.id);
        if (player) {
          player.connected = true;
        }
      }

      // Store player info (remove any existing connection first)
      for (const [existingSocketId, info] of socketToPlayer.entries()) {
        if (info.playerId === playerData.id) {
          socketToPlayer.delete(existingSocketId);
          console.log(`Removed old socket connection for player ${playerData.id}`);
        }
      }
      
      socketToPlayer.set(socket.id, {
        gamePin: data.gamePin,
        playerId: playerData.id,
        playerToken: data.playerToken
      });

      socketManager.joinGame(socket, data.gamePin, 'player');

      socket.emit('player_reconnected', {
        gamePin: data.gamePin,
        playerId: playerData.id,
        playerName: game.getPlayer(playerData.id)?.name || `Hráč ${playerData.id}`,
        score: playerData.score,
        gameStatus: game.phase
      });

      console.log(`Player ${playerData.name} reconnected to game ${data.gamePin}`);

    } catch (error) {
      console.error('Player reconnect error:', error);
      socket.emit('reconnect_error', { message: 'Chyba pri reconnect' });
    }
  });

  // Player: Submit answer
  socket.on('submit_answer', async (data) => {
    try {
      const playerInfo = socketToPlayer.get(socket.id);
      if (!playerInfo) return;

      const game = activeGames.get(playerInfo.gamePin);
      if (!game || game.phase !== 'QUESTION_ACTIVE') return;
      
      const answerData = game.submitAnswer(playerInfo.playerId, data.answer, playerLatencies);
      if (!answerData) return;

      const question = game.getCurrentQuestion();
      const isCorrect = data.answer === question.correct;
      const points = game.calculateScore(answerData.responseTime, isCorrect, question.timeLimit);
      
      // Update player score in memory with optimized access
      const player = game.getPlayer(playerInfo.playerId);
      if (player) {
        player.score += points;
        
        // Queue database operations for batching
        socketManager.queueDatabaseOperation({
          type: 'updatePlayerScore',
          execute: () => db.updatePlayerScore(playerInfo.playerId, player.score)
        });

        socketManager.queueDatabaseOperation({
          type: 'saveAnswer',
          execute: () => db.saveAnswer(
            game.dbId,
            playerInfo.playerId,
            game.currentQuestionIndex,
            data.answer,
            isCorrect,
            points,
            answerData.responseTime
          )
        });
      }
      
      // Send result to player
      socket.emit('answer_result', {
        correct: isCorrect,
        correctAnswer: question.correct,
        points: points,
        totalScore: player ? player.score : 0,
        responseTime: answerData.responseTime
      });
      
      // Update dashboard and panel with optimized broadcasting
      updateDashboardStats(game);
      socketManager.broadcastLeaderboardUpdate(game.gamePin, game.getLeaderboard());
      
      console.log(`Answer submitted by ${player?.name} in game ${playerInfo.gamePin}: ${data.answer} (${isCorrect ? 'correct' : 'wrong'})`);
      
    } catch (error) {
      console.error('Submit answer error:', error);
    }
  });

  // Panel: Join as panel viewer
  socket.on('join_panel', async (data) => {
    try {
      const gameData = await db.getGameByPin(data.gamePin);
      if (!gameData) {
        socket.emit('panel_join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
        return;
      }
      
      socketManager.joinGame(socket, data.gamePin, 'panel');
      
      // Send current game state to panel
      socket.emit('panel_game_joined', {
        gamePin: data.gamePin,
        title: gameData.title,
        questionCount: gameData.questions.length,
        currentState: gameData.status
      });
      
      // If game is in memory and waiting, send current waiting state
      const game = activeGames.get(data.gamePin);
      if (game && game.phase === 'WAITING') {
        socket.emit('game_state_update', {
          status: 'waiting',
          questionNumber: game.currentQuestionIndex + 1,
          totalQuestions: game.questions.length
        });
      }
      
      // If question is active, send current question
      if (gameData.status === 'question_active' && gameData.current_question_index < gameData.questions.length) {
        const question = gameData.questions[gameData.current_question_index];
        const questionData = {
          questionNumber: gameData.current_question_index + 1,
          totalQuestions: gameData.questions.length,
          question: question.question,
          options: question.options,
          timeLimit: question.timeLimit || 30,
          serverTime: gameData.question_start_time
        };
        socket.emit('panel_question_started', questionData);
      }
      
      // Send current leaderboard if available
      const players = await db.getGamePlayers(gameData.id);
      if (players.length > 0) {
        const leaderboard = players
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((player, index) => ({
            position: index + 1,
            name: `Hráč ${players.findIndex(p => p.id === player.id) + 1}`,
            score: player.score
          }));

        socket.emit('panel_leaderboard_update', { leaderboard });
      }
      
      console.log(`Panel joined game ${data.gamePin}`);
      
    } catch (error) {
      console.error('Panel join error:', error);
      socket.emit('panel_join_error', { message: 'Chyba pri pripájaní panelu' });
    }
  });

  // Disconnect handling
  socket.on('disconnect', async () => {
    console.log('Disconnected:', socket.id);
    
    // Clean up latency tracking
    playerLatencies.delete(socket.id);
    clearInterval(latencyInterval);
    
    // Handle player disconnect
    const playerInfo = socketToPlayer.get(socket.id);
    if (playerInfo) {
      try {
        // Mark as disconnected with optimized player management
        const game = activeGames.get(playerInfo.gamePin);
        if (game && game.players.has(playerInfo.playerId)) {
          game.removePlayer(playerInfo.playerId, false); // Temporary disconnection
          
          // Update dashboard and panel with optimized methods
          const rooms = socketManager.getGameRooms(playerInfo.gamePin);
          const playerName = game.getPlayer(playerInfo.playerId)?.name || `Hráč ${playerInfo.playerId}`;
          io.to(rooms.moderators).emit('player_left', {
            playerId: playerInfo.playerId,
            playerName: playerName,
            totalPlayers: game.getConnectedPlayerCount()
          });
          
          // Update panel leaderboard
          socketManager.broadcastLeaderboardUpdate(game.gamePin, game.getLeaderboard());
        }
      } catch (error) {
        console.error('Error handling player disconnect:', error);
      }
      
      socketToPlayer.delete(socket.id);
    }
    
    // Handle moderator disconnect
    const moderatorInfo = socketToModerator.get(socket.id);
    if (moderatorInfo) {
      const game = activeGames.get(moderatorInfo.gamePin);
      if (game && game.moderatorSocket === socket.id) {
        game.moderatorSocket = null;
        console.log(`Moderator disconnected from game ${moderatorInfo.gamePin}`);
      }
      socketToModerator.delete(socket.id);
    }
  });
});

// Helper function to end question
async function endQuestion(game) {
  if (game.phase !== 'QUESTION_ACTIVE') return;
  
  game.phase = 'RESULTS';
  const question = game.getCurrentQuestion();
  const leaderboard = game.getLeaderboard();
  
  // Calculate answer statistics
  const stats = calculateAnswerStats(game.answers, question.options.length);
  
  const resultsData = {
    correctAnswer: question.correct,
    leaderboard: leaderboard.slice(0, 10),
    answerStats: stats,
    totalAnswers: game.answers.length,
    totalPlayers: game.getConnectedPlayerCount()
  };
  
  // Use optimized broadcasting for question end
  socketManager.broadcastQuestionEnd(game.gamePin, {
    ...resultsData,
    canContinue: game.currentQuestionIndex < game.questions.length - 1
  });
  
  // Sync to database
  await game.syncToDatabase(db);
  
  console.log(`Question ended in game ${game.gamePin}`);
  
  // Check if this was the last question and end the game
  if (game.currentQuestionIndex >= game.questions.length - 1) {
    console.log(`Last question completed in game ${game.gamePin}, ending game`);
    setTimeout(async () => {
      // Auto-reset test game instead of ending it
      if (game.gamePin === '123456') {
        console.log('Auto-resetting test game after all questions completed');
        await resetTestGame(game, io.sockets.sockets.get(game.moderatorSocket));
      } else {
        await endGame(game);
      }
    }, 5000); // Wait 5 seconds before ending the game to show results
  } else {
    // Advance to next question after showing results for a few seconds
    setTimeout(() => {
      const hasNextQuestion = game.nextQuestion();
      if (hasNextQuestion) {
        console.log(`Advanced to question ${game.currentQuestionIndex + 1} in game ${game.gamePin}`);
        
        // Broadcast optimized state changes to all interfaces
        socketManager.broadcastGameState(game.gamePin, {
          status: 'waiting',
          questionNumber: game.currentQuestionIndex + 1,
          totalQuestions: game.questions.length
        });
        
        // Notify moderator that next question is ready
        const rooms = socketManager.getGameRooms(game.gamePin);
        io.to(rooms.moderators).emit('next_question_ready', {
          questionNumber: game.currentQuestionIndex + 1,
          questionIndex: game.currentQuestionIndex,
          totalQuestions: game.questions.length,
          canContinue: true
        });
      }
    }, 3000); // Wait 3 seconds to show results, then advance
  }
}

// Helper function to end game
async function endGame(game) {
  game.phase = 'FINISHED';
  const leaderboard = game.getLeaderboard();
  
  const gameEndData = {
    leaderboard: leaderboard,
    totalPlayers: game.getConnectedPlayerCount(),
    totalQuestions: game.questions.length
  };
  
  // Broadcast game end with optimized room structure
  const rooms = socketManager.getGameRooms(game.gamePin);
  
  // Send to all players
  io.to(rooms.players).emit('game_ended', gameEndData);
  
  // Send to moderators
  io.to(rooms.moderators).emit('game_ended_dashboard', gameEndData);
  
  // Send to panels - include all required events for compatibility
  io.to(rooms.panels).emit('panel_game_ended', gameEndData);
  io.to(rooms.panels).emit('game_state_update', { status: 'finished' });
  io.to(rooms.panels).emit('game_ended', gameEndData);
  
  // Sync to database
  await game.syncToDatabase(db);
  
  // Cleanup socket manager resources for finished game
  socketManager.cleanupGame(game.gamePin);
  
  console.log(`Game ended: ${game.gamePin}, broadcasting to all interfaces`);
}

// Helper function to update moderator panel stats (optimized)
function updateDashboardStats(game) {
  const question = game.getCurrentQuestion();
  const stats = calculateAnswerStats(game.answers, question.options.length);
  
  const rooms = socketManager.getGameRooms(game.gamePin);
  io.to(rooms.moderators).emit('live_stats', {
    answeredCount: game.answers.length,
    totalPlayers: game.getConnectedPlayerCount(),
    answerStats: stats
  });
}


// Helper function to calculate answer statistics
function calculateAnswerStats(answers, optionCount) {
  const stats = Array(optionCount).fill(0);
  answers.forEach(answer => {
    if (answer.answer >= 0 && answer.answer < optionCount) {
      stats[answer.answer]++;
    }
  });
  
  const total = answers.length;
  return stats.map(count => ({
    count: count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));
}

// Periodic database sync
setInterval(async () => {
  for (const [gamePin, game] of activeGames.entries()) {
    if (Date.now() - game.lastSync > 30000) { // Sync every 30 seconds
      await game.syncToDatabase(db);
    }
  }
}, 30000);

// Cleanup old games every hour
setInterval(async () => {
  try {
    await db.cleanupOldGames();
    console.log('Old games cleanup completed');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60 * 60 * 1000);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close the HTTP server
    server.close(() => {
      console.log('HTTP server closed');
    });
    
    // Close socket.io connections
    io.close(() => {
      console.log('Socket.io connections closed');
    });
    
    // Sync all active games to database
    for (const [gamePin, game] of activeGames.entries()) {
      await game.syncToDatabase(db);
    }
    
    // Shutdown memory manager
    memoryManager.shutdown();
    
    // Close database connection
    db.close();
    console.log('Database connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle various shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server only if this is the main module
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Quiz server running on http://localhost:${PORT}`);
    console.log(`Player app: http://localhost:${PORT}/`);
    console.log(`Moderator: http://localhost:${PORT}/moderator`);
    console.log(`Panel: http://localhost:${PORT}/panel`);
  });
}

// Export for testing
module.exports = app;

