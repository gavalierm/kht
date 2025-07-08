const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class GameDatabase {
  constructor(dbPath = './quiz.db', options = {}) {
    this.db = new sqlite3.Database(dbPath);
    this.skipTestGame = options.skipTestGame || process.env.NODE_ENV === 'test';
    this.initialized = false;
    this.initializationPromise = this.initTables();
  }

  async initTables() {
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
    
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          console.error('Database init error:', err);
          reject(err);
        } else {
          console.log('Database initialized successfully');
          this.initialized = true;
          
          // Create test game if it doesn't exist and not in test mode
          if (!this.skipTestGame) {
            this.createTestGame();
          }
          
          resolve();
        }
      });
    });
  }

  // Method to wait for initialization completion
  async waitForInitialization() {
    if (this.initialized) {
      return;
    }
    await this.initializationPromise;
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

      // Create test game with default password same as PIN
      const result = await this.createGame(
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
  async createGame(pin, questions, moderatorPassword = null) {
    return new Promise((resolve, reject) => {
      const passwordHash = moderatorPassword ? bcrypt.hashSync(String(moderatorPassword), 10) : null;
      const moderatorToken = this.generateToken();
      const db = this.db;

      // First, create the game record
      const gameSQL = `
        INSERT INTO games (pin, moderator_password_hash, moderator_token)
        VALUES (?, ?, ?)
      `;

      db.run(gameSQL, [pin, passwordHash, moderatorToken], function(err) {
        if (err) {
          reject(err);
          return;
        }

        const gameId = this.lastID;

        // Then, insert all questions for this game
        const questionSQL = `
          INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit, question_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const stmt = db.prepare(questionSQL);
        
        let completedQuestions = 0;
        const totalQuestions = questions.length;

        if (totalQuestions === 0) {
          resolve({
            gameId,
            moderatorToken,
            pin
          });
          return;
        }

        questions.forEach((question, index) => {
          stmt.run([
            gameId,
            question.question,
            question.options[0],
            question.options[1], 
            question.options[2],
            question.options[3],
            question.correct,
            question.timeLimit || 30,
            index + 1
          ], function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            completedQuestions++;
            if (completedQuestions === totalQuestions) {
              stmt.finalize();
              resolve({
                gameId,
                moderatorToken,
                pin
              });
            }
          });
        });
      });
    });
  }

  // Get game by PIN
  async getGameByPin(pin) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM games WHERE pin = ?', [pin], (err, gameRow) => {
        if (err) {
          reject(err);
        } else if (gameRow) {
          // Get questions for this game
          this.db.all(
            'SELECT * FROM questions WHERE game_id = ? ORDER BY question_order',
            [gameRow.id],
            (err, questionRows) => {
              if (err) {
                reject(err);
              } else {
                // Convert questions to the format expected by the application
                gameRow.questions = questionRows.map(q => ({
                  id: q.id,
                  question: q.question_text,
                  options: [q.option_a, q.option_b, q.option_c, q.option_d],
                  correct: q.correct_option,
                  timeLimit: q.time_limit
                }));
                resolve(gameRow);
              }
            }
          );
        } else {
          resolve(null);
        }
      });
    });
  }

  // Validate moderator
  async validateModerator(pin, password, token) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM games WHERE pin = ?', [pin], (err, row) => {
        if (err) {
          console.error('Database error during moderator validation:', err);
          reject(err);
        } else if (!row) {
          resolve(false);
        } else {
          
          // Check token first (for reconnection)
          if (token && row.moderator_token === token) {
            row.questions = JSON.parse(row.questions_data || '[]');
            resolve(row);
            return;
          }
          
          // Check password
          if (password && row.moderator_password_hash && 
              bcrypt.compareSync(password, row.moderator_password_hash)) {
            row.questions = JSON.parse(row.questions_data || '[]');
            resolve(row);
            return;
          }
          
          // If no password protection, allow connection
          if (!row.moderator_password_hash && !password) {
            row.questions = JSON.parse(row.questions_data || '[]');
            resolve(row);
            return;
          }
          resolve(false);
        }
      });
    });
  }

  // Add player without name
  async addPlayer(gameId) {
    return new Promise((resolve, reject) => {
      // Validate inputs
      if (!gameId) {
        reject(new Error('Game ID is required'));
        return;
      }

      // Check database connection
      if (!this.db) {
        reject(new Error('Database connection not available'));
        return;
      }

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
          console.error('Error inserting player:', err);
          reject(new Error(`Failed to create player: ${err.message}`));
        } else {
          const playerId = this.lastID;
          
          if (!playerId) {
            reject(new Error('Failed to get player ID after insertion'));
            return;
          }
          
          // Update name to include ID using stored database reference
          const updateSql = `UPDATE players SET name = ? WHERE id = ?`;
          db.run(updateSql, [`Player ${playerId}`, playerId], (updateErr) => {
            if (updateErr) {
              console.error('Error updating player name:', updateErr);
              reject(new Error(`Failed to update player name: ${updateErr.message}`));
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

  // Get question ID by game ID and question order
  async getQuestionId(gameId, questionOrder) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id FROM questions 
        WHERE game_id = ? AND question_order = ?
      `;

      this.db.get(sql, [gameId, questionOrder], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.id : null);
      });
    });
  }

  // Save answer
  async saveAnswer(gameId, playerId, questionIndex, answer, isCorrect, points, responseTime) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get the question ID based on game and question order (questionIndex + 1)
        const questionId = await this.getQuestionId(gameId, questionIndex + 1);
        
        if (!questionId) {
          reject(new Error(`Question not found for game ${gameId} at index ${questionIndex}`));
          return;
        }

        // Check if answer already exists for this player and question
        const checkSql = `
          SELECT id FROM answers 
          WHERE question_id = ? AND player_id = ?
        `;

        this.db.get(checkSql, [questionId, playerId], (err, existingAnswer) => {
          if (err) {
            reject(err);
            return;
          }

          if (existingAnswer) {
            // Answer already exists, resolve without inserting
            console.log(`Answer already exists for player ${playerId} on question ${questionId}`);
            resolve(existingAnswer.id);
            return;
          }

          // Insert new answer
          const insertSql = `
            INSERT INTO answers (question_id, player_id, selected_option, is_correct, points_earned, response_time)
            VALUES (?, ?, ?, ?, ?, ?)
          `;

          this.db.run(insertSql, [questionId, playerId, answer, isCorrect, points, responseTime], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          });
        });
      } catch (error) {
        reject(error);
      }
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
  updateGameQuestions(gameId, questions, callback) {
    // Start a transaction to ensure data consistency
    this.db.serialize(() => {
      this.db.run('BEGIN TRANSACTION');
      
      // Delete existing questions for this game
      this.db.run('DELETE FROM questions WHERE game_id = ?', [gameId], (err) => {
        if (err) {
          this.db.run('ROLLBACK');
          return callback(err);
        }
        
        // Insert new questions
        const questionSQL = `
          INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, time_limit, question_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        let completedInserts = 0;
        let hasError = false;
        
        if (questions.length === 0) {
          // No questions to insert, just commit
          this.db.run('COMMIT', callback);
          return;
        }
        
        questions.forEach((question, index) => {
          if (hasError) return;
          
          const timeLimit = question.timeLimit || 30;
          const questionOrder = index + 1;
          
          this.db.run(questionSQL, [
            gameId,
            question.question,
            question.options[0],
            question.options[1], 
            question.options[2],
            question.options[3],
            question.correct,
            timeLimit,
            questionOrder
          ], (err) => {
            if (err && !hasError) {
              hasError = true;
              this.db.run('ROLLBACK');
              return callback(err);
            }
            
            completedInserts++;
            if (completedInserts === questions.length) {
              this.db.run('COMMIT', callback);
            }
          });
        });
      });
    });
  }


  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = GameDatabase;