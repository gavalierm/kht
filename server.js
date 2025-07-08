const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const GameDatabase = require('./database');
const { GameInstance } = require('./lib/gameInstance');
const { generateGamePin } = require('./lib/gameUtils');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize database
const db = new GameDatabase();

// Middleware
app.use(express.json());

// Static files for each app
app.use('/app', express.static(path.join(__dirname, 'public/game')));
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));
app.use('/panel', express.static(path.join(__dirname, 'public/panel')));
app.use('/stage', express.static(path.join(__dirname, 'public/stage')));
app.use('/shared', express.static(path.join(__dirname, 'public/shared')));

// Global variables
const activeGames = new Map(); // gamePin -> GameInstance (in-memory for performance)
const playerLatencies = new Map(); // socketId -> latency
const socketToPlayer = new Map(); // socketId -> {gamePin, playerId, playerToken}
const socketToModerator = new Map(); // socketId -> {gamePin, gameId}

// GameInstance class moved to ./lib/gameInstance.js

// Helper functions moved to ./lib/gameUtils.js

// Routes
app.get('/', (req, res) => {
  res.redirect('/app');
});

// Player app routes (SPA)
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/game/game.html'));
});

app.get('/app/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/game/game.html'));
});

// App game page (after joining with PIN)
app.get('/app/:pin/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/game/game.html'));
});

// App panel page (fullscreen display for venues)
app.get('/app/:pin/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/panel/panel.html'));
});

// App stage page (post-game leaderboard)
app.get('/app/:pin/stage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/stage/stage.html'));
});

// App dashboard page (moderator control panel)
app.get('/app/:pin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/dashboard.html'));
});

// Dashboard routes (legacy - will be phased out)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/dashboard.html'));
});

app.get('/dashboard/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/dashboard.html'));
});

// Panel routes
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/panel/panel.html'));
});

app.get('/panel/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/panel/panel.html'));
});

