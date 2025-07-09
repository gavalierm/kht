/**
 * Stress Testing and Network Resilience E2E Tests
 * - Tests application under high load and stress conditions
 * - Tests Slovak language context and error messages
 * - Tests network resilience and connection recovery
 * - Tests data integrity under concurrent access
 * - Tests memory management and cleanup
 * - Tests real-world edge cases and unusual scenarios
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const http = require('http');
const socketIo = require('socket.io');
const socketClient = require('socket.io-client');
const express = require('express');
const GameDatabase = require('../../database');
const { GameInstance } = require('../../lib/gameInstance');
const SocketManager = require('../../lib/socketManager');
const { 
  createTestDatabase,
  createSampleQuestions,
  generateTestPin,
  generateTestToken,
  delay,
  waitFor,
  cleanupTestDatabase
} = require('../helpers/test-utils');

describe('Stress Testing and Network Resilience E2E Tests', () => {
  let server;
  let io;
  let db;
  let socketManager;
  let port;
  let activeGames;
  let playerLatencies;
  let socketToPlayer;
  let socketToModerator;
  let socketToPanels;

  beforeEach((done) => {
    // Create test database
    db = createTestDatabase();
    
    // Initialize game state
    activeGames = new Map();
    playerLatencies = new Map();
    socketToPlayer = new Map();
    socketToModerator = new Map();
    socketToPanels = new Map();
    
    // Create test server
    const app = express();
    server = http.createServer(app);
    io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    // Initialize socket manager
    socketManager = new SocketManager(io);
    
    // Get random port
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterEach((done) => {
    // Clean up connections
    io.close(() => {
      server.close(() => {
        cleanupTestDatabase(db);
        done();
      });
    });
  });

  // Helper function to set up comprehensive event handlers with Slovak context
  const setupSlovakContextEventHandlers = () => {
    io.on('connection', (socket) => {
      // Game creation with Slovak validation
      socket.on('create_game', async (data) => {
        try {
          const gamePin = generateTestPin();
          const questions = createSampleQuestions();
          
          // Validate moderator password
          if (!data.moderatorPassword || data.moderatorPassword.length < 6) {
            socket.emit('create_game_error', { 
              message: 'Heslo moderátora musí mať minimálne 6 znakov' 
            });
            return;
          }
          
          const dbResult = await db.createGame(gamePin, questions, data.moderatorPassword);
          const game = new GameInstance(gamePin, questions, dbResult.gameId);
          activeGames.set(gamePin, game);
          
          socketToModerator.set(socket.id, {
            gamePin: gamePin,
            gameId: dbResult.gameId,
            moderatorToken: dbResult.moderatorToken
          });
          
          socket.emit('game_created', {
            gamePin: gamePin,
            questionCount: questions.length,
            moderatorToken: dbResult.moderatorToken,
            message: 'Hra bola úspešne vytvorená'
          });
          
        } catch (error) {
          socket.emit('create_game_error', { 
            message: 'Chyba pri vytváraní hry. Skúste to prosím znovu.' 
          });
        }
      });

      // Player joining with Slovak validation
      socket.on('join_game', async (data) => {
        try {
          // Validate PIN format
          if (!data.gamePin || !/^\d{6}$/.test(data.gamePin)) {
            socket.emit('join_error', { 
              message: 'PIN kód musí obsahovať presne 6 čísel' 
            });
            return;
          }
          
          const gameData = db.getGameByPin(data.gamePin);
          if (!gameData) {
            socket.emit('join_error', { 
              message: 'Hra s PIN kódom ' + data.gamePin + ' nebola nájdená' 
            });
            return;
          }
          
          const game = activeGames.get(data.gamePin);
          if (!game) {
            socket.emit('join_error', { 
              message: 'Hra nie je momentálne aktívna' 
            });
            return;
          }
          
          if (game.phase !== 'WAITING') {
            socket.emit('join_error', { 
              message: 'Hra už začala. Nemôžete sa pripojiť v tejto chvíli.' 
            });
            return;
          }
          
          // Check if game is full
          if (game.getConnectedPlayerCount() >= game.maxPlayers) {
            socket.emit('join_error', { 
              message: 'Hra je plná. Maximálny počet hráčov je ' + game.maxPlayers 
            });
            return;
          }
          
          const playerResult = db.addPlayer(gameData.id);
          game.addPlayer(playerResult.playerId, {
            player_token: playerResult.playerToken,
            score: 0
          });
          
          const player = game.getPlayer(playerResult.playerId);
          
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
            playerToken: playerResult.playerToken,
            message: 'Úspešne ste sa pripojili do hry'
          });
          
          // Notify others in Slovak
          socket.broadcast.emit('player_joined_notification', {
            gamePin: data.gamePin,
            playerName: player.name,
            totalPlayers: game.getConnectedPlayerCount(),
            message: player.name + ' sa pripojil do hry'
          });
          
        } catch (error) {
          socket.emit('join_error', { 
            message: 'Nastala chyba pri pripájaní. Skúste to prosím znovu.' 
          });
        }
      });

      // Answer submission with Slovak validation
      socket.on('submit_answer', async (data) => {
        const playerInfo = socketToPlayer.get(socket.id);
        if (!playerInfo) {
          socket.emit('answer_error', { 
            message: 'Nie ste prihlásený do žiadnej hry' 
          });
          return;
        }
        
        const game = activeGames.get(playerInfo.gamePin);
        if (!game) {
          socket.emit('answer_error', { 
            message: 'Hra už nie je aktívna' 
          });
          return;
        }
        
        if (game.phase !== 'QUESTION_ACTIVE') {
          socket.emit('answer_error', { 
            message: 'Momentálne nie je aktívna žiadna otázka' 
          });
          return;
        }
        
        // Validate answer
        if (typeof data.answer !== 'number' || data.answer < 0 || data.answer > 3) {
          socket.emit('answer_error', { 
            message: 'Neplatná odpoveď. Vyberte jednu z možností.' 
          });
          return;
        }
        
        const answerData = game.submitAnswer(playerInfo.playerId, data.answer, playerLatencies);
        if (!answerData) {
          socket.emit('answer_error', { 
            message: 'Už ste odpovedali na túto otázku' 
          });
          return;
        }
        
        const question = game.getCurrentQuestion();
        const isCorrect = data.answer === question.correct;
        const points = game.calculateScore(answerData.responseTime, isCorrect, question.timeLimit);
        
        // Update player score
        const player = game.getPlayer(playerInfo.playerId);
        if (player) {
          player.score += points;
          db.updatePlayerScore(playerInfo.playerId, player.score);
        }
        
        // Slovak response messages
        const responseMessage = isCorrect 
          ? 'Správne! Získali ste ' + points + ' bodov.'
          : 'Nesprávne. Správna odpoveď bola: ' + question.options[question.correct];
        
        socket.emit('answer_result', {
          correct: isCorrect,
          correctAnswer: question.correct,
          correctAnswerText: question.options[question.correct],
          points: points,
          totalScore: player ? player.score : 0,
          responseTime: answerData.responseTime,
          message: responseMessage
        });
      });

      // Question management with Slovak context
      socket.on('start_question', async (data) => {
        const game = activeGames.get(data.gamePin);
        if (!game) return;
        
        const question = game.getCurrentQuestion();
        if (!question) {
          socket.emit('question_error', { 
            message: 'Žiadne ďalšie otázky nie sú k dispozícii' 
          });
          return;
        }
        
        if (game.getConnectedPlayerCount() === 0) {
          socket.emit('question_error', { 
            message: 'Nie sú pripojení žiadni hráči' 
          });
          return;
        }
        
        game.phase = 'QUESTION_ACTIVE';
        game.questionStartTime = Date.now();
        game.answers = [];
        
        const questionData = {
          questionNumber: game.currentQuestionIndex + 1,
          totalQuestions: game.questions.length,
          question: question.question,
          options: question.options,
          timeLimit: question.timeLimit || 30,
          serverTime: game.questionStartTime,
          message: 'Otázka č. ' + (game.currentQuestionIndex + 1) + ' začala'
        };
        
        // Broadcast to all players
        io.emit('question_started', questionData);
        
        // Send to moderator
        socket.emit('question_started_moderator', {
          ...questionData,
          correctAnswer: question.correct,
          totalPlayers: game.getConnectedPlayerCount()
        });
      });

      // Error handling and disconnection
      socket.on('disconnect', () => {
        const playerInfo = socketToPlayer.get(socket.id);
        if (playerInfo) {
          const game = activeGames.get(playerInfo.gamePin);
          if (game) {
            const player = game.getPlayer(playerInfo.playerId);
            if (player) {
              game.removePlayer(playerInfo.playerId, false);
              
              // Notify others in Slovak
              socket.broadcast.emit('player_disconnected_notification', {
                gamePin: playerInfo.gamePin,
                playerName: player.name,
                totalPlayers: game.getConnectedPlayerCount(),
                message: player.name + ' sa odpojil z hry'
              });
            }
          }
          socketToPlayer.delete(socket.id);
        }
      });

      // Network latency simulation
      socket.on('ping', (data) => {
        socket.emit('pong', {
          timestamp: Date.now(),
          clientTimestamp: data.timestamp
        });
      });
    });
  };

  describe('High Load Stress Testing', () => {
    test('should handle 50+ concurrent players in single game', (done) => {
      setupSlovakContextEventHandlers();
      
      const playerCount = 50;
      let gamePin;
      let playersJoined = 0;
      let answersReceived = 0;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        expect(response.message).toBe('Hra bola úspešne vytvorená');
        
        // Create many players simultaneously
        const players = [];
        for (let i = 0; i < playerCount; i++) {
          const playerClient = socketClient(`http://localhost:${port}`);
          players.push(playerClient);
          
          playerClient.on('connect', () => {
            // Spread connection attempts to avoid overwhelming server
            setTimeout(() => {
              playerClient.emit('join_game', { gamePin });
            }, i * 10);
          });
          
          playerClient.on('game_joined', (joinResponse) => {
            expect(joinResponse.message).toBe('Úspešne ste sa pripojili do hry');
            playersJoined++;
            
            if (playersJoined === playerCount) {
              // All players joined, start question
              setTimeout(() => {
                moderatorClient.emit('start_question', { gamePin });
              }, 500);
            }
          });
          
          playerClient.on('question_started', (questionData) => {
            expect(questionData.message).toBe('Otázka č. 1 začala');
            
            // Submit answers with staggered timing
            setTimeout(() => {
              playerClient.emit('submit_answer', {
                answer: i % 4, // Distribute answers across options
                timestamp: Date.now()
              });
            }, i * 5);
          });
          
          playerClient.on('answer_result', (result) => {
            expect(result.message).toBeDefined();
            expect(result.totalScore).toBeGreaterThanOrEqual(0);
            answersReceived++;
            
            if (answersReceived === playerCount) {
              // All answers received, verify load handling
              expect(playersJoined).toBe(playerCount);
              expect(answersReceived).toBe(playerCount);
              
              // Verify game state is consistent
              const game = activeGames.get(gamePin);
              expect(game.answers.length).toBeGreaterThan(0);
              expect(game.getConnectedPlayerCount()).toBe(playerCount);
              
              // Clean up
              players.forEach(p => p.disconnect());
              moderatorClient.disconnect();
              done();
            }
          });
        }
      });
    }, 20000); // Extended timeout for high load
  });

  describe('Network Resilience Testing', () => {
    test('should handle rapid connect/disconnect cycles', (done) => {
      setupSlovakContextEventHandlers();
      
      let gamePin;
      let cycleCount = 0;
      const maxCycles = 5;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        const performCycle = () => {
          const playerClient = socketClient(`http://localhost:${port}`);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', (joinResponse) => {
            expect(joinResponse.message).toBe('Úspešne ste sa pripojili do hry');
            
            // Quickly disconnect
            setTimeout(() => {
              playerClient.disconnect();
              cycleCount++;
              
              if (cycleCount < maxCycles) {
                // Wait briefly then repeat
                setTimeout(performCycle, 100);
              } else {
                // Verify final state
                const game = activeGames.get(gamePin);
                expect(game.getConnectedPlayerCount()).toBe(0);
                
                moderatorClient.disconnect();
                done();
              }
            }, 50);
          });
        };
        
        performCycle();
      });
    });
    
    test('should handle network latency and ping/pong', (done) => {
      setupSlovakContextEventHandlers();
      
      const client = socketClient(`http://localhost:${port}`);
      let pongReceived = false;
      
      client.on('connect', () => {
        const startTime = Date.now();
        
        client.emit('ping', {
          timestamp: startTime
        });
        
        client.on('pong', (pongData) => {
          const endTime = Date.now();
          const latency = endTime - startTime;
          
          expect(pongData.timestamp).toBeDefined();
          expect(pongData.clientTimestamp).toBe(startTime);
          expect(latency).toBeGreaterThan(0);
          expect(latency).toBeLessThan(1000); // Should be reasonable
          
          pongReceived = true;
          client.disconnect();
          
          expect(pongReceived).toBe(true);
          done();
        });
      });
    });
  });

  describe('Slovak Language Context Testing', () => {
    test('should provide proper Slovak error messages', (done) => {
      setupSlovakContextEventHandlers();
      
      const client = socketClient(`http://localhost:${port}`);
      let errorCount = 0;
      const expectedErrors = 3;
      
      client.on('connect', () => {
        // Test 1: Invalid PIN format
        client.emit('join_game', { gamePin: '12345' });
        
        client.on('join_error', (error) => {
          errorCount++;
          
          if (errorCount === 1) {
            expect(error.message).toBe('PIN kód musí obsahovať presne 6 čísel');
            
            // Test 2: Non-existent game
            client.emit('join_game', { gamePin: '999999' });
          } else if (errorCount === 2) {
            expect(error.message).toBe('Hra s PIN kódom 999999 nebola nájdená');
            
            // Test 3: Invalid answer submission
            client.emit('submit_answer', {
              answer: 5, // Invalid answer
              timestamp: Date.now()
            });
          }
        });
        
        client.on('answer_error', (error) => {
          errorCount++;
          
          if (errorCount === 3) {
            expect(error.message).toBe('Nie ste prihlásený do žiadnej hry');
            
            expect(errorCount).toBe(expectedErrors);
            client.disconnect();
            done();
          }
        });
      });
    });
    
    test('should handle Slovak characters in questions correctly', (done) => {
      setupSlovakContextEventHandlers();
      
      let gamePin;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create player
        const playerClient = socketClient(`http://localhost:${port}`);
        
        playerClient.on('connect', () => {
          playerClient.emit('join_game', { gamePin });
        });
        
        playerClient.on('game_joined', () => {
          moderatorClient.emit('start_question', { gamePin });
        });
        
        playerClient.on('question_started', (questionData) => {
          // Verify Slovak characters are properly handled
          expect(questionData.question).toBe('Aké je hlavné mesto Slovenska?');
          expect(questionData.options).toContain('Bratislava');
          expect(questionData.options).toContain('Košice');
          expect(questionData.options).toContain('Žilina');
          
          // Submit correct answer
          playerClient.emit('submit_answer', {
            answer: 0, // Bratislava
            timestamp: Date.now()
          });
        });
        
        playerClient.on('answer_result', (result) => {
          expect(result.message).toBe('Správne! Získali ste ' + result.points + ' bodov.');
          expect(result.correctAnswerText).toBe('Bratislava');
          
          playerClient.disconnect();
          moderatorClient.disconnect();
          done();
        });
      });
    });
  });

  describe('Data Integrity Under Stress', () => {
    test('should maintain consistent game state with rapid operations', (done) => {
      setupSlovakContextEventHandlers();
      
      const operationCount = 100;
      let gamePin;
      let operationsCompleted = 0;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create multiple players rapidly
        for (let i = 0; i < operationCount; i++) {
          const playerClient = socketClient(`http://localhost:${port}`);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', (joinResponse) => {
            expect(joinResponse.playerId).toBeDefined();
            expect(joinResponse.playerName).toMatch(/^Hráč \d+$/);
            
            // Immediately disconnect to test rapid state changes
            playerClient.disconnect();
            operationsCompleted++;
            
            if (operationsCompleted === operationCount) {
              // Verify game state is consistent
              const game = activeGames.get(gamePin);
              expect(game.getConnectedPlayerCount()).toBe(0);
              expect(game.players.size).toBe(operationCount);
              
              // All players should be disconnected but still in game
              const allPlayers = Array.from(game.players.values());
              allPlayers.forEach(player => {
                expect(player.connected).toBe(false);
                expect(player.name).toMatch(/^Hráč \d+$/);
              });
              
              moderatorClient.disconnect();
              done();
            }
          });
        }
      });
    }, 15000);
  });

  describe('Memory Management Testing', () => {
    test('should handle memory cleanup under load', (done) => {
      setupSlovakContextEventHandlers();
      
      let gamePin;
      let playersCreated = 0;
      const playerCount = 30;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Create players that will disconnect
        for (let i = 0; i < playerCount; i++) {
          const playerClient = socketClient(`http://localhost:${port}`);
          
          playerClient.on('connect', () => {
            playerClient.emit('join_game', { gamePin });
          });
          
          playerClient.on('game_joined', () => {
            playersCreated++;
            
            // Disconnect after short delay
            setTimeout(() => {
              playerClient.disconnect();
              
              if (playersCreated === playerCount) {
                // Wait for potential cleanup
                setTimeout(() => {
                  const game = activeGames.get(gamePin);
                  
                  // Check memory statistics
                  const memoryStats = game.getMemoryStats();
                  expect(memoryStats.currentPlayers).toBe(playerCount);
                  expect(memoryStats.connectedPlayers).toBe(0);
                  expect(memoryStats.totalPlayersJoined).toBe(playerCount);
                  
                  // Force memory cleanup
                  game.performMemoryCleanup();
                  
                  const cleanedStats = game.getMemoryStats();
                  expect(cleanedStats.memoryCleanups).toBeGreaterThan(0);
                  
                  moderatorClient.disconnect();
                  done();
                }, 1000);
              }
            }, 100);
          });
        }
      });
    });
  });

  describe('Real-world Edge Cases', () => {
    test('should handle simultaneous game creation attempts', (done) => {
      setupSlovakContextEventHandlers();
      
      const moderatorCount = 5;
      let gamesCreated = 0;
      let gameErrors = 0;
      
      // Create multiple moderators simultaneously
      for (let i = 0; i < moderatorCount; i++) {
        const moderatorClient = socketClient(`http://localhost:${port}`);
        
        moderatorClient.on('connect', () => {
          moderatorClient.emit('create_game', {
            moderatorPassword: 'test123'
          });
        });
        
        moderatorClient.on('game_created', (response) => {
          expect(response.gamePin).toBeDefined();
          expect(response.message).toBe('Hra bola úspešne vytvorená');
          gamesCreated++;
          
          moderatorClient.disconnect();
          checkCompletion();
        });
        
        moderatorClient.on('create_game_error', (error) => {
          expect(error.message).toBeDefined();
          gameErrors++;
          
          moderatorClient.disconnect();
          checkCompletion();
        });
      }
      
      const checkCompletion = () => {
        if (gamesCreated + gameErrors === moderatorCount) {
          expect(gamesCreated).toBeGreaterThan(0);
          expect(activeGames.size).toBe(gamesCreated);
          done();
        }
      };
    });
    
    test('should handle malformed data gracefully', (done) => {
      setupSlovakContextEventHandlers();
      
      const client = socketClient(`http://localhost:${port}`);
      let errorsReceived = 0;
      
      client.on('connect', () => {
        // Test malformed join request
        client.emit('join_game', null);
        
        client.on('join_error', (error) => {
          errorsReceived++;
          expect(error.message).toBeDefined();
          
          // Test malformed answer
          client.emit('submit_answer', {
            answer: 'invalid',
            timestamp: 'invalid'
          });
        });
        
        client.on('answer_error', (error) => {
          errorsReceived++;
          expect(error.message).toBeDefined();
          
          if (errorsReceived === 2) {
            client.disconnect();
            done();
          }
        });
      });
    });
  });

  describe('Game Capacity and Limits', () => {
    test('should enforce game capacity limits', (done) => {
      setupSlovakContextEventHandlers();
      
      let gamePin;
      
      // Create moderator
      const moderatorClient = socketClient(`http://localhost:${port}`);
      
      moderatorClient.on('connect', () => {
        moderatorClient.emit('create_game', {
          moderatorPassword: 'test123'
        });
      });
      
      moderatorClient.on('game_created', (response) => {
        gamePin = response.gamePin;
        
        // Modify game to have small capacity for testing
        const game = activeGames.get(gamePin);
        game.maxPlayers = 2;
        
        // Create players up to capacity
        const player1 = socketClient(`http://localhost:${port}`);
        const player2 = socketClient(`http://localhost:${port}`);
        const player3 = socketClient(`http://localhost:${port}`);
        
        let playersJoined = 0;
        let capacityErrorReceived = false;
        
        player1.on('connect', () => {
          player1.emit('join_game', { gamePin });
        });
        
        player1.on('game_joined', () => {
          playersJoined++;
          
          player2.on('connect', () => {
            player2.emit('join_game', { gamePin });
          });
          
          player2.on('game_joined', () => {
            playersJoined++;
            
            // Try to add third player (should fail)
            player3.on('connect', () => {
              player3.emit('join_game', { gamePin });
            });
            
            player3.on('join_error', (error) => {
              expect(error.message).toBe('Hra je plná. Maximálny počet hráčov je 2');
              capacityErrorReceived = true;
              
              expect(playersJoined).toBe(2);
              expect(capacityErrorReceived).toBe(true);
              
              player1.disconnect();
              player2.disconnect();
              player3.disconnect();
              moderatorClient.disconnect();
              done();
            });
          });
        });
      });
    });
  });
});