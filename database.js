const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class GameDatabase {
  constructor(dbPath = './db/quiz.db', options = {}) {
    // Create db directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 134217728'); // 128MB
    this.db.pragma('foreign_keys = ON');
    
    this.skipTestGame = options.skipTestGame || process.env.NODE_ENV === 'test';
    this.initialized = false;
    this.initTables();
    
    // Prepare commonly used statements for better performance (after tables are created)
    this.stmts = {
      getGameByPin: this.db.prepare('SELECT * FROM games WHERE pin = ?'),
      getQuestions: this.db.prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY question_order'),
      getGamePlayers: this.db.prepare('SELECT * FROM players WHERE game_id = ? ORDER BY joined_at ASC'),
      updatePlayerScore: this.db.prepare('UPDATE players SET score = ?, last_seen = strftime(\'%s\', \'now\') WHERE id = ?'),
      disconnectPlayer: this.db.prepare('UPDATE players SET connected = false, last_seen = strftime(\'%s\', \'now\') WHERE id = ?'),
      updateGameState: this.db.prepare('UPDATE games SET status = ?, current_question_index = ?, question_start_time = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?')
    };
    
    // Create test game if it doesn't exist and not in test mode
    if (!this.skipTestGame) {
      this.createTestGame();
    }
  }

  initTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin TEXT UNIQUE NOT NULL,
        moderator_password_hash TEXT,
        moderator_token TEXT UNIQUE,
        status TEXT DEFAULT 'waiting',
        current_question_index INTEGER DEFAULT 0,
        question_start_time INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL, 
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option INTEGER NOT NULL CHECK (correct_option >= 0 AND correct_option <= 3),
        time_limit INTEGER NOT NULL DEFAULT 30,
        question_order INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        player_token TEXT UNIQUE,
        score INTEGER DEFAULT 0,
        socket_id TEXT,
        connected BOOLEAN DEFAULT true,
        joined_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_seen INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        selected_option INTEGER NOT NULL CHECK (selected_option >= 0 AND selected_option <= 3),
        is_correct BOOLEAN NOT NULL,
        points_earned INTEGER DEFAULT 0,
        response_time INTEGER,
        answered_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
        UNIQUE(question_id, player_id)
      );

      CREATE INDEX IF NOT EXISTS idx_games_pin ON games(pin);
      CREATE INDEX IF NOT EXISTS idx_players_token ON players(player_token);
      CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
      CREATE INDEX IF NOT EXISTS idx_questions_game ON questions(game_id);
      CREATE INDEX IF NOT EXISTS idx_questions_order ON questions(game_id, question_order);
      CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
      CREATE INDEX IF NOT EXISTS idx_answers_player ON answers(player_id);
    `;
    
    try {
      this.db.exec(sql);
      console.log('Database initialized successfully');
      this.initialized = true;
    } catch (err) {
      console.error('Database init error:', err);
      throw err;
    }
  }

  // Method to wait for initialization completion
  waitForInitialization() {
    // With better-sqlite3, initialization is synchronous
    return this.initialized;
  }

  // Create test game with PIN 123456
  createTestGame() {
    try {
      // Check if test game already exists
      const existingGame = this.getGameByPin('123456');
      if (existingGame) {
        console.log('Test game with PIN 123456 already exists');
        return;
      }

      // Test questions
      const testQuestions = [
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
        },
        {
          id: 3,
          question: "Ktorá rieka preteká cez Bratislavu?",
          options: ["Váh", "Hron", "Dunaj", "Morava"],
          correct: 2,
          timeLimit: 20
        },
        {
          id: 4,
          question: "Ktorý je najvyšší vrch Slovenska?",
          options: ["Kriváň", "Gerlachovský štít", "Rysy", "Ďumbier"],
          correct: 1,
          timeLimit: 25
        },
        {
          id: 5,
          question: "V ktorom roku vznikla Slovenská republika?",
          options: ["1991", "1992", "1993", "1994"],
          correct: 2,
          timeLimit: 20
        }
      ];

      // Create test game with default password same as PIN
      const result = this.createGame(
        '123456',
        testQuestions,
        '123456' // default password same as PIN
      );

      console.log('Test game created successfully with PIN: 123456');
      
    } catch (error) {
      console.error('Error creating test game:', error);
    }
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create new game
  createGame(pin, questions, moderatorPassword = null) {
    // Validate inputs
    if (!pin) {
      throw new Error('PIN is required');
    }
    
    if (!questions || !Array.isArray(questions)) {
      throw new Error('Questions must be an array');
    }
    
    const passwordHash = moderatorPassword ? bcrypt.hashSync(String(moderatorPassword), 10) : null;
    const moderatorToken = this.generateToken();

    // Use transaction for data consistency
    const transaction = this.db.transaction(() => {
      // First, create the game record
      const gameSQL = `
        INSERT INTO games (pin, moderator_password_hash, moderator_token)
        VALUES (?, ?, ?)
      `;

      const gameResult = this.db.prepare(gameSQL).run(pin, passwordHash, moderatorToken);
      const gameId = gameResult.lastInsertRowid;

      // Then, insert all questions for this game
      if (questions.length > 0) {
        const questionSQL = `
          INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit, question_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const stmt = this.db.prepare(questionSQL);
        
        questions.forEach((question, index) => {
          stmt.run(
            gameId,
            question.question,
            question.options[0],
            question.options[1], 
            question.options[2],
            question.options[3],
            question.correct,
            question.timeLimit || 30,
            index + 1
          );
        });
      }

      return {
        gameId,
        moderatorToken,
        pin
      };
    });

    return transaction();
  }

  // Get game by PIN
  getGameByPin(pin) {
    const gameRow = this.stmts.getGameByPin.get(pin);
    
    if (!gameRow) {
      return null;
    }

    // Get questions for this game
    const questionRows = this.stmts.getQuestions.all(gameRow.id);
    
    // Convert questions to the format expected by the application
    gameRow.questions = questionRows.map(q => ({
      id: q.id,
      question: q.question_text,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      correct: q.correct_option,
      timeLimit: q.time_limit
    }));
    
    return gameRow;
  }

  // Validate moderator
  validateModerator(pin, password, token) {
    const row = this.stmts.getGameByPin.get(pin);
    
    if (!row) {
      return false;
    }
    
    // Helper function to add questions to game row
    const addQuestions = (gameRow) => {
      const questionRows = this.stmts.getQuestions.all(gameRow.id);
      gameRow.questions = questionRows.map(q => ({
        id: q.id,
        question: q.question_text,
        options: [q.option_a, q.option_b, q.option_c, q.option_d],
        correct: q.correct_option,
        timeLimit: q.time_limit
      }));
      return gameRow;
    };
    
    // Check token first (for reconnection)
    if (token && row.moderator_token === token) {
      return addQuestions(row);
    }
    
    // Check password
    if (password && row.moderator_password_hash && 
        bcrypt.compareSync(password, row.moderator_password_hash)) {
      return addQuestions(row);
    }
    
    // If no password protection, allow connection
    if (!row.moderator_password_hash && !password) {
      return addQuestions(row);
    }
    
    return false;
  }

  // Add player without name
  addPlayer(gameId) {
    // Validate inputs
    if (!gameId) {
      throw new Error('Game ID is required');
    }

    // Check database connection
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    // Generate player token
    const playerToken = this.generateToken();
    
    // Use transaction for atomic operations
    const transaction = this.db.transaction(() => {
      // Insert player with auto-generated ID
      const sql = `
        INSERT INTO players (game_id, name, player_token)
        VALUES (?, ?, ?)
      `;
      
      const result = this.db.prepare(sql).run(gameId, 'Hráč', playerToken);
      const playerId = result.lastInsertRowid;
      
      if (!playerId) {
        throw new Error('Failed to get player ID after insertion');
      }
      
      // Update name to include ID
      const updateSql = `UPDATE players SET name = ? WHERE id = ?`;
      this.db.prepare(updateSql).run(`Hráč ${playerId}`, playerId);
      
      return {
        playerId: playerId,
        playerToken,
        name: `Hráč ${playerId}`
      };
    });

    return transaction();
  }

  // Reconnect player
  reconnectPlayer(gameId, playerToken) {
    const sql = `
      UPDATE players 
      SET connected = true, last_seen = strftime('%s', 'now')
      WHERE game_id = ? AND player_token = ?
    `;

    this.db.prepare(sql).run(gameId, playerToken);
    
    // Get updated player data
    const player = this.db.prepare(
      'SELECT * FROM players WHERE game_id = ? AND player_token = ?'
    ).get(gameId, playerToken);
    
    return player || null;
  }

  // Get game players
  getGamePlayers(gameId) {
    if (gameId === null || gameId === undefined) {
      throw new Error('Game ID is required');
    }
    return this.stmts.getGamePlayers.all(gameId);
  }

  // Update game state
  updateGameState(gameId, state) {
    this.stmts.updateGameState.run(state.status, state.currentQuestionIndex, state.questionStartTime, gameId);
  }

  // Update player score
  updatePlayerScore(playerId, score) {
    if (playerId === null || playerId === undefined) {
      throw new Error('Player ID is required');
    }
    this.stmts.updatePlayerScore.run(score, playerId);
  }

  // Get question ID by game ID and question order
  getQuestionId(gameId, questionOrder) {
    const sql = `
      SELECT id FROM questions 
      WHERE game_id = ? AND question_order = ?
    `;

    const row = this.db.prepare(sql).get(gameId, questionOrder);
    return row ? row.id : null;
  }

  // Save answer
  saveAnswer(gameId, playerId, questionIndex, answer, isCorrect, points, responseTime) {
    // Validate input parameters
    if (!Number.isFinite(responseTime) || responseTime < 0) {
      console.warn(`Invalid responseTime for player ${playerId}: ${responseTime}, setting to 0`);
      responseTime = 0;
    }
    
    // Get the question ID based on game and question order (questionIndex + 1)
    const questionId = this.getQuestionId(gameId, questionIndex + 1);
    
    if (!questionId) {
      throw new Error(`Question not found for game ${gameId} at index ${questionIndex}`);
    }

    // Check if answer already exists for this player and question
    const checkSql = `
      SELECT id FROM answers 
      WHERE question_id = ? AND player_id = ?
    `;

    const existingAnswer = this.db.prepare(checkSql).get(questionId, playerId);
    
    if (existingAnswer) {
      // Answer already exists, return existing ID
      console.log(`Answer already exists for player ${playerId} on question ${questionId}`);
      return existingAnswer.id;
    }

    // Insert new answer
    const insertSql = `
      INSERT INTO answers (question_id, player_id, selected_option, is_correct, points_earned, response_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(insertSql).run(questionId, playerId, answer, isCorrect ? 1 : 0, points, responseTime);
    return result.lastInsertRowid;
  }

  // Disconnect player
  disconnectPlayer(playerId) {
    this.stmts.disconnectPlayer.run(playerId);
  }

  // Remove all players from a game
  removeAllPlayersFromGame(gameId) {
    const sql = `DELETE FROM players WHERE game_id = ?`;
    const result = this.db.prepare(sql).run(gameId);
    console.log(`Removed ${result.changes} players from game ${gameId}`);
    return result.changes;
  }

  // Cleanup old games (older than 24 hours)
  cleanupOldGames() {
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
    
    // Delete old games and related data in a transaction
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE game_id IN (SELECT id FROM games WHERE created_at < ?))').run(oneDayAgo);
      this.db.prepare('DELETE FROM players WHERE game_id IN (SELECT id FROM games WHERE created_at < ?)').run(oneDayAgo);
      this.db.prepare('DELETE FROM questions WHERE game_id IN (SELECT id FROM games WHERE created_at < ?)').run(oneDayAgo);
      const result = this.db.prepare('DELETE FROM games WHERE created_at < ?').run(oneDayAgo);
      return result.changes;
    });
    
    const changes = transaction();
    console.log(`Cleaned up ${changes} old games`);
    return changes;
  }

  // Get game statistics
  getGameStats(gameId) {
    const sql = `
      SELECT 
        COUNT(DISTINCT p.id) as total_players,
        COUNT(DISTINCT a.id) as total_answers,
        AVG(a.response_time) as avg_response_time,
        SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers
      FROM games g
      LEFT JOIN players p ON g.id = p.game_id
      LEFT JOIN questions q ON g.id = q.game_id
      LEFT JOIN answers a ON q.id = a.question_id AND p.id = a.player_id
      WHERE g.id = ?
    `;

    return this.db.prepare(sql).get(gameId);
  }

  // Get default questions for all games
  getDefaultQuestions() {
    return [
      {
        id: 1,
        question: "Aké je hlavné mesto Slovenska?",
        options: ["Bratislava", "Košice", "Praha", "Viedeň"],
        correct: 0,
        timeLimit: 30
      },
      {
        id: 2,
        question: "Koľko kontinentov má Zem?",
        options: ["5", "6", "7", "8"],
        correct: 2,
        timeLimit: 25
      },
      {
        id: 3,
        question: "Aký je najvyšší vrch na Slovensku?",
        options: ["Gerlachovský štít", "Lomnický štít", "Kriváň", "Rysy"],
        correct: 0,
        timeLimit: 30
      },
      {
        id: 4,
        question: "V ktorom roku vznikla Slovenská republika?",
        options: ["1993", "1989", "1991", "1995"],
        correct: 0,
        timeLimit: 30
      },
      {
        id: 5,
        question: "Aký je najdlhší slovenský river?",
        options: ["Dunaj", "Váh", "Hron", "Nitra"],
        correct: 1,
        timeLimit: 30
      },
      {
        id: 6,
        question: "Ktorá planeta je najbližšie k Slnku?",
        options: ["Venuša", "Merkúr", "Zem", "Mars"],
        correct: 1,
        timeLimit: 25
      },
      {
        id: 7,
        question: "Aké je chemické označenie pre vodu?",
        options: ["CO2", "H2O", "NaCl", "O2"],
        correct: 1,
        timeLimit: 20
      },
      {
        id: 8,
        question: "Koľko strán má trojuholník?",
        options: ["2", "3", "4", "5"],
        correct: 1,
        timeLimit: 15
      },
      {
        id: 9,
        question: "Aký je najväčší oceán na svete?",
        options: ["Atlantický", "Indický", "Tichý", "Severný ľadový"],
        correct: 2,
        timeLimit: 25
      },
      {
        id: 10,
        question: "Kto napísal hru Romeo a Júlia?",
        options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
        correct: 1,
        timeLimit: 30
      }
    ];
  }

  // Update questions for an existing game
  updateGameQuestions(gameId, questions) {
    const transaction = this.db.transaction(() => {
      // Delete existing questions for this game (answers will cascade delete)
      this.db.prepare('DELETE FROM questions WHERE game_id = ?').run(gameId);
      
      // Insert new questions
      if (questions.length > 0) {
        const questionSQL = `
          INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit, question_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const stmt = this.db.prepare(questionSQL);
        
        questions.forEach((question, index) => {
          const timeLimit = question.timeLimit || 30;
          const questionOrder = index + 1;
          
          stmt.run(
            gameId,
            question.question,
            question.options[0],
            question.options[1], 
            question.options[2],
            question.options[3],
            question.correct,
            timeLimit,
            questionOrder
          );
        });
      }
    });
    
    transaction();
  }


  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = GameDatabase;