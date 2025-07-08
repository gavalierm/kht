import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { extractGamePin, redirectToGameCreation } from '../shared/navigation.js';
import { SOCKET_EVENTS, GAME_STATES, DEFAULTS } from '../shared/constants.js';

class GameControl {
	constructor() {
		// Initialize managers
		this.socket = defaultSocketManager.connect();
		this.notifications = defaultNotificationManager;
		this.dom = defaultDOMHelper;
		this.gameState = defaultGameState;
		
		// Game state
		this.gamePin = null;
		this.gameTitle = 'Ovládanie hry';
		this.gameStatus = GAME_STATES.WAITING;
		this.gameCategory = null;
		this.players = [];
		this.currentQuestion = null;
		this.questionIndex = 0;
		this.totalQuestions = 0;
		this.isModerator = false;
		this.availableTemplates = [];

		// Element references
		this.elements = {};

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'gameTitle',
			'gamePin',
			'gameStatus',
			'totalPlayers',
			'activePlayers',
			'currentQuestionIndex',
			'totalQuestions',
			'gameCategory',
			'startGameBtn',
			'pauseGameBtn',
			'endGameBtn',
			'nextQuestionBtn',
			'endQuestionBtn',
			'showResultsBtn',
			'currentQuestionSection',
			'currentQuestionText',
			'currentQuestionOptions',
			'playersList',
			'emptyPlayersState'
		]);

		this.bindEvents();
		this.setupSocketEvents();
		this.initializeFromRoute();
	}

	bindEvents() {
		// Game control buttons
		if (this.elements.startGameBtn) {
			this.elements.startGameBtn.addEventListener('click', () => {
				this.handleStartGame();
			});
		}

		if (this.elements.pauseGameBtn) {
			this.elements.pauseGameBtn.addEventListener('click', () => {
				this.handlePauseGame();
			});
		}

		if (this.elements.endGameBtn) {
			this.elements.endGameBtn.addEventListener('click', () => {
				this.handleEndGame();
			});
		}

		// Question control buttons
		if (this.elements.nextQuestionBtn) {
			this.elements.nextQuestionBtn.addEventListener('click', () => {
				this.handleNextQuestion();
			});
		}

		if (this.elements.endQuestionBtn) {
			this.elements.endQuestionBtn.addEventListener('click', () => {
				this.handleEndQuestion();
			});
		}

		if (this.elements.showResultsBtn) {
			this.elements.showResultsBtn.addEventListener('click', () => {
				this.handleShowResults();
			});
		}
	}

	setupSocketEvents() {
		// Connection events
		this.socket.on('connect', () => {
			console.log('Control: Connected to server');
			if (this.gamePin && this.isModerator) {
				this.connectAsModerator();
			}
		});

		this.socket.on('disconnect', () => {
			console.log('Control: Disconnected from server');
		});

		// Game state updates
		this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (data) => {
			this.handleGameStateUpdate(data);
		});

		// Player updates
		this.socket.on(SOCKET_EVENTS.PLAYER_JOINED, (data) => {
			this.handlePlayerJoined(data);
		});

		this.socket.on(SOCKET_EVENTS.PLAYER_LEFT, (data) => {
			this.handlePlayerLeft(data);
		});

		this.socket.on(SOCKET_EVENTS.PLAYERS_UPDATE, (data) => {
			this.handlePlayersUpdate(data);
		});

		// Question updates
		this.socket.on(SOCKET_EVENTS.QUESTION_STARTED, (data) => {
			this.handleQuestionStarted(data);
		});

		this.socket.on(SOCKET_EVENTS.QUESTION_ENDED, (data) => {
			this.handleQuestionEnded(data);
		});

		// Moderator events
		this.socket.on('moderator_reconnect_success', (data) => {
			this.handleModeratorReconnectSuccess(data);
		});

		this.socket.on('moderator_reconnect_error', (error) => {
			this.handleModeratorReconnectError(error);
		});

		// Error handling
		this.socket.on('error', (error) => {
			this.handleSocketError(error);
		});
	}

	initializeFromRoute() {
		// Extract game PIN from URL
		this.gamePin = extractGamePin(window.location.pathname);
		
		if (this.gamePin) {
			this.updateGamePin(this.gamePin);
			this.connectAsModerator();
		} else {
			// No game PIN in URL - redirect to creation page
			this.notifications.showError('Nebolo možné nájsť PIN hry');
			setTimeout(() => {
				redirectToGameCreation();
			}, 2000);
		}
	}

	connectAsModerator() {
		if (this.gamePin) {
			this.socket.emit(SOCKET_EVENTS.RECONNECT_MODERATOR, { 
				gamePin: this.gamePin 
			});
			this.isModerator = true;
		}
	}

	// Game control methods
	handleStartGame() {
		this.socket.emit(SOCKET_EVENTS.START_GAME, { pin: this.gamePin });
		this.notifications.showInfo('Spúšťam hru...');
	}

	handlePauseGame() {
		this.socket.emit(SOCKET_EVENTS.PAUSE_GAME, { pin: this.gamePin });
		this.notifications.showInfo('Pozastavujem hru...');
	}

	handleEndGame() {
		if (confirm('Naozaj chcete ukončiť hru?')) {
			this.socket.emit(SOCKET_EVENTS.END_GAME, { pin: this.gamePin });
			this.notifications.showInfo('Ukončujem hru...');
		}
	}

	handleNextQuestion() {
		this.socket.emit(SOCKET_EVENTS.START_QUESTION, { pin: this.gamePin });
		this.notifications.showInfo('Načítavam ďalšiu otázku...');
	}

	handleEndQuestion() {
		this.socket.emit(SOCKET_EVENTS.END_QUESTION, { pin: this.gamePin });
		this.notifications.showInfo('Ukončujem otázku...');
	}

	handleShowResults() {
		this.socket.emit(SOCKET_EVENTS.SHOW_RESULTS, { pin: this.gamePin });
		this.notifications.showInfo('Zobrazujem výsledky...');
	}

	// Socket event handlers
	handleGameStateUpdate(data) {
		if (data.status) {
			this.gameStatus = data.status;
			this.dom.setText(this.elements.gameStatus, this.getStatusText(data.status));
		}

		if (data.currentQuestionIndex !== undefined) {
			this.questionIndex = data.currentQuestionIndex;
			this.updateQuestionProgress();
		}

		if (data.totalQuestions !== undefined) {
			this.totalQuestions = data.totalQuestions;
			this.updateQuestionProgress();
		}

		this.updateControlButtons();
	}

	handlePlayerJoined(data) {
		this.notifications.showInfo(`Hráč ${data.playerId} sa pripojil`);
		// Player will be added via handlePlayersUpdate
	}

	handlePlayerLeft(data) {
		this.notifications.showInfo(`Hráč ${data.playerId} sa odpojil`);
		// Player will be removed via handlePlayersUpdate
	}

	handlePlayersUpdate(data) {
		this.players = data.players || [];
		this.updateGameStats();
		this.updatePlayersList();
	}

	handleQuestionStarted(data) {
		this.currentQuestion = data;
		this.displayCurrentQuestion(data);
		this.updateControlButtons();
	}

	handleQuestionEnded(data) {
		this.hideCurrentQuestion();
		this.updateControlButtons();
	}

	handleModeratorReconnectSuccess(data) {
		console.log('Moderator reconnected successfully:', data);
		this.updateGameInfo(data);
		this.notifications.showSuccess('Pripojený ako moderátor');
	}

	handleModeratorReconnectError(error) {
		console.error('Moderator reconnect error:', error);
		this.notifications.showError(error.message || 'Chyba pri pripojení moderátora');
		
		// Redirect to creation page if game doesn't exist
		if (error.message && error.message.includes('neexistuje')) {
			setTimeout(() => {
				redirectToGameCreation();
			}, 2000);
		}
	}

	handleSocketError(error) {
		console.error('Socket error:', error);
		this.notifications.showError('Chyba spojenia so serverom');
	}

	// UI update methods
	updateGameInfo(gameData) {
		this.gameTitle = gameData.title || DEFAULTS.GAME_TITLE;
		this.gameStatus = gameData.status || GAME_STATES.WAITING;
		this.questionIndex = gameData.currentQuestionIndex || 0;
		this.totalQuestions = gameData.questionCount || 0;
		this.gameCategory = gameData.category || null;
		
		// Update UI
		this.dom.setText(this.elements.gameTitle, `🎮 ${this.gameTitle}`);
		this.dom.setText(this.elements.gameStatus, this.getStatusText(this.gameStatus));
		if (this.gameCategory) {
			this.dom.setText(this.elements.gameCategory, this.getCategoryDisplayName(this.gameCategory));
		}
		this.updateQuestionProgress();
		this.updateGameStats();
		this.updateControlButtons();
	}

	updateGamePin(pin) {
		this.gamePin = pin;
		this.dom.setText(this.elements.gamePin, pin);
	}

	updateQuestionProgress() {
		this.dom.setText(this.elements.currentQuestionIndex, this.questionIndex);
		this.dom.setText(this.elements.totalQuestions, this.totalQuestions);
	}

	updateGameStats() {
		const activePlayers = this.players.filter(p => p.connected).length;
		
		this.dom.setText(this.elements.totalPlayers, this.players.length);
		this.dom.setText(this.elements.activePlayers, activePlayers);
	}

	updateControlButtons() {
		const isWaiting = this.gameStatus === GAME_STATES.WAITING;
		const isRunning = this.gameStatus === GAME_STATES.RUNNING || this.gameStatus === GAME_STATES.ACTIVE;
		const isQuestionActive = this.gameStatus === GAME_STATES.QUESTION_ACTIVE;
		const isEnded = this.gameStatus === GAME_STATES.ENDED || this.gameStatus === GAME_STATES.FINISHED;

		// Game control buttons
		this.dom.setEnabled(this.elements.startGameBtn, isWaiting);
		this.dom.setEnabled(this.elements.pauseGameBtn, isRunning || isQuestionActive);
		this.dom.setEnabled(this.elements.endGameBtn, isRunning || isQuestionActive);

		// Question control buttons  
		this.dom.setEnabled(this.elements.nextQuestionBtn, isWaiting || isRunning);
		this.dom.setEnabled(this.elements.endQuestionBtn, isQuestionActive);
		this.dom.setEnabled(this.elements.showResultsBtn, isRunning || isEnded || isQuestionActive);
	}

	updatePlayersList() {
		if (!this.elements.playersList || !this.elements.emptyPlayersState) return;

		if (this.players.length === 0) {
			this.elements.playersList.style.display = 'none';
			this.elements.emptyPlayersState.style.display = 'block';
			return;
		}

		this.elements.playersList.style.display = 'block';
		this.elements.emptyPlayersState.style.display = 'none';

		this.elements.playersList.innerHTML = this.players.map(player => `
			<div class="player-item">
				<div class="player-name">Hráč ${player.id}</div>
				<div class="player-score">${player.score || 0} bodov</div>
				<div class="player-status ${player.connected ? 'status-online' : 'status-offline'}">
					${player.connected ? 'Online' : 'Offline'}
				</div>
			</div>
		`).join('');
	}

	displayCurrentQuestion(questionData) {
		if (!this.elements.currentQuestionSection) return;

		this.elements.currentQuestionSection.style.display = 'block';
		this.dom.setText(this.elements.currentQuestionText, questionData.question);

		if (this.elements.currentQuestionOptions && questionData.options) {
			this.elements.currentQuestionOptions.innerHTML = questionData.options.map((option, index) => `
				<div class="option-item ${index === questionData.correct ? 'correct' : ''}">
					${option}
				</div>
			`).join('');
		}
	}

	hideCurrentQuestion() {
		if (this.elements.currentQuestionSection) {
			this.elements.currentQuestionSection.style.display = 'none';
		}
	}

	getStatusText(status) {
		switch (status) {
			case GAME_STATES.WAITING: return 'Čakanie';
			case GAME_STATES.RUNNING:
			case GAME_STATES.ACTIVE: return 'Aktívna';
			case GAME_STATES.QUESTION_ACTIVE: return 'Otázka aktívna';
			case GAME_STATES.RESULTS: return 'Výsledky';
			case GAME_STATES.ENDED:
			case GAME_STATES.FINISHED: return 'Ukončená';
			default: return 'Neznámy';
		}
	}

	getCategoryDisplayName(category) {
		const categoryMap = {
			'general': 'Všeobecné vedomosti',
			'history': 'História',
			'science': 'Veda a technika'
		};
		return categoryMap[category] || category;
	}
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	new GameControl();
});