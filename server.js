const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"]
	}
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Global variables
const activeGames = new Map(); // gamePin -> GameInstance
const playerLatencies = new Map(); // socketId -> latency

// Game class
class GameInstance {
	constructor(gamePin, questions) {
		this.gamePin = gamePin;
		this.questions = questions;
		this.players = new Map(); // socketId -> {name, score, socketId}
		this.answers = []; // current question answers
		this.phase = 'WAITING'; // WAITING, QUESTION_ACTIVE, RESULTS, FINISHED
		this.currentQuestionIndex = 0;
		this.questionStartTime = null;
		this.moderatorSocket = null;
		this.timeLimit = 30;
	}

	addPlayer(socketId, playerName) {
		this.players.set(socketId, {
			socketId: socketId,
			name: playerName,
			score: 0,
			connected: true
		});
	}

	removePlayer(socketId) {
		this.players.delete(socketId);
	}

	getCurrentQuestion() {
		return this.questions[this.currentQuestionIndex] || null;
	}

	submitAnswer(socketId, answer) {
		const serverTime = Date.now();
		const playerLatency = playerLatencies.get(socketId) || 0;
    
		// Time compensation and bucketing
		const compensatedTime = serverTime - (playerLatency / 2);
		const bucketedTime = Math.floor(compensatedTime / 50) * 50;
    
		const answerData = {
			playerId: socketId,
			answer: answer,
			timestamp: bucketedTime,
			responseTime: bucketedTime - this.questionStartTime
		};
    
		// Check if player already answered
		const existingAnswer = this.answers.find(a => a.playerId === socketId);
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
			.sort((a, b) => b.score - a.score)
			.map((player, index) => ({
				position: index + 1,
				name: player.name,
				score: player.score,
				socketId: player.socketId
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
}

// Helper functions
function generateGamePin() {
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
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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
	socket.on('create_game', (data) => {
		const gamePin = generateGamePin();
		const questionsData = loadQuestions(data.category || 'general');
		const game = new GameInstance(gamePin, questionsData.quiz.questions);
    
		game.moderatorSocket = socket.id;
		activeGames.set(gamePin, game);
    
		socket.join(`game_${gamePin}_moderator`);
		socket.emit('game_created', {
			gamePin: gamePin,
			title: questionsData.quiz.title,
			questionCount: questionsData.quiz.questions.length
		});
    
		console.log(`Game created: ${gamePin}`);
	});

	// Dashboard: Start question
	socket.on('start_question', (data) => {
		const game = activeGames.get(data.gamePin);
		if (!game || game.moderatorSocket !== socket.id) return;
    
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
	socket.on('join_game', (data) => {
		const game = activeGames.get(data.gamePin);
		if (!game) {
			socket.emit('join_error', { message: 'Hra s týmto PIN kódom neexistuje' });
			return;
		}
    
		if (game.phase !== 'WAITING' && game.phase !== 'RESULTS') {
			socket.emit('join_error', { message: 'Hra už prebieha, nemôžete sa pripojiť' });
			return;
		}
    
		game.addPlayer(socket.id, data.playerName);
		socket.join(`game_${data.gamePin}`);
    
		socket.emit('game_joined', {
			gamePin: data.gamePin,
			playerName: data.playerName,
			playersCount: game.players.size
		});
    
		// Update dashboard with new player count
		if (game.moderatorSocket) {
			io.to(game.moderatorSocket).emit('player_joined', {
				playerName: data.playerName,
				totalPlayers: game.players.size,
				players: Array.from(game.players.values()).map(p => p.name)
			});
		}
    
		console.log(`Player ${data.playerName} joined game ${data.gamePin}`);
	});

	// Player: Submit answer
	socket.on('submit_answer', (data) => {
		const game = activeGames.get(data.gamePin);
		if (!game || game.phase !== 'QUESTION_ACTIVE') return;
    
		const answerData = game.submitAnswer(socket.id, data.answer);
		const question = game.getCurrentQuestion();
		const isCorrect = data.answer === question.correct;
		const points = game.calculateScore(answerData.responseTime, isCorrect);
    
		// Update player score
		const player = game.players.get(socket.id);
		if (player) {
			player.score += points;
		}
    
		// Send result to player
		socket.emit('answer_result', {
			correct: isCorrect,
			correctAnswer: question.correct,
			points: points,
			totalScore: player ? player.score : 0,
			responseTime: answerData.responseTime
		});
    
		// Update dashboard with live stats
		updateDashboardStats(game);
    
		console.log(`Answer submitted by ${socket.id} in game ${data.gamePin}: ${data.answer} (${isCorrect ? 'correct' : 'wrong'})`);
	});

	// Disconnect handling
	socket.on('disconnect', () => {
		console.log('Disconnected:', socket.id);
    
		// Clean up latency tracking
		playerLatencies.delete(socket.id);
		clearInterval(latencyInterval);
    
		// Remove from games
		for (const [gamePin, game] of activeGames.entries()) {
			if (game.players.has(socket.id)) {
				game.removePlayer(socket.id);
        
				// Update dashboard
				if (game.moderatorSocket) {
					io.to(game.moderatorSocket).emit('player_left', {
						totalPlayers: game.players.size
					});
				}
        
				// Clean up empty games
				if (game.players.size === 0 && game.moderatorSocket !== socket.id) {
					activeGames.delete(gamePin);
					console.log(`Game ${gamePin} deleted - no players`);
				}
			}
      
			// If moderator disconnects, end the game
			if (game.moderatorSocket === socket.id) {
				activeGames.delete(gamePin);
				io.to(`game_${gamePin}`).emit('game_ended', { reason: 'Moderátor ukončil hru' });
				console.log(`Game ${gamePin} ended - moderator disconnected`);
			}
		}
	});
});

// Helper function to end question
function endQuestion(game) {
	if (game.phase !== 'QUESTION_ACTIVE') return;
  
	game.phase = 'RESULTS';
	const question = game.getCurrentQuestion();
	const leaderboard = game.getLeaderboard();
  
	// Calculate answer statistics
	const stats = calculateAnswerStats(game.answers, question.options.length);
  
	const resultsData = {
		correctAnswer: question.correct,
		leaderboard: leaderboard.slice(0, 10), // Top 10
		answerStats: stats,
		totalAnswers: game.answers.length,
		totalPlayers: game.players.size
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
  
	console.log(`Question ended in game ${game.gamePin}`);
}

// Helper function to update dashboard stats
function updateDashboardStats(game) {
	if (!game.moderatorSocket) return;
  
	const question = game.getCurrentQuestion();
	const stats = calculateAnswerStats(game.answers, question.options.length);
  
	io.to(game.moderatorSocket).emit('live_stats', {
		answeredCount: game.answers.length,
		totalPlayers: game.players.size,
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Quiz server running on http://localhost:${PORT}`);
	console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
});