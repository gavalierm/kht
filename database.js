const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class GameDatabase {
  constructor(dbPath = './quiz.db', options = {}) {
    this.db = new sqlite3.Database(dbPath);
    this.skipTestGame = options.skipTestGame || process.env.NODE_ENV === 'test';
    this.initTables();
  }

  initTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        moderator_password_hash TEXT,
        moderator_token TEXT UNIQUE,
        status TEXT DEFAULT 'waiting',
        current_question_index INTEGER DEFAULT 0,
        question_start_time INTEGER,
        questions_data TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER,
        name TEXT NOT NULL,
        player_token TEXT UNIQUE,
        score INTEGER DEFAULT 0,
        socket_id TEXT,
        connected BOOLEAN DEFAULT true,
        joined_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_seen INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (game_id) REFERENCES games (id)
      );

      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER,
        player_id INTEGER,
        question_index INTEGER,
        answer INTEGER,
        is_correct BOOLEAN,
        points_earned INTEGER,
        response_time INTEGER,
        answered_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (game_id) REFERENCES games (id),
        FOREIGN KEY (player_id) REFERENCES players (id)
      );

      CREATE INDEX IF NOT EXISTS idx_games_pin ON games(pin);
      CREATE INDEX IF NOT EXISTS idx_players_token ON players(player_token);
      CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
    `;
    
    this.db.exec(sql, (err) => {
      if (err) {
        console.error('Database init error:', err);
      } else {
        console.log('Database initialized successfully');
        // Create test game if it doesn't exist and not in test mode
        if (!this.skipTestGame) {
          this.createTestGame();
        }
      }
    });
  }

  // Create test game with PIN 123456
  async createTestGame() {
    try {
      // Check if test game already exists
      const existingGame = await this.getGameByPin('123456');
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

      // Create test game with no password
      const result = await this.createGame(
        '123456',
        'Testovacia hra',
        testQuestions,
        null // no password
      );

      console.log('Test game created successfully with PIN: 123456');
      console.log('Moderator token:', result.moderatorToken);
      
    } catch (error) {
      console.error('Error creating test game:', error);
    }
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create new game
  async createGame(pin, title, questions, moderatorPassword = null) {
    return new Promise((resolve, reject) => {
      const passwordHash = moderatorPassword ? bcrypt.hashSync(moderatorPassword, 10) : null;
      const moderatorToken = this.generateToken();
      const questionsJson = JSON.stringify(questions);

      const sql = `
        INSERT INTO games (pin, title, moderator_password_hash, moderator_token, questions_data)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [pin, title, passwordHash, moderatorToken, questionsJson], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            gameId: this.lastID,
            moderatorToken,
            pin
          });
        }
      });
    });
  }

  // Get game by PIN
  async getGameByPin(pin) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM games WHERE pin = ?', [pin], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          row.questions = JSON.parse(row.questions_data || '[]');
          resolve(row);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Validate moderator
  async validateModerator(pin, password, token) {
    return new Promise((resolve, reject) => {
      console.log(`Validating moderator for PIN: ${pin}, hasPassword: ${!!password}, hasToken: ${!!token}`);
      
      this.db.get('SELECT * FROM games WHERE pin = ?', [pin], (err, row) => {
        if (err) {
          console.error('Database error during moderator validation:', err);
          reject(err);
        } else if (!row) {
          console.log(`No game found with PIN: ${pin}`);
          resolve(false);
        } else {
          console.log(`Game found: ${pin}, hasPasswordHash: ${!!row.moderator_password_hash}, tokenMatch: ${token === row.moderator_token}`);
          
          // Check token first (for reconnection)
          if (token && row.moderator_token === token) {
            console.log('Token validation successful');
            row.questions = JSON.parse(row.questions_data || '[]');
            resolve(row);
            return;
          }
          
          // Check password
          if (password && row.moderator_password_hash && 
              bcrypt.compareSync(password, row.moderator_password_hash)) {
            console.log('Password validation successful');
            row.questions = JSON.parse(row.questions_data || '[]');
            resolve(row);
            return;
          }
          
          // If no password protection, allow connection
          if (!row.moderator_password_hash && !password) {
            console.log('No password protection, allowing connection');
            row.questions = JSON.parse(row.questions_data || '[]');
            resolve(row);
            return;
          }
          
          console.log('Moderator validation failed - no valid credentials');
          resolve(false);
        }
      });
    });
  }

  // Add player without name
  async addPlayer(gameId) {
    return new Promise((resolve, reject) => {
      // Generate player token
      const playerToken = this.generateToken();
      
      // Insert player with auto-generated ID
      const sql = `
        INSERT INTO players (game_id, name, player_token)
        VALUES (?, ?, ?)
      `;

      // Store database reference to avoid context issues
      const db = this.db;
      
      db.run(sql, [gameId, 'Player', playerToken], function(err) {
        if (err) {
          reject(err);
        } else {
          const playerId = this.lastID;
          
          // Update name to include ID using stored database reference
          const updateSql = `UPDATE players SET name = ? WHERE id = ?`;
          db.run(updateSql, [`Player ${playerId}`, playerId], (updateErr) => {
            if (updateErr) {
              reject(updateErr);
            } else {
              resolve({
                playerId: playerId,
                playerToken,
                name: `Player ${playerId}`
              });
            }
          });
        }
      });
    });
  }

  // Reconnect player
  async reconnectPlayer(gameId, playerToken) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE players 
        SET connected = true, last_seen = strftime('%s', 'now')
        WHERE game_id = ? AND player_token = ?
      `;

      this.db.run(sql, [gameId, playerToken], (err) => {
        if (err) {
          reject(err);
        } else {
          // Get updated player data
          this.db.get(
            'SELECT * FROM players WHERE game_id = ? AND player_token = ?',
            [gameId, playerToken],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        }
      });
    });
  }

  // Get game players
  async getGamePlayers(gameId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM players WHERE game_id = ? ORDER BY score DESC',
        [gameId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Update game state
  async updateGameState(gameId, state) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE games 
        SET status = ?, current_question_index = ?, question_start_time = ?, updated_at = strftime('%s', 'now')
        WHERE id = ?
      `;

      this.db.run(sql, [state.status, state.currentQuestionIndex, state.questionStartTime, gameId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Update player score
  async updatePlayerScore(playerId, score) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE players 
        SET score = ?, last_seen = strftime('%s', 'now')
        WHERE id = ?
      `;

      this.db.run(sql, [score, playerId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Save answer
  async saveAnswer(gameId, playerId, questionIndex, answer, isCorrect, points, responseTime) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO answers (game_id, player_id, question_index, answer, is_correct, points_earned, response_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [gameId, playerId, questionIndex, answer, isCorrect, points, responseTime], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Disconnect player
  async disconnectPlayer(playerId) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE players 
        SET connected = false, last_seen = strftime('%s', 'now')
        WHERE id = ?
      `;

      this.db.run(sql, [playerId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Cleanup old games (older than 24 hours)
  async cleanupOldGames() {
    return new Promise((resolve, reject) => {
      const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
      
      // Delete old games and related data
      this.db.serialize(() => {
        this.db.run('DELETE FROM answers WHERE game_id IN (SELECT id FROM games WHERE created_at < ?)', [oneDayAgo]);
        this.db.run('DELETE FROM players WHERE game_id IN (SELECT id FROM games WHERE created_at < ?)', [oneDayAgo]);
        this.db.run('DELETE FROM games WHERE created_at < ?', [oneDayAgo], function(err) {
          if (err) reject(err);
          else {
            console.log(`Cleaned up ${this.changes} old games`);
            resolve(this.changes);
          }
        });
      });
    });
  }

  // Get game statistics
  async getGameStats(gameId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(DISTINCT p.id) as total_players,
          COUNT(a.id) as total_answers,
          AVG(a.response_time) as avg_response_time,
          SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers
        FROM games g
        LEFT JOIN players p ON g.id = p.game_id
        LEFT JOIN answers a ON g.id = a.game_id
        WHERE g.id = ?
      `;

      this.db.get(sql, [gameId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = GameDatabase;