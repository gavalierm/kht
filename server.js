const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const GameDatabase = require('./database');

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

// Enhanced Game class with database integration
class GameInstance {
  constructor(gamePin, questions, dbId = null) {
    this.gamePin = gamePin;
    this.questions = questions;
    this.dbId = dbId;
    this.players = new Map(); // playerId -> {id, name, score, socketId, token, connected}
    this.answers = []; // current question answers
    this.phase = 'WAITING'; // WAITING, QUESTION_ACTIVE, RESULTS, FINISHED
    this.currentQuestionIndex = 0;
    this.questionStartTime = null;
    this.moderatorSocket = null;
    this.timeLimit = 30;
    this.lastSync = Date.now();
  }

  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
      id: playerId,
      name: playerData.name,
      score: playerData.score || 0,
      socketId: null,
      token: playerData.player_token,
      connected: true
    });
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      // Don't delete from memory, just mark as disconnected
    }
  }

  getCurrentQuestion() {
    return this.questions[this.currentQuestionIndex] || null;
  }

  submitAnswer(playerId, answer) {
    const serverTime = Date.now();
    const player = this.players.get(playerId);
    if (!player) return null;
    
    const playerLatency = playerLatencies.get(player.socketId) || 0;
    
    // Time compensation and bucketing
    const compensatedTime = serverTime - (playerLatency / 2);
    const bucketedTime = Math.floor(compensatedTime / 50) * 50;
    
    const answerData = {
      playerId: playerId,
      answer: answer,
      timestamp: bucketedTime,
      responseTime: bucketedTime - this.questionStartTime
    };
    
    // Check if player already answered
    const existingAnswer = this.answers.find(a => a.playerId === playerId);
    if (!existingAnswer) {
      this.answers.push(answerData);
    }
    
    return answerData;
  }

  calculateScore(responseTime, isCorrect) {
    if (!isCorrect) return 0;
    
    const baseScore = 1000;
    const maxSpeedBonus = 500;
    const speedBonus = Math.max(0, maxSpeedBonus - (responseTime / this.timeLimit * maxSpeedBonus));
    
    return Math.round(baseScore + speedBonus);
  }

  getLeaderboard() {
    return Array.from(this.players.values())
      .filter(p => p.connected)
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        score: player.score,
        playerId: player.id
      }));
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    this.answers = [];
    this.questionStartTime = null;
    
    if (this.currentQuestionIndex >= this.questions.length) {
      this.phase = 'FINISHED';
      return false;
    }
    
    this.phase = 'WAITING';
    return true;
  }

  // Get state for database sync
  getState() {
    return {
      status: this.phase.toLowerCase(),
      currentQuestionIndex: this.currentQuestionIndex,
      questionStartTime: this.questionStartTime
    };
  }

  // Sync to database
  async syncToDatabase() {
    if (this.dbId) {
      try {
        await db.updateGameState(this.dbId, this.getState());
        this.lastSync = Date.now();
      } catch (error) {
        console.error('Failed to sync game to database:', error);
      }
    }
  }
}

// Helper functions
function generateGamePin(customPin = null) {
  if (customPin) {
    // Check if custom PIN is already used
    if (activeGames.has(customPin)) {
      return null; // PIN already exists
    }
    return customPin;
  }
  
  // Generate random 6-digit PIN
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (activeGames.has(pin));
  return pin;
}

function loadQuestions(category = 'general') {
  try {
    const questionsPath = path.join(__dirname, 'questions', `${category}.json`);
    const data = fs.readFileSync(questionsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading questions:', error);
    // Fallback questions
    return {
      quiz: {
        title: "Testovacé otázky",
        questions: [
          {
            id: 1,
            question: "Aké je hlavné mesto Slovenska?",
            options: ["Bratislava", "Košice", "Prešov", "Žilina"],
            correct: 0,
            timeLimit: 30
          },
          {
            id: 2,
            question: "Koľko kontinentov má Zem?",
            options: ["5", "6", "7", "8"],
            correct: 2,
            timeLimit: 25
          }
        ]
      }
    };
  }
}

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
      const gamePin = generateGamePin(data.customPin);
      
      if (!gamePin) {
        socket.emit('create_game_error', { 
          message: 'PIN kód už existuje, vyberte iný' 
        });
        return;
      }
      
      const questionsData = loadQuestions(data.category || 'general');
      
      // Save to database
      const dbResult = await db.createGame(
        gamePin, 
        questionsData.quiz.title, 
        questionsData.quiz.questions,
        data.moderatorPassword
      );
      
      // Create in-memory game instance
      const game = new GameInstance(gamePin, questionsData.quiz.questions, dbResult.gameId);
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
        title: questionsData.quiz.title,
        questionCount: questionsData.quiz.questions.length,
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
    await game.syncToDatabase();
    
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
      
      const answerData = game.submitAnswer(playerInfo.playerId, data.answer);
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
      await game.syncToDatabase();
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
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  // Sync all active games to database
  for (const [gamePin, game] of activeGames.entries()) {
    await game.syncToDatabase();
  }
  
  db.close();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server running on http://localhost:${PORT}`);
  console.log(`Player app: http://localhost:${PORT}/app`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Panel: http://localhost:${PORT}/panel`);
});