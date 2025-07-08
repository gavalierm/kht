import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultAPI } from '../shared/api.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../shared/constants.js';

class ControlApp {
	constructor() {
		// Initialize managers
		this.socket = defaultSocketManager.connect();
		this.notifications = defaultNotificationManager;
		this.router = defaultRouter;
		this.dom = defaultDOMHelper;
		this.gameState = defaultGameState;
		this.api = defaultAPI;
		
		// Control state
		this.gamePin = null;
		this.gameTitle = 'Control';
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
			'gameCreationCard',
			'gameControlCard',
			'createGameBtn',
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
			// Navigation buttons removed
		]);

		// Setup event listeners
		this.setupEventListeners();
		
		// Setup socket events
		this.setupSocketEvents();
		
		// Initialize from route
		this.initializeFromRoute();
		
		// Load available question templates
		this.loadQuestionTemplates();
		
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

		// Game creation button
		if (this.elements.createGameBtn) {
			this.elements.createGameBtn.addEventListener('click', () => {
				this.handleCreateGame();
			});
		}

		// Navigation buttons removed per user request
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

		// Moderator reconnection
		this.socket.on('moderator_reconnected', (data) => {
			this.handleModeratorReconnected(data);
		});

		this.socket.on('moderator_reconnect_error', (error) => {
			this.handleModeratorReconnectError(error);
		});

		// Game creation events
		this.socket.on('game_created', (data) => {
			this.handleGameCreated(data);
		});

		this.socket.on('create_game_error', (error) => {
			this.handleCreateGameError(error);
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
			this.showGameControl();
		} else {
			this.showGameCreation();
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
				gamePin: this.gamePin 
			});
			this.isModerator = true;
		}
	}

	updateGameInfo(gameData) {
		this.gameTitle = gameData.title || DEFAULTS.GAME_TITLE;
		this.gameStatus = gameData.status || GAME_STATES.WAITING;
		this.questionIndex = gameData.currentQuestionIndex || 0;
		this.totalQuestions = gameData.questionCount || 0;
		this.gameCategory = gameData.category || null;
		
		// Update UI
		this.dom.setText(this.elements.gameTitle, this.gameTitle);
		this.dom.setText(this.elements.gameStatus, this.getStatusText(this.gameStatus));
		if (this.gameCategory) {
			const template = this.availableTemplates.find(t => t.category === this.gameCategory);
			this.dom.setText(this.elements.gameCategory, template ? template.title : this.gameCategory);
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

	// Navigation handlers removed per user request

	async loadQuestionTemplates() {
		try {
			const response = await fetch('/api/question-templates');
			if (response.ok) {
				this.availableTemplates = await response.json();
				this.populateTemplateSelect();
			} else {
				console.error('Failed to load question templates');
			}
		} catch (error) {
			console.error('Error loading question templates:', error);
		}
	}

	populateTemplateSelect() {
		const select = document.getElementById('gameCategory');
		if (!select || this.availableTemplates.length === 0) return;

		// Clear existing options
		select.innerHTML = '';
		
		// Add template options
		this.availableTemplates.forEach(template => {
			const option = document.createElement('option');
			option.value = template.category;
			option.textContent = template.title;
			select.appendChild(option);
		});
	}

	showGameCreation() {
		if (this.elements.gameCreationCard) {
			this.elements.gameCreationCard.style.display = 'block';
		}
		if (this.elements.gameControlCard) {
			this.elements.gameControlCard.style.display = 'none';
		}
		this.dom.setText(this.elements.gameTitle, 'Vytvorenie novej hry');
	}

	showGameControl() {
		if (this.elements.gameCreationCard) {
			this.elements.gameCreationCard.style.display = 'none';
		}
		if (this.elements.gameControlCard) {
			this.elements.gameControlCard.style.display = 'block';
		}
		this.dom.setText(this.elements.gameTitle, 'Control');
	}

	async handleCreateGame() {
		try {
			const category = document.getElementById('gameCategory')?.value || 'general';
			const customPin = document.getElementById('customPin')?.value?.trim();
			const moderatorPassword = document.getElementById('moderatorPassword')?.value?.trim();

			// Validate custom PIN if provided
			if (customPin && (customPin.length !== 6 || !/^[0-9]{6}$/.test(customPin))) {
				this.notifications.showError('PIN musí mať presne 6 číslic');
				return;
			}

			// Disable create button to prevent double-clicking
			this.dom.setEnabled(this.elements.createGameBtn, false);
			this.dom.setText(this.elements.createGameBtn, '⏳ Vytváram hru...');

			// Send create game request
			const gameData = {
				category: category,
				customPin: customPin || undefined,
				moderatorPassword: moderatorPassword || undefined
			};

			this.socket.emit(SOCKET_EVENTS.CREATE_GAME, gameData);

		} catch (error) {
			console.error('Error creating game:', error);
			this.notifications.showError('Chyba pri vytváraní hry');
			this.resetCreateButton();
		}
	}

	resetCreateButton() {
		this.dom.setEnabled(this.elements.createGameBtn, true);
		this.dom.setText(this.elements.createGameBtn, '⚙️ Vytvoriť hru');
	}

	handleGameCreated(data) {
		console.log('Game created successfully:', data);
		
		// Update game state
		this.gamePin = data.gamePin;
		this.gameTitle = data.title;
		this.totalQuestions = data.questionCount;
		this.isModerator = true;
		
		// Store moderator token
		if (data.moderatorToken) {
			this.gameState.setModeratorToken(data.moderatorToken);
		}
		
		// Update URL without page reload
		const newUrl = `/control/${data.gamePin}`;
		window.history.pushState(null, '', newUrl);
		
		// Update UI
		this.updateGamePin(data.gamePin);
		this.showGameControl();
		this.updateGameInfo({
			title: data.title,
			status: GAME_STATES.WAITING,
			currentQuestionIndex: 0,
			questionCount: data.questionCount
		});
		
		this.notifications.showSuccess(`Hra úspešne vytvorená! PIN: ${data.gamePin}`);
		this.resetCreateButton();
	}

	handleCreateGameError(error) {
		console.error('Game creation error:', error);
		this.notifications.showError(error.message || 'Chyba pri vytváraní hry');
		this.resetCreateButton();
	}

	onSocketConnect() {
		console.log('Control: Connected to server');
		if (this.gamePin && this.isModerator) {
			this.connectAsModerator();
		}
	}

	onSocketDisconnect() {
		console.log('Control: Disconnected from server');
		// Connection banner handles disconnect notifications
	}

	handleSocketError(error) {
		console.error('Control socket error:', error);
		this.notifications.showError('Chyba komunikácie so serverom');
	}

	handleModeratorReconnected(data) {
		console.log('Moderator reconnected:', data);
		
		// Update game info
		if (data.title) this.gameTitle = data.title;
		if (data.questionCount !== undefined) this.totalQuestions = data.questionCount;
		if (data.currentQuestionIndex !== undefined) this.questionIndex = data.currentQuestionIndex;
		if (data.status) this.gameStatus = data.status.toUpperCase();
		
		// Update players
		if (data.players && Array.isArray(data.players)) {
			// Convert player names to player objects if needed
			this.players = data.players.map((player, index) => {
				if (typeof player === 'string') {
					return { id: index + 1, name: player, connected: true, score: 0 };
				}
				return player;
			});
		}
		
		// Store moderator token if provided
		if (data.moderatorToken) {
			this.gameState.setModeratorToken(data.moderatorToken);
		}
		
		// Update UI
		this.updateGameInfo({ 
			title: this.gameTitle, 
			status: this.gameStatus, 
			currentQuestionIndex: this.questionIndex, 
			questionCount: this.totalQuestions 
		});
		this.updateGameStats();
		this.renderPlayersList();
		
		this.notifications.showSuccess('Úspešne pripojené ako moderátor');
	}

	handleModeratorReconnectError(error) {
		console.error('Moderator reconnect error:', error);
		this.notifications.showError(error.message || 'Nepodarilo sa pripojiť ako moderátor');
		
		// Redirect to home or show game creation
		setTimeout(() => {
			this.showGameCreation();
		}, 2000);
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

// Initialize the control app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.controlApp = new ControlApp();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
	if (window.controlApp) {
		window.controlApp.cleanup();
	}
});

export { ControlApp };