import { GameAPI } from '../shared/api.js';
import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { SOCKET_EVENTS, GAME_STATES, ANSWER_OPTIONS, ANSWER_OPTION_CLASSES, ELEMENT_IDS, UI_CONSTANTS } from '../shared/constants.js';

class App {
	constructor() {
		// Initialize managers
		this.socketManager = defaultSocketManager;
		this.socket = this.socketManager.connect();
		this.notifications = defaultNotificationManager;
		this.gameState = defaultGameState;
		this.router = defaultRouter;
		this.dom = defaultDOMHelper;
		
		// Timer intervals
		this.timerInterval = null;
		
		// Element references
		this.elements = {};
        
		this.init();
	}

	init() {
		this.bindEvents();
		this.setupSocketEvents();
		this.setupLatencyMeasurement();
		this.checkInitialRoute();
	}

	bindEvents() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			ELEMENT_IDS.JOIN_GAME_BTN,
			ELEMENT_IDS.GAME_PIN_INPUT,
			ELEMENT_IDS.HEADER,
			ELEMENT_IDS.GAME_CODE,
			ELEMENT_IDS.GAME_STATUS,
			ELEMENT_IDS.QUESTION_TEXT,
			ELEMENT_IDS.TIMER,
			ELEMENT_IDS.OPTIONS,
			ELEMENT_IDS.PLAYGROUND,
			ELEMENT_IDS.SCOREBOARD,
			ELEMENT_IDS.ANSWER_TEXT,
			ELEMENT_IDS.STATUS_ICON,
			ELEMENT_IDS.PLAYER_TIME,
			ELEMENT_IDS.PLAYER_POSITION,
			ELEMENT_IDS.LATENCY_DISPLAY,
			ELEMENT_IDS.PLAYER_ID_DISPLAY
		]);

		// Event listeners
		this.dom.addEventListener(this.elements.joinGameBtn, 'click', () => this.joinGame());
		
		// Handle option clicks
		this.dom.addEventListener(this.elements.options, 'click', (e) => {
			const option = e.target.closest('.option');
			if (option && !this.gameState.hasAnswered && !this.gameState.isWaiting) {
				const answer = ANSWER_OPTION_CLASSES.indexOf(option.classList[1]);
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
		this.socket.on(SOCKET_EVENTS.CONNECT, () => {
			console.log('Connected to server');
			if (this.gameState.playerToken && this.gameState.gamePin) {
				this.attemptReconnect();
			}
		});

		this.socket.on(SOCKET_EVENTS.DISCONNECT, () => {
			console.log('Disconnected from server');
			this.notifications.showWarning('Spojenie prerušené, pokúšam sa pripojiť...');
		});

		// Game events
		this.socket.on(SOCKET_EVENTS.GAME_JOINED, (data) => {
			this.gameState.setPlayerToken(data.playerToken);
			this.gameState.setPlayerId(data.playerId);
			
			this.notifications.showSuccess(`Pripojené ako Hráč ${data.playerId}`);
			this.router.navigateTo(`/app/${this.gameState.gamePin}/game`);
			this.updateGameHeader();
		});

		this.socket.on(SOCKET_EVENTS.JOIN_ERROR, (data) => {
			this.notifications.showError(data.message);
			this.enableJoinButton();
			this.gameState.setGamePin(null);
			this.redirectToLogin();
		});

		this.socket.on(SOCKET_EVENTS.PLAYER_RECONNECTED, (data) => {
			this.gameState.setPlayerId(data.playerId);
			this.notifications.showSuccess('Úspešne pripojené späť');
			this.router.navigateTo(`/app/${this.gameState.gamePin}/game`);
			this.updateGameHeader();
			
			if (data.gameStatus === GAME_STATES.QUESTION_ACTIVE) {
				this.notifications.showInfo('Otázka práve prebieha');
			}
		});

		this.socket.on(SOCKET_EVENTS.RECONNECT_ERROR, (data) => {
			this.notifications.showError(data.message);
			this.gameState.clearSavedSession();
			this.redirectToLogin();
		});

		// Question events
		this.socket.on(SOCKET_EVENTS.QUESTION_STARTED, (data) => {
			this.showQuestion(data);
		});

		this.socket.on(SOCKET_EVENTS.QUESTION_ENDED, (data) => {
			this.showResults(data);
		});

		this.socket.on(SOCKET_EVENTS.ANSWER_RESULT, (data) => {
			this.handleAnswerResult(data);
		});

		// Latency measurement
		this.socket.on(SOCKET_EVENTS.LATENCY_PING, (timestamp) => {
			this.socket.emit(SOCKET_EVENTS.LATENCY_PONG, timestamp);
		});
	}

	setupLatencyMeasurement() {
		if (this.elements.latencyDisplay) {
			// Use the SocketManager's latency measurement
			this.socketManager.setupLatencyMeasurement(this.elements.latencyDisplay);
		}
	}

	checkInitialRoute() {
		const path = window.location.pathname;
		
		// Handle direct /app/:pin route - smart redirect logic
		if (path.match(/^\/app\/\d{6}$/)) {
			const gamePin = this.router.extractGamePin(path);
			if (gamePin) {
				this.handleSmartRedirect(gamePin);
				return;
			}
		}
		
		// Handle specific routes like /app/:pin/game
		if (path.startsWith('/app/') && path.length > 5) {
			const gamePin = this.router.extractGamePin(path);
			if (gamePin) {
				this.gameState.setGamePin(gamePin);
				this.checkForSavedSession();
			} else {
				this.redirectToLogin();
			}
		} else {
			this.redirectToLogin();
		}
	}

	async handleSmartRedirect(gamePin) {
		try {
			// Show loading state
			this.showLoadingState('Kontrolujem stav hry...');
			
			// Fetch game data
			const gameData = await this.api.getGame(gamePin);
			
			if (!gameData) {
				this.notifications.showError('Hra nenájdená');
				this.redirectToLogin();
				return;
			}

			// Redirect based on game status
			switch (gameData.status) {
				case GAME_STATES.RUNNING:
					// Game is active - redirect to game view
					this.router.navigateToGame(gamePin);
					break;

				case GAME_STATES.ENDED:
					// Game has ended - redirect to results
					this.router.redirectToStage(gamePin);
					break;

				case GAME_STATES.WAITING:
					// Game is waiting to start - redirect to game view (waiting room)
					this.router.navigateToGame(gamePin);
					break;

				default:
					// Unknown status - show error
					this.notifications.showError(`Neznámy stav hry: ${gameData.status}`);
					this.redirectToLogin();
					break;
			}
		} catch (error) {
			console.error('Smart redirect error:', error);
			this.notifications.showError('Chyba pri načítavaní údajov o hre');
			this.redirectToLogin();
		}
	}

	showLoadingState(message) {
		// Show login page with loading message
		this.router.showPage('login');
		this.notifications.showInfo(message);
		
		// Disable join button during loading
		if (this.elements.joinGameBtn) {
			this.elements.joinGameBtn.disabled = true;
			this.dom.setText(this.elements.joinGameBtn, 'Načítavam...');
		}
	}

	async checkForSavedSession() {
		if (this.gameState.hasSavedSession()) {
			const savedId = this.gameState.getSavedPlayerId();
			if (savedId) {
				this.gameState.setPlayerId(savedId);
				this.attemptReconnect();
			} else {
				this.redirectToLogin();
			}
		} else {
			this.redirectToLogin();
		}
	}

	attemptReconnect() {
		this.notifications.showInfo('Pokúšam sa pripojiť späť...');
		this.socket.emit(SOCKET_EVENTS.RECONNECT_PLAYER, {
			gamePin: this.gameState.gamePin,
			playerToken: this.gameState.playerToken
		});
	}

	handleRouteChange(path) {
		this.router.handleRouteChange(path);
	}

	redirectToLogin() {
		this.router.redirectToJoin();
	}

	enableJoinButton() {
		if (this.elements.joinGameBtn) {
			this.elements.joinGameBtn.disabled = false;
			this.dom.setText(this.elements.joinGameBtn, 'Pripojiť sa');
		}
	}

	async joinGame() {
		this.elements.joinGameBtn.disabled = true;
		this.dom.setText(this.elements.joinGameBtn, 'Pripájam sa...');

		// Get game PIN
		let gamePin = this.gameState.gamePin;
		if (!gamePin) {
			gamePin = this.elements.gamePinInput?.value.trim() || null;
		}

		if (!gamePin || gamePin.length < UI_CONSTANTS.MIN_PIN_LENGTH) {
			this.notifications.showError('PIN musí mať aspoň 6 znakov');
			this.gameState.setGamePin(null);
			this.enableJoinButton();
			return;
		}

		// Check if game exists via API
		const game = await GameAPI.getGame(gamePin);

		if (!game) {
			this.notifications.showError(`Hra s PIN ${gamePin} neexistuje`);
			this.gameState.setGamePin(null);
			this.enableJoinButton();
			return;
		}

		if (game.status === GAME_STATES.FINISHED) {
			this.notifications.showWarning('Hra už skončila');
			this.gameState.setGamePin(null);
			this.enableJoinButton();
			return;
		}

		// Set game PIN and join via socket
		this.gameState.setGamePin(gamePin);
		this.socket.emit(SOCKET_EVENTS.JOIN_GAME, {
			gamePin: gamePin
		});
	}

	updateGameHeader() {
		if (this.elements.gameCode) {
			this.dom.setText(this.elements.gameCode, `#${this.gameState.gamePin}`);
		}
		if (this.elements.gameStatus) {
			this.dom.setText(this.elements.gameStatus, `Hráč ${this.gameState.playerId || '?'}`);
		}
		if (this.elements.playerIdDisplay) {
			this.dom.setText(this.elements.playerIdDisplay, this.gameState.playerId || '-');
		}
		
		this.setWaitingState();
	}

	setWaitingState() {
		this.gameState.setWaiting(true);
		
		// Update question text
		this.dom.setText(this.elements.questionText, 'Čakám na otázku...');
		
		// Reset timer
		this.dom.setText(this.elements.timer, '-');
		
		// Disable all options
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			this.dom.setStyles(el, {
				opacity: '0.3',
				pointerEvents: 'none',
				cursor: 'not-allowed'
			});
		});
		
		// Reset option texts
		const optionElements = this.elements.options?.querySelectorAll('.option p');
		if (optionElements) {
			optionElements.forEach(el => {
				this.dom.setText(el, '-');
			});
		}
	}

	showQuestion(data) {
		// Switch to playground phase
		this.dom.removeClass(this.elements.scoreboard, 'visible');
		this.dom.addClass(this.elements.playground, 'visible');

		// Update game state
		this.gameState.setCurrentQuestion(data);

		// Update question text
		this.dom.setText(this.elements.questionText, data.question);

		// Update options
		const optionElements = this.elements.options?.querySelectorAll('.option p');
		if (optionElements) {
			data.options.forEach((option, index) => {
				if (optionElements[index]) {
					this.dom.setText(optionElements[index], option);
				}
			});
		}

		// Enable all options
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			this.dom.setStyles(el, {
				opacity: '1',
				pointerEvents: 'auto',
				cursor: 'pointer',
				border: 'none'
			});
		});

		// Start timer
		this.startTimer(data.timeLimit || UI_CONSTANTS.QUESTION_TIME_LIMIT);
	}

	startTimer(duration) {
		let timeLeft = duration;
		
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
		}

		const updateTimer = () => {
			this.dom.setText(this.elements.timer, timeLeft);
			
			if (timeLeft <= 0) {
				clearInterval(this.timerInterval);
				if (!this.gameState.hasAnswered) {
					this.notifications.showInfo('Čas vypršal!');
				}
			}
			timeLeft--;
		};

		updateTimer();
		this.timerInterval = setInterval(updateTimer, UI_CONSTANTS.TIMER_UPDATE_INTERVAL);
	}

	submitAnswer(answerIndex) {
		if (!this.gameState.submitAnswer(answerIndex)) return;

		const answerTime = Date.now();

		// Disable all options
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			this.dom.setStyles(el, {
				opacity: '0.5',
				pointerEvents: 'none'
			});
		});

		// Highlight selected answer
		const selectedOption = this.elements.options?.querySelectorAll('.option')[answerIndex];
		if (selectedOption) {
			this.dom.setStyles(selectedOption, {
				opacity: '1',
				border: '3px solid white'
			});
		}

		this.socket.emit(SOCKET_EVENTS.SUBMIT_ANSWER, {
			answer: answerIndex,
			timestamp: answerTime
		});
	}

	handleAnswerResult(data) {
		this.gameState.setAnswerResult(data);
	}

	showResults(data) {
		// Clear timer
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
		}

		// Switch to scoreboard phase
		this.dom.removeClass(this.elements.playground, 'visible');
		this.dom.addClass(this.elements.scoreboard, 'visible');

		// Update correct answer display
		if (this.elements.answerText && this.gameState.currentQuestion) {
			this.dom.setText(this.elements.answerText, 
				this.gameState.currentQuestion.options[data.correctAnswer]);
		}

		// Update status icon
		if (this.elements.statusIcon && this.gameState.lastResult) {
			if (this.gameState.lastResult.correct) {
				this.dom.addClass(this.elements.statusIcon, 'success');
				this.dom.removeClass(this.elements.statusIcon, 'fail');
			} else {
				this.dom.addClass(this.elements.statusIcon, 'fail');
				this.dom.removeClass(this.elements.statusIcon, 'success');
			}
		}

		// Update time and position
		if (this.elements.playerTime && this.gameState.lastResult) {
			const seconds = (this.gameState.lastResult.responseTime / 1000).toFixed(1);
			this.dom.setText(this.elements.playerTime, `${seconds}s`);
		}

		// Find player position in leaderboard
		const playerPosition = data.leaderboard.findIndex(p => p.playerId === this.gameState.playerId) + 1;
		if (this.elements.playerPosition) {
			this.dom.setText(this.elements.playerPosition, playerPosition > 0 ? 
				`${playerPosition}. miesto` : 'Nezodpovedané');
		}

		// Auto-reset after delay
		setTimeout(() => {
			if (data.gameStatus !== GAME_STATES.FINISHED) {
				this.dom.removeClass(this.elements.scoreboard, 'visible');
				this.dom.addClass(this.elements.playground, 'visible');
				this.setWaitingState();
			}
		}, UI_CONSTANTS.QUESTION_RESULT_DISPLAY_TIME);
	}

	// Cleanup method
	destroy() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
		}
		this.gameState.clearTimers();
	}
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
	new App();
});