import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultAPI } from '../shared/api.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../shared/constants.js';

class DashboardApp {
	constructor() {
		// Initialize managers
		this.socket = defaultSocketManager.connect();
		this.notifications = defaultNotificationManager;
		this.router = defaultRouter;
		this.dom = defaultDOMHelper;
		this.gameState = defaultGameState;
		this.api = defaultAPI;
		
		// Dashboard state
		this.gamePin = null;
		this.gameTitle = DEFAULTS.GAME_TITLE;
		this.gameStatus = GAME_STATES.WAITING;
		this.players = [];
		this.currentQuestion = null;
		this.questionIndex = 0;
		this.totalQuestions = 0;
		this.isModerator = false;

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
			'playerCount',
			'questionProgress',
			'totalPlayers',
			'activePlayers',
			'currentQuestionIndex',
			'totalQuestions',
			'currentQuestionSection',
			'currentQuestionText',
			'currentQuestionOptions',
			'playersList',
			'emptyPlayersState',
			'startGameBtn',
			'pauseGameBtn',
			'endGameBtn',
			'nextQuestionBtn',
			'endQuestionBtn',
			'showResultsBtn',
			'viewGameBtn',
			'viewPanelBtn',
			'viewStageBtn'
		]);

		// Setup event listeners
		this.setupEventListeners();
		
		// Setup socket events
		this.setupSocketEvents();
		
		// Initialize from route
		this.initializeFromRoute();
		
		// Load game data
		this.loadGameData();
	}

	setupEventListeners() {
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

		// Navigation buttons
		if (this.elements.viewGameBtn) {
			this.elements.viewGameBtn.addEventListener('click', () => {
				this.handleViewGame();
			});
		}

		if (this.elements.viewPanelBtn) {
			this.elements.viewPanelBtn.addEventListener('click', () => {
				this.handleViewPanel();
			});
		}

		if (this.elements.viewStageBtn) {
			this.elements.viewStageBtn.addEventListener('click', () => {
				this.handleViewStage();
			});
		}
	}

	setupSocketEvents() {
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

		// Connection events
		this.socket.on('connect', () => {
			this.onSocketConnect();
		});

		this.socket.on('disconnect', () => {
			this.onSocketDisconnect();
		});

		// Error handling
		this.socket.on('error', (error) => {
			this.handleSocketError(error);
		});
	}

	initializeFromRoute() {
		// Extract game PIN from URL
		this.gamePin = this.router.extractGamePin(window.location.pathname);
		
		if (this.gamePin) {
			this.updateGamePin(this.gamePin);
		}
	}

	async loadGameData() {
		if (!this.gamePin) {
			// If no PIN, show game creation interface
			this.showGameCreation();
			return;
		}

		try {
			// Load game info from API
			const gameData = await this.api.getGame(this.gamePin);
			
			if (gameData) {
				this.updateGameInfo(gameData);
				this.connectAsModerator();
			} else {
				this.notifications.showError('Hra nenájdená');
				this.showGameCreation();
			}
		} catch (error) {
			console.error('Error loading game data:', error);
			this.notifications.showError('Chyba pri načítavaní údajov o hre');
		}
	}

	connectAsModerator() {
		if (this.gamePin) {
			this.socket.emit(SOCKET_EVENTS.RECONNECT_MODERATOR, { 
				pin: this.gamePin 
			});
			this.isModerator = true;
		}
	}

	updateGameInfo(gameData) {
		this.gameTitle = gameData.title || DEFAULTS.GAME_TITLE;
		this.gameStatus = gameData.status || GAME_STATES.WAITING;
		this.questionIndex = gameData.currentQuestionIndex || 0;
		this.totalQuestions = gameData.questionCount || 0;
		
		// Update UI
		this.dom.setText(this.elements.gameTitle, this.gameTitle);
		this.dom.setText(this.elements.gameStatus, this.getStatusText(this.gameStatus));
		this.updateQuestionProgress();
		this.updateGameStats();
		this.updateControlButtons();
	}

	updateGamePin(pin) {
		this.gamePin = pin;
		this.dom.setText(this.elements.gamePin, pin);
	}

	updateQuestionProgress() {
		const progress = `${this.questionIndex}/${this.totalQuestions}`;
		this.dom.setText(this.elements.questionProgress, progress);
		this.dom.setText(this.elements.currentQuestionIndex, this.questionIndex);
		this.dom.setText(this.elements.totalQuestions, this.totalQuestions);
	}

	updateGameStats() {
		const activePlayers = this.players.filter(p => p.connected).length;
		
		this.dom.setText(this.elements.totalPlayers, this.players.length);
		this.dom.setText(this.elements.activePlayers, activePlayers);
		this.dom.setText(this.elements.playerCount, this.players.length);
	}

	updateControlButtons() {
		const isWaiting = this.gameStatus === GAME_STATES.WAITING;
		const isRunning = this.gameStatus === GAME_STATES.RUNNING;
		const isEnded = this.gameStatus === GAME_STATES.ENDED;

		// Game control buttons
		this.dom.setEnabled(this.elements.startGameBtn, isWaiting && this.players.length > 0);
		this.dom.setEnabled(this.elements.pauseGameBtn, isRunning);
		this.dom.setEnabled(this.elements.endGameBtn, isRunning);

		// Question control buttons
		this.dom.setEnabled(this.elements.nextQuestionBtn, isRunning);
		this.dom.setEnabled(this.elements.endQuestionBtn, isRunning && this.currentQuestion);
		this.dom.setEnabled(this.elements.showResultsBtn, isRunning || isEnded);
	}

	getStatusText(status) {
		switch (status) {
			case GAME_STATES.WAITING: return 'Čakanie';
			case GAME_STATES.RUNNING: return 'Aktívna';
			case GAME_STATES.ENDED: return 'Ukončená';
			default: return 'Neznámy';
		}
	}

	handleGameStateUpdate(data) {
		if (data.status) {
			this.gameStatus = data.status;
			this.dom.setText(this.elements.gameStatus, this.getStatusText(data.status));
		}

		if (data.currentQuestionIndex !== undefined) {
			this.questionIndex = data.currentQuestionIndex;
			this.updateQuestionProgress();
		}

		this.updateControlButtons();
	}

	handlePlayerJoined(data) {
		if (data.player) {
			this.players.push(data.player);
			this.updateGameStats();
			this.renderPlayersList();
			this.notifications.showInfo(`${data.player.name} sa pripojil`);
		}
	}

	handlePlayerLeft(data) {
		if (data.playerId) {
			this.players = this.players.filter(p => p.id !== data.playerId);
			this.updateGameStats();
			this.renderPlayersList();
		}
	}

	handlePlayersUpdate(data) {
		if (data.players && Array.isArray(data.players)) {
			this.players = data.players;
			this.updateGameStats();
			this.renderPlayersList();
		}
	}

	handleQuestionStarted(data) {
		if (data.question) {
			this.currentQuestion = data.question;
			this.renderCurrentQuestion();
		}

		if (data.questionIndex !== undefined) {
			this.questionIndex = data.questionIndex;
			this.updateQuestionProgress();
		}

		this.updateControlButtons();
	}

	handleQuestionEnded(data) {
		this.currentQuestion = null;
		this.hideCurrentQuestion();
		this.updateControlButtons();
	}

	renderPlayersList() {
		if (!this.elements.playersList) return;

		// Clear existing players
		this.elements.playersList.innerHTML = '';

		if (!this.players || this.players.length === 0) {
			this.showEmptyPlayersState();
			return;
		}

		// Hide empty state
		this.hideEmptyPlayersState();

		// Render players
		this.players.forEach(player => {
			const item = this.createPlayerItem(player);
			this.elements.playersList.appendChild(item);
		});
	}

	createPlayerItem(player) {
		const item = document.createElement('div');
		item.className = 'player-item';

		const nameElement = document.createElement('div');
		nameElement.className = 'player-name';
		nameElement.textContent = player.name || `Hráč ${player.id}`;

		const scoreElement = document.createElement('div');
		scoreElement.className = 'player-score';
		scoreElement.textContent = `${player.score || 0} bodov`;

		const statusElement = document.createElement('div');
		statusElement.className = `player-status ${player.connected ? 'status-online' : 'status-offline'}`;
		statusElement.textContent = player.connected ? 'Online' : 'Offline';

		item.appendChild(nameElement);
		item.appendChild(scoreElement);
		item.appendChild(statusElement);

		return item;
	}

	renderCurrentQuestion() {
		if (!this.currentQuestion || !this.elements.currentQuestionSection) return;

		// Show question section
		this.elements.currentQuestionSection.style.display = 'block';

		// Update question text
		this.dom.setText(this.elements.currentQuestionText, this.currentQuestion.text);

		// Render options
		if (this.elements.currentQuestionOptions && this.currentQuestion.options) {
			this.elements.currentQuestionOptions.innerHTML = '';
			
			this.currentQuestion.options.forEach((option, index) => {
				const optionElement = document.createElement('div');
				optionElement.className = 'option-item';
				if (index === this.currentQuestion.correctAnswer) {
					optionElement.classList.add('correct');
				}
				optionElement.textContent = option;
				this.elements.currentQuestionOptions.appendChild(optionElement);
			});
		}
	}

	hideCurrentQuestion() {
		if (this.elements.currentQuestionSection) {
			this.elements.currentQuestionSection.style.display = 'none';
		}
	}

	showEmptyPlayersState() {
		if (this.elements.emptyPlayersState) {
			this.elements.emptyPlayersState.style.display = 'block';
		}
	}

	hideEmptyPlayersState() {
		if (this.elements.emptyPlayersState) {
			this.elements.emptyPlayersState.style.display = 'none';
		}
	}

	// Game control handlers
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

	// Navigation handlers
	handleViewGame() {
		if (this.gamePin) {
			this.router.redirectToGame(this.gamePin);
		}
	}

	handleViewPanel() {
		if (this.gamePin) {
			this.router.redirectToPanel(this.gamePin);
		}
	}

	handleViewStage() {
		if (this.gamePin) {
			this.router.redirectToStage(this.gamePin);
		}
	}

	showGameCreation() {
		// TODO: Implement game creation interface
		this.notifications.showInfo('Funkcia vytvárania hier bude dostupná čoskoro');
	}

	onSocketConnect() {
		console.log('Dashboard: Connected to server');
		if (this.gamePin && this.isModerator) {
			this.connectAsModerator();
		}
	}

	onSocketDisconnect() {
		console.log('Dashboard: Disconnected from server');
		this.notifications.showWarning('Spojenie so serverom bolo prerušené');
	}

	handleSocketError(error) {
		console.error('Dashboard socket error:', error);
		this.notifications.showError('Chyba komunikácie so serverom');
	}

	// Cleanup when leaving the page
	cleanup() {
		// Remove socket listeners specific to this app
		this.socket.off(SOCKET_EVENTS.GAME_STATE_UPDATE);
		this.socket.off(SOCKET_EVENTS.PLAYER_JOINED);
		this.socket.off(SOCKET_EVENTS.PLAYER_LEFT);
		this.socket.off(SOCKET_EVENTS.PLAYERS_UPDATE);
		this.socket.off(SOCKET_EVENTS.QUESTION_STARTED);
		this.socket.off(SOCKET_EVENTS.QUESTION_ENDED);
	}
}

// Initialize the dashboard app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.dashboardApp = new DashboardApp();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
	if (window.dashboardApp) {
		window.dashboardApp.cleanup();
	}
});

export { DashboardApp };