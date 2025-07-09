import { GameAPI } from '../shared/api.js';
import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultSessionChecker } from '../shared/sessionChecker.js';
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
		this.sessionChecker = defaultSessionChecker;
		this.api = new GameAPI();
		
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
		
		// Delay initial route check to ensure router has handled the route first
		setTimeout(() => {
			this.checkInitialRoute();
		}, 0);
	}

	bindEvents() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			ELEMENT_IDS.HEADER,
			ELEMENT_IDS.GAME_CODE,
			ELEMENT_IDS.GAME_STATUS,
			ELEMENT_IDS.QUESTION_TEXT,
			ELEMENT_IDS.TIMER,
			ELEMENT_IDS.OPTIONS,
			ELEMENT_IDS.PLAYGROUND,
			ELEMENT_IDS.RESULT,
			ELEMENT_IDS.ANSWER_TEXT,
			ELEMENT_IDS.STATUS_ICON,
			ELEMENT_IDS.PLAYER_TIME,
			ELEMENT_IDS.PLAYER_POSITION,
			ELEMENT_IDS.LATENCY_DISPLAY,
			'leaveGameBtn'
		]);

		// Handle option clicks
		this.dom.addEventListener(this.elements.options, 'click', (e) => {
			const option = e.target.closest('.option');
			
			// Skip if no option found or option is disabled
			if (!option || option.style.pointerEvents === 'none') {
				return;
			}
			
			// Prevent default action to avoid any interference
			e.preventDefault();
			e.stopPropagation();
			
			// Debug logging to help diagnose the issue
			console.log('Option click detected:', {
				hasOption: !!option,
				hasAnswered: this.gameState.hasAnswered,
				isWaiting: this.gameState.isWaiting,
				optionClasses: option ? Array.from(option.classList) : null,
				gameStatus: this.gameState.gameStatus
			});
			
			if (option && !this.gameState.hasAnswered && !this.gameState.isWaiting) {
				const answer = ANSWER_OPTION_CLASSES.indexOf(option.classList[1]);
				if (answer !== -1) {
					this.submitAnswer(answer);
				}
			} else if (option && this.gameState.isWaiting) {
				// Player clicked during waiting state - show excited notification!
				console.log('Player clicked option during waiting state - they are excited to play!');
				const excitedMessages = [
					'Wow! Nemôžem sa dočkať! 🔥',
					'Pripravený na víťazstvo! 🏆',
					'Toto bude epické! ⚡',
					'Ideme na to! 🚀',
					'Súťaživý duch! 💪',
					'Chcem vyhrať! 🎯'
				];
				const randomMessage = excitedMessages[Math.floor(Math.random() * excitedMessages.length)];
				
				// Add a small delay to ensure notification system is ready
				setTimeout(() => {
					this.notifications.showInfo(randomMessage);
				}, 50);
			}
		});

		// Handle leave game button
		this.dom.addEventListener(this.elements.leaveGameBtn, 'click', () => {
			this.leaveGame();
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
			// Connection banner handles disconnect notifications
		});

		// Game events
		this.socket.on(SOCKET_EVENTS.GAME_JOINED, (data) => {
			this.gameState.setPlayerToken(data.playerToken);
			this.gameState.setPlayerId(data.playerId);
			this.gameState.setPlayerName(data.playerName);
			
			this.notifications.showSuccess(`Pripojené ako ${data.playerName}`);
			// Transition from loading to game interface with proper state
			this.showGameInterface();
		});

		this.socket.on(SOCKET_EVENTS.JOIN_ERROR, (data) => {
			this.notifications.showError(data.message);
			this.gameState.setGamePin(null);
			this.router.redirectToJoin();
		});

		this.socket.on(SOCKET_EVENTS.PLAYER_RECONNECTED, (data) => {
			this.gameState.setPlayerId(data.playerId);
			this.gameState.setPlayerName(data.playerName);
			// Connection banner handles reconnection success notification
			// Transition from loading to game interface with proper state
			this.showGameInterface();
			
			if (data.gameStatus === GAME_STATES.QUESTION_ACTIVE) {
				this.notifications.showInfo('Otázka práve prebieha');
			}
		});

		this.socket.on(SOCKET_EVENTS.RECONNECT_ERROR, (data) => {
			this.notifications.showError(data.message);
			this.gameState.clearSavedSession();
			this.router.redirectToJoin();
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

		// Game end event
		this.socket.on(SOCKET_EVENTS.GAME_ENDED, (data) => {
			this.handleGameEnded(data);
		});

		// Game state updates
		this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (data) => {
			console.log('Game state update:', data);
			this.handleGameStateUpdate(data);
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
		
		// Handle /game route - main gameplay route, check for saved session
		// Router already shows loading page, don't override it
		if (path === '/game') {
			this.handleGameRouteWithSession();
			return;
		}
		
		// Handle specific routes like /game/:pin - auto-join with PIN from URL
		if (path.startsWith('/game/')) {
			const gamePin = this.router.extractGamePin(path);
			if (gamePin) {
				this.gameState.setGamePin(gamePin);
				
				// Check if player has saved session first
				if (this.gameState.hasSavedSession()) {
					this.checkForSavedSessionWithValidation();
				} else {
					// Auto-join with PIN from URL if game is not ended/finished
					this.handleAutoJoin(gamePin);
				}
			} else {
				this.router.redirectToJoin();
			}
		}
		
		// Handle root and other routes (fallback)
		if (path === '/' || path === '') {
			// Root redirects to /game on server level, shouldn't reach here
			this.router.showPage('login');
			return;
		}
	}

	async handleSmartRedirect(gamePin) {
		try {
			// Fetch game data (already in loading state)
			const gameData = await this.api.getGame(gamePin);
			
			if (!gameData) {
				this.notifications.showError('Hra nenájdená');
				this.router.redirectToJoin();
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
					this.router.redirectToJoin();
					break;
			}
		} catch (error) {
			console.error('Smart redirect error:', error);
			this.notifications.showError('Chyba pri načítavaní údajov o hre');
			this.router.redirectToJoin();
		}
	}

	async handleAutoJoin(gamePin) {
		try {
			// Check if game exists via API (already in loading state)
			const game = await GameAPI.getGame(gamePin);

			if (!game) {
				this.notifications.showError(`Hra s PIN ${gamePin} neexistuje`);
				this.gameState.setGamePin(null);
				this.router.redirectToJoin();
				return;
			}

			if (game.status === GAME_STATES.FINISHED) {
				this.notifications.showWarning('Hra už skončila');
				this.router.redirectToStage(gamePin);
				return;
			}

			if (game.status === GAME_STATES.ENDED) {
				this.notifications.showInfo('Hra skončila - zobrazujem výsledky');
				this.router.redirectToStage(gamePin);
				return;
			}

			// Auto-join the game via socket
			this.gameState.setGamePin(gamePin);
			this.socket.emit(SOCKET_EVENTS.JOIN_GAME, {
				gamePin: gamePin
			});

		} catch (error) {
			console.error('Auto-join error:', error);
			this.notifications.showError('Chyba pri automatickom pripojení');
			this.router.redirectToJoin();
		}
	}


	async handleGameRouteWithSession() {
		// Check if player has a valid token and game PIN for reconnection
		if (this.gameState.playerToken && this.gameState.gamePin) {
			try {
				// Validate the saved game PIN via API first
				const game = await GameAPI.getGame(this.gameState.gamePin);
				
				if (game && (game.status === 'waiting' || game.status === 'running')) {
					// Game is still active - attempt reconnection
					this.notifications.showInfo('Pokračujem v hre...');
					this.attemptReconnect();
					return;
				} else {
					// Game ended or doesn't exist - clear session and redirect
					this.gameState.clearGame();
					this.gameState.clearSavedSession();
					this.notifications.showWarning('Uložená hra už skončila');
					this.router.redirectToJoin();
					return;
				}
			} catch (error) {
				console.error('Error validating saved session:', error);
				this.gameState.clearGame();
				this.gameState.clearSavedSession();
				this.notifications.showError('Chyba pri kontrole uloženej hry');
				this.router.redirectToJoin();
				return;
			}
		}
		
		// Fallback to original session checking logic
		const result = await this.sessionChecker.checkSavedSession();
		
		if (result.shouldRedirect) {
			this.sessionChecker.showSessionMessage(result);
			this.router.navigateTo(result.redirectUrl);
		} else {
			// No valid session - redirect to join interface
			if (result.message) {
				this.sessionChecker.showSessionMessage(result);
			}
			this.router.redirectToJoin();
		}
	}

	async checkForSavedSessionWithValidation() {
		if (this.gameState.hasSavedSession()) {
			const savedPin = this.gameState.gamePin; // Already loaded from localStorage
			const savedId = this.gameState.getSavedPlayerId();
			
			if (savedPin && savedId) {
				try {
					// Validate the saved game PIN via API
					const game = await GameAPI.getGame(savedPin);
					
					if (game && (game.status === 'waiting' || game.status === 'running')) {
						// Game is still active - attempt reconnection
						this.gameState.setPlayerId(savedId);
						this.attemptReconnect();
					} else {
						// Game ended or doesn't exist - clear session and auto-join with current PIN
						const currentPin = this.gameState.gamePin; // Save current PIN before clearing
						this.gameState.clearGame();
						this.gameState.clearSavedSession();
						this.notifications.showWarning('Predchádzajúca hra už skončila');
						this.handleAutoJoin(currentPin);
					}
				} catch (error) {
					console.error('Error validating saved session:', error);
					const currentPin = this.gameState.gamePin; // Save current PIN before clearing
					this.gameState.clearGame();
					this.gameState.clearSavedSession();
					this.handleAutoJoin(currentPin);
				}
			} else {
				this.handleAutoJoin(this.gameState.gamePin);
			}
		} else {
			this.handleAutoJoin(this.gameState.gamePin);
		}
	}

	async checkForSavedSession() {
		// Legacy method - redirect to new validation method
		await this.checkForSavedSessionWithValidation();
	}

	attemptReconnect() {
		// Connection banner handles reconnection attempt notifications
		this.socket.emit(SOCKET_EVENTS.RECONNECT_PLAYER, {
			gamePin: this.gameState.gamePin,
			playerToken: this.gameState.playerToken
		});
	}

	handleRouteChange(path) {
		this.router.handleRouteChange(path);
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

	showGameInterface() {
		// Transition from loading to game interface
		this.router.hideAllPages(); // Hide all pages first
		this.router.showPage('game');
		this.updateGameHeader();
	}

	updateGameHeader() {
		if (this.elements.gameCode) {
			this.dom.setText(this.elements.gameCode, `#${this.gameState.gamePin}`);
		}
		if (this.elements.gameStatus) {
			this.dom.setText(this.elements.gameStatus, this.gameState.playerName || 'Hráč ?');
		}
		
		this.setWaitingState();
	}

	setWaitingState() {
		this.gameState.setWaiting(true);
		
		// Update question text
		this.dom.setText(this.elements.questionText, 'Čakám na otázku...');
		
		// Show spinner in timer
		this.dom.addClass(this.elements.timer, 'waiting');
		
		
		// Reset option texts and clear selection highlighting
		const optionElements = this.elements.options?.querySelectorAll('.option');
		if (optionElements) {
			optionElements.forEach(optionEl => {
				// Reset text
				const textEl = optionEl.querySelector('p');
				if (textEl) {
					this.dom.setText(textEl, '-');
				}
				
				// Clear voting states
				this.dom.removeClass(optionEl, 'voted');
				this.dom.removeClass(optionEl, 'not-voted');
				
				// Remove voted label if it exists
				const votedLabel = optionEl.querySelector('.voted-label');
				if (votedLabel) {
					votedLabel.remove();
				}
				
				// Clear any inline styles
				this.dom.setStyles(optionEl, {
					opacity: '',
					border: '',
					pointerEvents: ''
				});
			});
		}
	}

	setGameEndedState() {
		// Set game state to ended
		this.gameState.setWaiting(true);
		
		// Update question text to show game ended
		this.dom.setText(this.elements.questionText, '🏆 Hra skončila!');
		
		// Show spinner in timer
		this.dom.addClass(this.elements.timer, 'waiting');
		
		// Fade all option buttons (like unvoted ones)
		const optionElements = this.elements.options?.querySelectorAll('.option');
		if (optionElements) {
			optionElements.forEach(optionEl => {
				// Clear voting states first
				this.dom.removeClass(optionEl, 'voted');
				this.dom.removeClass(optionEl, 'not-voted');
				
				// Remove voted label if it exists
				const votedLabel = optionEl.querySelector('.voted-label');
				if (votedLabel) {
					votedLabel.remove();
				}
				
				// Apply faded state (similar to not-voted)
				this.dom.addClass(optionEl, 'not-voted');
				
				// Disable interactions
				this.dom.setStyles(optionEl, {
					pointerEvents: 'none',
					cursor: 'not-allowed'
				});
			});
		}
	}

	showQuestion(data) {
		// Switch to playground phase
		this.dom.removeClass(this.elements.result, 'visible');
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

		// Enable all options and clear voted states
		this.elements.options?.querySelectorAll('.option').forEach(el => {
			// Clear voting states
			this.dom.removeClass(el, 'voted');
			this.dom.removeClass(el, 'not-voted');
			
			// Remove voted label if it exists
			const votedLabel = el.querySelector('.voted-label');
			if (votedLabel) {
				votedLabel.remove();
			}
			
			// Enable and reset styles
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

		// Hide spinner and show timer text
		this.dom.removeClass(this.elements.timer, 'waiting');

		const updateTimer = () => {
			this.dom.setText(this.elements.timer?.querySelector('.timer-text'), timeLeft);
			
			// Change color when time is running out
			if (timeLeft <= 10 && this.elements.timer) {
				this.elements.timer.classList.add('low-time');
			} else if (this.elements.timer) {
				this.elements.timer.classList.remove('low-time');
			}
			
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

		// Get all options
		const optionElements = this.elements.options?.querySelectorAll('.option');
		if (!optionElements) return;

		// Disable all options
		optionElements.forEach(el => {
			this.dom.setStyles(el, {
				pointerEvents: 'none'
			});
		});

		// Mark selected option as voted
		const selectedOption = optionElements[answerIndex];
		if (selectedOption) {
			this.dom.addClass(selectedOption, 'voted');
			
			// Add voted label
			const votedLabel = document.createElement('span');
			votedLabel.className = 'voted-label';
			votedLabel.textContent = 'ODOSLANÉ';
			selectedOption.appendChild(votedLabel);
		}

		// Mark other options as not voted
		optionElements.forEach((el, index) => {
			if (index !== answerIndex) {
				this.dom.addClass(el, 'not-voted');
			}
		});

		// Show success notification
		this.notifications.showSuccess('Odpoveď odoslaná!');

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

		// Switch to result display
		this.dom.removeClass(this.elements.playground, 'visible');
		this.dom.addClass(this.elements.result, 'visible');

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
				this.dom.removeClass(this.elements.result, 'visible');
				this.dom.addClass(this.elements.playground, 'visible');
				this.setWaitingState();
			}
		}, UI_CONSTANTS.QUESTION_RESULT_DISPLAY_TIME);
	}

	handleGameEnded(data) {
		console.log('Game ended:', data);
		
		// Show game ended notification
		this.notifications.showInfo('Hra skončila - zobrazujem výsledky');
		
		// Clear any running timers
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
		
		// Clear game timers
		this.gameState.clearTimers();
		
		// Set proper end game UI state
		this.setGameEndedState();
		
		// Redirect to stage interface to show final leaderboard
		const gamePin = this.gameState.gamePin;
		if (gamePin) {
			setTimeout(() => {
				this.router.redirectToStage(gamePin);
			}, 3000); // Wait 3 seconds to show proper end state
		} else {
			// Fallback if no game PIN
			this.router.redirectToJoin();
		}
	}

	handleGameStateUpdate(data) {
		console.log('Handling game state update:', data);
		
		if (data.status === 'waiting') {
			// Game is waiting for next question to start
			// Show waiting message in question area
			if (this.elements.questionText) {
				this.dom.setText(this.elements.questionText, 
					`Čakáme na otázku ${data.questionNumber}/${data.totalQuestions}...`);
			}
			
			// Show timer with waiting spinner
			if (this.elements.timer) {
				this.dom.addClass(this.elements.timer, 'waiting');
				this.dom.removeClass(this.elements.timer, 'hidden');
			}
			
			// Show options but reset them to waiting state
			if (this.elements.options) {
				this.dom.removeClass(this.elements.options, 'hidden');
				
				// Reset option texts and clear selection highlighting
				const optionElements = this.elements.options.querySelectorAll('.option');
				if (optionElements) {
					optionElements.forEach(optionEl => {
						// Reset text
						const textEl = optionEl.querySelector('p');
						if (textEl) {
							this.dom.setText(textEl, '-');
						}
						
						// Clear voting states
						this.dom.removeClass(optionEl, 'voted');
						this.dom.removeClass(optionEl, 'not-voted');
						
						// Remove voted label if it exists
						const votedLabel = optionEl.querySelector('.voted-label');
						if (votedLabel) {
							votedLabel.remove();
						}
						
						// Clear any inline styles
						this.dom.setStyles(optionEl, {
							opacity: '',
							border: '',
							pointerEvents: ''
						});
					});
				}
			}
			
			// Clear any running timers
			if (this.timerInterval) {
				clearInterval(this.timerInterval);
				this.timerInterval = null;
			}
			
			// Update status
			this.gameState.setCurrentState('waiting');
			
		} else if (data.status === 'finished') {
			// Game finished - will be handled by GAME_ENDED event
		} else if (data.status === 'reset') {
			// Game was reset - show message and redirect to join page
			this.notifications.showInfo(data.message || 'Hra bola resetovaná');
			
			// Clear game state
			this.gameState.clearGameData();
			
			// Redirect to join page after short delay
			setTimeout(() => {
				this.router.redirectToJoin();
			}, 2000);
		}
	}

	leaveGame() {
		// Notify server to remove player from game and cleanup tokens
		if (this.socket && this.socket.connected && this.gameState.playerToken) {
			this.socket.emit(SOCKET_EVENTS.LEAVE_GAME, {
				gamePin: this.gameState.gamePin,
				playerToken: this.gameState.playerToken
			});
		}
		
		// Clear all stored game data
		this.gameState.clearGame();
		this.gameState.clearSavedSession();
		
		// Clean up any timers
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
		}
		this.gameState.clearTimers();
		
		// Show confirmation and redirect to join page
		this.notifications.showInfo('Opustili ste hru');
		this.router.redirectToJoin();
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