// Favicon fallback
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// API route for game recovery
app.get('/api/game/:pin', async (req, res) => {
  try {
    const gameData = await db.getGameByPin(req.params.pin);
    if (!gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
      pin: gameData.pin,
      title: gameData.title,
      status: gameData.status,
      currentQuestionIndex: gameData.current_question_index,
      questionCount: gameData.questions.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Question template API endpoints
app.get('/api/question-templates', async (req, res) => {
  try {
    const templates = await db.getQuestionTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching question templates:', error);
    res.status(500).json({ error: 'Failed to fetch question templates' });
  }
});

app.get('/api/question-templates/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const template = await db.getQuestionTemplate(category);
    
    if (!template) {
      return res.status(404).json({ error: 'Question template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error fetching question template:', error);
    res.status(500).json({ error: 'Failed to fetch question template' });
  }
});

app.post('/api/question-templates', async (req, res) => {
  try {
    const { category, title, questions } = req.body;
    
    if (!category || !title || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing required fields: category, title, questions' });
    }
    
    // Validate questions structure
    const isValidQuestions = questions.every(q => 
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
    
    if (!isValidQuestions) {
      return res.status(400).json({ error: 'Invalid question format' });
    }
    
    const templateId = await db.createQuestionTemplate(category, title, questions);
    res.json({ id: templateId, category, title, questions });
  } catch (error) {
    console.error('Error creating question template:', error);
    if (error.code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({ error: 'Category already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create question template' });
    }
  }
});

app.put('/api/question-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, questions } = req.body;
    
    if (!title || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing required fields: title, questions' });
    }
    
    // Validate questions structure
    const isValidQuestions = questions.every(q => 
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
    
    if (!isValidQuestions) {
      return res.status(400).json({ error: 'Invalid question format' });
    }
    
    const updated = await db.updateQuestionTemplate(id, title, questions);
    
    if (!updated) {
      return res.status(404).json({ error: 'Question template not found' });
    }
    
    res.json({ message: 'Question template updated successfully' });
  } catch (error) {
    console.error('Error updating question template:', error);
    res.status(500).json({ error: 'Failed to update question template' });
  }
});

app.delete('/api/question-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.deleteQuestionTemplate(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Question template not found' });
    }
    
    res.json({ message: 'Question template deleted successfully' });
  } catch (error) {
    console.error('Error deleting question template:', error);
    res.status(500).json({ error: 'Failed to delete question template' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Latency measurement
  socket.on('latency_pong', (timestamp) => {
    const latency = Date.now() - timestamp;
    playerLatencies.set(socket.id, latency);
  });

  // Start latency measurement loop
  const latencyInterval = setInterval(() => {
    socket.emit('latency_ping', Date.now());
  }, 10000);

  // Dashboard: Create new game
  socket.on('create_game', async (data) => {
    try {
      const gamePin = generateGamePin(data.customPin, activeGames);
      
      if (!gamePin) {
        socket.emit('create_game_error', { 
          message: 'PIN kód už existuje, vyberte iný' 
        });
        return;
      }
      
      // Get question template from database instead of loading from JSON
      const questionTemplate = await db.getQuestionTemplate(data.category || 'general');
      
      if (!questionTemplate) {
        socket.emit('create_game_error', { 
          message: `Šablóna otázok pre kategóriu "${data.category || 'general'}" neexistuje` 
        });
        return;
      }
      
      // Save to database
      const dbResult = await db.createGame(
        gamePin, 
        questionTemplate.title, 
        questionTemplate.questions,
        data.moderatorPassword
      );
      
      // Create in-memory game instance
      const game = new GameInstance(gamePin, questionTemplate.questions, dbResult.gameId);
      game.moderatorSocket = socket.id;
      activeGames.set(gamePin, game);
      
      // Store moderator info
      socketToModerator.set(socket.id, {
        gamePin: gamePin,
        gameId: dbResult.gameId,
        moderatorToken: dbResult.moderatorToken
      });
      
      socket.join(`game_${gamePin}_moderator`);
      socket.emit('game_created', {
        gamePin: gamePin,
        title: questionTemplate.title,
        questionCount: questionTemplate.questions.length,
        moderatorToken: dbResult.moderatorToken
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
      console.log(`Moderator reconnect attempt for game: ${data.gamePin}`);
      console.log(`Data received:`, { gamePin: data.gamePin, hasPassword: !!data.password, hasToken: !!data.moderatorToken });

      // Check if moderator is already connected to prevent duplicates
      const existingModeratorInfo = socketToModerator.get(socket.id);
      if (existingModeratorInfo && existingModeratorInfo.gamePin === data.gamePin) {
        console.log(`Moderator ${socket.id} already connected to game ${data.gamePin}`);
        return;
      }

      const gameData = await db.validateModerator(data.gamePin, data.password, data.moderatorToken);
      
      if (!gameData) {
        console.log(`Moderator validation failed for game: ${data.gamePin}`);
        socket.emit('moderator_reconnect_error', { 
          message: 'Neplatné prihlásenie moderátora alebo hra neexistuje' 
        });
        return;
      }

      console.log(`Moderator validation successful for game: ${data.gamePin}`);

      // Check if game exists in memory
      let game = activeGames.get(data.gamePin);
      if (!game) {
        console.log(`Restoring game ${data.gamePin} from database`);
        // Restore game from database
        const players = await db.getGamePlayers(gameData.id);
        game = new GameInstance(data.gamePin, gameData.questions, gameData.id);
        game.phase = gameData.status.toUpperCase();
        game.currentQuestionIndex = gameData.current_question_index;
        game.questionStartTime = gameData.question_start_time;
        
        // Restore players
        players.forEach(playerData => {
          game.addPlayer(playerData.id, playerData);
        });
        
        activeGames.set(data.gamePin, game);
        console.log(`Game ${data.gamePin} restored with ${players.length} players`);
      }
      
      // Remove any existing moderator connection for this game
      for (const [existingSocketId, info] of socketToModerator.entries()) {
        if (info.gamePin === data.gamePin) {
          socketToModerator.delete(existingSocketId);
          console.log(`Removed old moderator socket connection for game ${data.gamePin}`);
        }
      }
      
      game.moderatorSocket = socket.id;
      socketToModerator.set(socket.id, {
        gamePin: data.gamePin,
        gameId: gameData.id,
        moderatorToken: gameData.moderator_token
      });
      
      socket.join(`game_${data.gamePin}_moderator`);
      
      // Send current state to moderator
      const players = await db.getGamePlayers(gameData.id);
      const connectedPlayers = players.filter(p => p.connected);
      
      socket.emit('moderator_reconnected', {
        gamePin: data.gamePin,
        title: gameData.title,
        questionCount: gameData.questions.length,
        currentQuestionIndex: gameData.current_question_index,
        status: gameData.status,
        players: connectedPlayers.map(p => p.name),
        totalPlayers: connectedPlayers.length,
        moderatorToken: gameData.moderator_token
      });
      
      console.log(`Moderator successfully reconnected to game ${data.gamePin} with ${connectedPlayers.length} players`);
      
    } catch (error) {
      console.error('Moderator reconnect error:', error);
      socket.emit('moderator_reconnect_error', { 
        message: 'Chyba pri pripájaní moderátora' 
      });
    }
  });

  // Dashboard: Start question
  socket.on('start_question', async (data) => {
    const game = activeGames.get(data.gamePin);
    if (!game || game.moderatorSocket !== socket.id) return;
    
    // Check if there are any players connected
    const connectedPlayers = Array.from(game.players.values()).filter(p => p.connected);
    if (connectedPlayers.length === 0) {
      socket.emit('start_question_error', { 
        message: 'Nemôžete spustiť otázku bez pripojených hráčov' 
      });
      return;
    }
    
    const question = game.getCurrentQuestion();
    if (!question) return;
    
    game.phase = 'QUESTION_ACTIVE';
    game.questionStartTime = Date.now();
    game.answers = [];
    
    const questionData = {
      questionNumber: game.currentQuestionIndex + 1,
      totalQuestions: game.questions.length,
      question: question.question,
      options: question.options,
      timeLimit: question.timeLimit || 30,
      serverTime: game.questionStartTime
    };
    
    // Send to all players
    socket.to(`game_${data.gamePin}`).emit('question_started', questionData);
    
    // Send to dashboard
    socket.emit('question_started_dashboard', {
      ...questionData,
      correctAnswer: question.correct
    });
    
    // Send to panels
    io.to(`game_${data.gamePin}_panel`).emit('panel_question_started', questionData);
    
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

  // Player: Join game
  socket.on('join_game', async (data) => {
    try {
      const gameData = await db.getGameByPin(data.gamePin);
      if (!gameData) {
        socket.emit('join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
        return;
      }

      // Check if game exists in memory, if not restore it
      let game = activeGames.get(data.gamePin);
      if (!game) {
        const players = await db.getGamePlayers(gameData.id);
        game = new GameInstance(data.gamePin, gameData.questions, gameData.id);
        game.phase = gameData.status.toUpperCase();
        game.currentQuestionIndex = gameData.current_question_index;
      
        // Restore players
        players.forEach(playerData => {
          game.addPlayer(playerData.id, playerData);
        });
      
        activeGames.set(data.gamePin, game);
      }

      if (game.phase !== 'WAITING' && game.phase !== 'RESULTS') {
        socket.emit('join_error', { message: 'Hra už prebieha, nemôžete sa pripojiť' });
        return;
      }
    
      // Add player to database - no name needed
      const playerResult = await db.addPlayer(gameData.id);
    
      // Add to in-memory game
      game.addPlayer(playerResult.playerId, {
        name: `Player ${playerResult.playerId}`,
        player_token: playerResult.playerToken,
        score: 0
      });
    
      const player = game.players.get(playerResult.playerId);
      player.socketId = socket.id;
    
      // Store player info
      socketToPlayer.set(socket.id, {
        gamePin: data.gamePin,
        playerId: playerResult.playerId,
        playerToken: playerResult.playerToken
      });
    
      socket.join(`game_${data.gamePin}`);
    
      socket.emit('game_joined', {
        gamePin: data.gamePin,
        playerId: playerResult.playerId,
        playersCount: Array.from(game.players.values()).filter(p => p.connected).length,
        playerToken: playerResult.playerToken
      });
    
      // Update dashboard with new player count
      if (game.moderatorSocket) {
        const connectedPlayers = Array.from(game.players.values()).filter(p => p.connected);
        io.to(game.moderatorSocket).emit('player_joined', {
          playerId: playerResult.playerId,
          totalPlayers: connectedPlayers.length,
          players: connectedPlayers.map(p => ({ id: p.id, name: p.name }))
        });
      }
    
      // Update panel leaderboard
      updatePanelLeaderboard(game);
    
      console.log(`Player ${playerResult.playerId} joined game ${data.gamePin}`);
    
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
        
        players.forEach(p => {
          game.addPlayer(p.id, p);
        });
        
        activeGames.set(data.gamePin, game);
      }

      // Update player in memory
      if (game.players.has(playerData.id)) {
        const player = game.players.get(playerData.id);
        player.socketId = socket.id;
        player.connected = true;
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

      socket.join(`game_${data.gamePin}`);

      socket.emit('player_reconnected', {
        gamePin: data.gamePin,
        playerId: playerData.id,
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
      const points = game.calculateScore(answerData.responseTime, isCorrect);
      
      // Update player score in memory
      const player = game.players.get(playerInfo.playerId);
      if (player) {
        player.score += points;
        
        // Update score in database
        await db.updatePlayerScore(playerInfo.playerId, player.score);
      }

      // Save answer to database
      await db.saveAnswer(
        game.dbId,
        playerInfo.playerId,
        game.currentQuestionIndex,
        data.answer,
        isCorrect,
        points,
        answerData.responseTime
      );
      
      // Send result to player
      socket.emit('answer_result', {
        correct: isCorrect,
        correctAnswer: question.correct,
        points: points,
        totalScore: player ? player.score : 0,
        responseTime: answerData.responseTime
      });
      
      // Update dashboard and panel
      updateDashboardStats(game);
      updatePanelLeaderboard(game);
      
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
      
      socket.join(`game_${data.gamePin}_panel`);
      
      // Send current game state to panel
      socket.emit('panel_game_joined', {
        gamePin: data.gamePin,
        title: gameData.title,
        questionCount: gameData.questions.length,
        currentState: gameData.status
      });
      
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
            name: player.name,
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
        // Only mark as disconnected, don't remove from database
        const game = activeGames.get(playerInfo.gamePin);
        if (game && game.players.has(playerInfo.playerId)) {
          const player = game.players.get(playerInfo.playerId);
          player.connected = false;
          player.socketId = null;
          
          // Update dashboard
          if (game.moderatorSocket) {
            const connectedPlayers = Array.from(game.players.values()).filter(p => p.connected);
            io.to(game.moderatorSocket).emit('player_left', {
              totalPlayers: connectedPlayers.length
            });
          }
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
    totalPlayers: Array.from(game.players.values()).filter(p => p.connected).length
  };
  
  // Send to all players
  io.to(`game_${game.gamePin}`).emit('question_ended', resultsData);
  
  // Send to dashboard
  if (game.moderatorSocket) {
    io.to(game.moderatorSocket).emit('question_ended_dashboard', {
      ...resultsData,
      canContinue: game.currentQuestionIndex < game.questions.length - 1
    });
  }
  
  // Send to panels
  io.to(`game_${game.gamePin}_panel`).emit('panel_question_ended', resultsData);
  
  // Sync to database
  await game.syncToDatabase();
  
  console.log(`Question ended in game ${game.gamePin}`);
}

// Helper function to update dashboard stats
function updateDashboardStats(game) {
  if (!game.moderatorSocket) return;
  
  const question = game.getCurrentQuestion();
  const stats = calculateAnswerStats(game.answers, question.options.length);
  
  io.to(game.moderatorSocket).emit('live_stats', {
    answeredCount: game.answers.length,
    totalPlayers: Array.from(game.players.values()).filter(p => p.connected).length,
    answerStats: stats
  });
}

// Helper function to update panel leaderboard
function updatePanelLeaderboard(game) {
  const leaderboard = game.getLeaderboard();
  
  io.to(`game_${game.gamePin}_panel`).emit('panel_leaderboard_update', {
    leaderboard: leaderboard.slice(0, 10)
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server running on http://localhost:${PORT}`);
  console.log(`Player app: http://localhost:${PORT}/app`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Panel: http://localhost:${PORT}/panel`);
});// Force restart

