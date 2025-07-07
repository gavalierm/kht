class App {
	constructor() {
		this.socket = io();

		this.gamePin = null;
		this.currentGame = null;
		this.currentQuestion = null;
		this.hasAnswered = false;
		this.timerInterval = null;
		this.latencyInterval = null;
		this.playerToken = localStorage.getItem('playerToken');
		this.playerId = null;
		this.isWaiting = true; // Track waiting state

		this.messageBox = null;
		
		// Element references
		this.elements = {};
        
		this.bindEvents();
		this.setupSocketEvents();
		this.startLatencyMeasurement();
		
		// Check route on load
		const path = window.location.pathname;
		if (path.startsWith('/app/') && path.length > 5) {
			this.gamePin = path.split('/')[2];
			this.checkForSavedSession();
		} else {
			this.redirectToLogin();
		}
	}

	bindEvents() {
		// Cache elements
		this.elements = {
			joinGameBtn: document.getElementById("joinGameBtn"),
			gamePinInput: document.getElementById("gamePinInput"),
			header: document.getElementById("header"),
			gameCode: document.getElementById("gameCode"),
			gameStatus: document.getElementById("gameStatus"),
			questionText: document.getElementById("questionText"),
			timer: document.getElementById("timer"),
			options: document.getElementById("options"),
			playground: document.getElementById("playground"),
			scoreboard: document.getElementById("scoreboard"),
			answerText: document.getElementById("answerText"),
			statusIcon: document.getElementById("statusIcon"),
			playerTime: document.getElementById("playerTime"),
			playerPosition: document.getElementById("playerPosition"),
			latencyDisplay: document.getElementById("latencyDisplay"),
			playerIdDisplay: document.getElementById("player_id")
		};

		// Event listeners
		this.elements.joinGameBtn?.addEventListener('click', () => this.joinGame());
		
		// Handle option clicks
		this.elements.options?.addEventListener('click', (e) => {
			const option = e.target.closest('.option');
			if (option && !this.hasAnswered && !this.isWaiting) {
				const answer = ['option_a', 'option_b', 'option_c', 'option_d']
					.indexOf(option.classList[1]);
				if (answer !== -1) {
					this.submitAnswer(answer);
				}
			}
		});

		// Handle back navigation
		window.addEventListener('popstate', () => {
			this.handleRouteChange(window.location.pathname);
		});
	}

	setupSocketEvents() {
		// Connection events
		this.socket.on('connect', () => {
			console.log('Connected to server');
			if (this.playerToken && this.gamePin) {
				this.attemptReconnect();
			}
		});

		this.socket.on('disconnect', () => {
			console.log('Disconnected from server');
			this.showWarning('Spojenie prerušené, pokúšam sa pripojiť...');
		});

		// Game events
		this.socket.on('game_joined', (data) => {
			this.playerToken = data.playerToken;
			this.playerId = data.playerId;
			localStorage.setItem('playerToken', this.playerToken);
			localStorage.setItem(`game_${this.gamePin}_id`, this.playerId);
			
			this.showSuccess(`Pripojené ako Hráč ${data.playerId}`);
			this.redirectTo(`/app/${this.gamePin}/game`);
			this.updateGameHeader();
		});

		this.socket.on('join_error', (data) => {
			this.showError(data.message);
			this.elements.joinGameBtn.disabled = false;
			this.elements.joinGameBtn.textContent = 'Pripojiť sa';
			this.gamePin = null;
			this.redirectToLogin();
		});

		this.socket.on('player_reconnected', (data) => {
			this.playerId = data.playerId;
			this.showSuccess('Úspešne pripojené späť');
			this.redirectTo(`/app/${this.gamePin}/game`);
			this.updateGameHeader();
			
			if (data.gameStatus === 'QUESTION_ACTIVE') {
				// Rejoining during active question
				this.showInfo('Otázka práve prebieha');
			}
		});

		this.socket.on('reconnect_error', (data) => {
			this.showError(data.message);
			localStorage.removeItem('playerToken');
			this.playerToken = null;
			this.redirectToLogin();
		});

		// Question events
		this.socket.on('question_started', (data) => {
			this.showQuestion(data);
		});

		this.socket.on('question_ended', (data) => {
			this.showResults(data);
		});

		this.socket.on('answer_result', (data) => {
			this.handleAnswerResult(data);
		});

		// Latency measurement
		this.socket.on('latency_ping', (timestamp) => {
			this.socket.emit('latency_pong', timestamp);
		});
	}

	startLatencyMeasurement() {
		// Update latency display every second
		this.latencyInterval = setInterval(() => {
			if (this.elements.latencyDisplay) {
				const latency = this.socket.connected ? 
					Math.round(performance.now() % 100) : 0; // Simplified for now
				this.elements.latencyDisplay.textContent = `${latency}ms`;
			}
		}, 1000);
	}

	async checkForSavedSession() {
		if (this.playerToken && this.gamePin) {
			const savedId = localStorage.getItem(`game_${this.gamePin}_id`);
			if (savedId) {
				this.playerId = savedId;
				this.attemptReconnect();
			} else {
				// Token exists but no saved ID for this game
				this.redirectToLogin();
			}
		} else {
			this.redirectToLogin();
		}
	}

	attemptReconnect() {
		this.showInfo('Pokúšam sa pripojiť späť...');
		this.socket.emit('reconnect_player', {
			gamePin: this.gamePin,
			playerToken: this.playerToken
		});
	}

	redirectTo(path = '/app') {
		const normalize = p => p.replace(/\/+$/, '').toLowerCase();
		const currentPath = normalize(window.location.pathname);
		const targetPath = normalize(path);

		if (!/^\/[a-z0-9\/\-]*$/i.test(targetPath)) {
			console.error('Neplatná cieľová cesta:', targetPath);
			return;
		}

		if (currentPath !== targetPath) {
			history.pushState(null, '', path);
		}

		this.handleRouteChange(targetPath);
	}

	handleRouteChange(path) {
		// Hide all pages
		document.querySelectorAll('.page').forEach(el => {
			el.classList.remove('visible');
		});

		// Hide all phases
		document.querySelectorAll('.phase').forEach(el => {
			el.classList.remove('visible');
		});

		if (path.startsWith('/app/') && path.includes('/game')) {
			// Show game page
			document.querySelector('#game.page')?.classList.add('visible');
			// Show playground by default
			this.elements.playground?.classList.add('visible');
		} else {
			// Show login page
			document.querySelector('#login.page')?.classList.add('visible');
		}
	}

	redirectToLogin() {
		this.redirectTo('/app');
	}

	async joinGame() {
		this.elements.joinGameBtn.disabled = true;
		this.elements.joinGameBtn.textContent = 'Pripájam sa...';

		// Get game PIN
		if (!this.gamePin) {
			this.gamePin = this.elements.gamePinInput?.value.trim() || null;
		}

		if (!this.gamePin || this.gamePin.length < 6) {
			this.showError('PIN musí mať aspoň 6 znakov');
			this.gamePin = null;
			this.elements.joinGameBtn.disabled = false;
			this.elements.joinGameBtn.textContent = 'Pripojiť sa';
			return;
		}

		// First check if game exists via API
		const game = await this.api('getGame', this.gamePin);

		if (!game) {
			this.showError(`Hra s PIN ${this.gamePin} neexistuje`);
			this.gamePin = null;
			this.elements.joinGameBtn.disabled = false;
			this.elements.joinGameBtn.textContent = 'Pripojiť sa';
			return;
		}

		if (game.status === 'finished') {
			this.showWarning('Hra už skončila');
			this.gamePin = null;
			this.elements.joinGameBtn.disabled = false;
			this.elements.joinGameBtn.textContent = 'Pripojiť sa';
			return;
		}

		// Join via socket - no player name needed
		this.socket.emit('join_game', {
			gamePin: this.gamePin
		});
	}

	updateGameHeader() {
		if (this.elements.gameCode) {
			this.elements.gameCode.textContent = `#${this.gamePin}`;
		}
		if (this.elements.gameStatus) {
			this.elements.gameStatus.textContent = `Hráč ${this.playerId || '?'}`;
		}
		if (this.elements.playerIdDisplay) {
			this.elements.playerIdDisplay.textContent = this.playerId || '-';
		}
		
		// Set initial waiting state
		this.setWaitingState();
	}

	setWaitingState() {
		this.isWaiting = true;
		
		// Update question text
		if (this.elements.questionText) {
			this.elements.questionText.textContent = 'Čakám na otázku...';
		}
		
		// Reset timer
		if (this.elements.timer) {
			this.elements.timer.textContent = '-';
		}
		
		// Disable all options
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			el.style.opacity = '0.3';
			el.style.pointerEvents = 'none';
			el.style.cursor = 'not-allowed';
		});
		
		// Reset option texts
		const optionElements = this.elements.options?.querySelectorAll('.option p');
		if (optionElements) {
			optionElements.forEach(el => {
				el.textContent = '-';
			});
		}
	}

	showQuestion(data) {
		// Switch to playground phase
		this.elements.scoreboard?.classList.remove('visible');
		this.elements.playground?.classList.add('visible');

		// Reset state
		this.hasAnswered = false;
		this.isWaiting = false;
		this.currentQuestion = data;

		// Update question text
		if (this.elements.questionText) {
			this.elements.questionText.textContent = data.question;
		}

		// Update options
		const optionElements = this.elements.options?.querySelectorAll('.option p');
		if (optionElements) {
			data.options.forEach((option, index) => {
				if (optionElements[index]) {
					optionElements[index].textContent = option;
				}
			});
		}

		// Enable all options
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			el.style.opacity = '1';
			el.style.pointerEvents = 'auto';
			el.style.cursor = 'pointer';
			el.style.border = 'none'; // Reset border
		});

		// Start timer with the time from question data
		this.startTimer(data.timeLimit || 30);
	}

	startTimer(duration) {
		let timeLeft = duration;
		
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
		}

		const updateTimer = () => {
			if (this.elements.timer) {
				this.elements.timer.textContent = timeLeft;
			}
			
			if (timeLeft <= 0) {
				clearInterval(this.timerInterval);
				if (!this.hasAnswered) {
					this.showInfo('Čas vypršal!');
				}
			}
			timeLeft--;
		};

		updateTimer();
		this.timerInterval = setInterval(updateTimer, 1000);
	}

	submitAnswer(answerIndex) {
		if (this.hasAnswered) return;

		this.hasAnswered = true;
		const answerTime = Date.now();

		// Disable all options
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			el.style.opacity = '0.5';
			el.style.pointerEvents = 'none';
		});

		// Highlight selected answer
		const selectedOption = this.elements.options?.querySelectorAll('.option')[answerIndex];
		if (selectedOption) {
			selectedOption.style.opacity = '1';
			selectedOption.style.border = '3px solid white';
		}

		this.socket.emit('submit_answer', {
			answer: answerIndex,
			timestamp: answerTime
		});
	}

	handleAnswerResult(data) {
		// Store result for display
		this.lastResult = data;
	}

	showResults(data) {
		// Clear timer
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
		}

		// Switch to scoreboard phase
		this.elements.playground?.classList.remove('visible');
		this.elements.scoreboard?.classList.add('visible');

		// Update correct answer display
		if (this.elements.answerText && this.currentQuestion) {
			this.elements.answerText.textContent = 
				this.currentQuestion.options[data.correctAnswer];
		}

		// Update status icon
		if (this.elements.statusIcon && this.lastResult) {
			if (this.lastResult.correct) {
				this.elements.statusIcon.classList.add('success');
				this.elements.statusIcon.classList.remove('fail');
			} else {
				this.elements.statusIcon.classList.add('fail');
				this.elements.statusIcon.classList.remove('success');
			}
		}

		// Update time and position
		if (this.elements.playerTime && this.lastResult) {
			const seconds = (this.lastResult.responseTime / 1000).toFixed(1);
			this.elements.playerTime.textContent = `${seconds}s`;
		}

		// Find player position in leaderboard
		const playerPosition = data.leaderboard.findIndex(p => p.playerId === this.playerId) + 1;
		if (this.elements.playerPosition) {
			this.elements.playerPosition.textContent = playerPosition > 0 ? 
				`${playerPosition}. miesto` : 'Nezodpovedané';
		}

		// After showing results, set back to waiting state
		setTimeout(() => {
			// Only switch back to playground if game is not finished
			if (data.gameStatus !== 'FINISHED') {
				this.elements.scoreboard?.classList.remove('visible');
				this.elements.playground?.classList.add('visible');
				this.setWaitingState();
			}
		}, 10000); // Show results for 10 seconds
	}

	async api(action, payload = null) {
		switch (action) {
			case 'getGame':
				if (!payload) {
					console.warn('Chýba PIN payload.');
					return null;
				}
				try {
					const res = await fetch(`/api/game/${payload}`);
					if (!res.ok) return null;
					return await res.json();
				} catch (err) {
					console.error('Chyba pri načítaní hry:', err);
					return null;
				}

			default:
				console.warn('Neznáme API:', action);
				return null;
		}
	}

	showError(message) {
		return this.showNotification(message, 'error');
	}

	showInfo(message) {
		return this.showNotification(message, 'info');
	}

	showSuccess(message) {
		return this.showNotification(message, 'success');
	}

	showWarning(message) {
		return this.showNotification(message, 'warning');
	}

	showNotification(message, type = 'info') {
		const notification = document.createElement('div');
		notification.classList.add(type);
		notification.textContent = message;

		this.messageBox = this.messageBox ?? document.getElementById("messageBox");
		this.messageBox.appendChild(notification);
        
		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, 3000);
	}
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
	new App();
});