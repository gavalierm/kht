import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultAPI } from '../shared/api.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../shared/constants.js';

class StageApp {
	constructor() {
		// Initialize managers
		this.socket = defaultSocketManager.connect();
		this.notifications = defaultNotificationManager;
		this.router = defaultRouter;
		this.dom = defaultDOMHelper;
		this.gameState = defaultGameState;
		this.api = defaultAPI;
		
		// Stage state
		this.gamePin = null;
		this.gameTitle = DEFAULTS.GAME_TITLE;
		this.leaderboard = [];
		this.gameStatus = GAME_STATES.ENDED;

		// Element references
		this.elements = {};

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'gameTitle',
			'gamePin',
			'playerCount', 
			'leaderboard',
			'emptyState',
			'newGameBtn',
			'backToJoinBtn'
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
		// Button events
		if (this.elements.newGameBtn) {
			this.elements.newGameBtn.addEventListener('click', () => {
				this.handleNewGame();
			});
		}

		if (this.elements.backToJoinBtn) {
			this.elements.backToJoinBtn.addEventListener('click', () => {
				this.handleBackToJoin();
			});
		}
	}

	setupSocketEvents() {
		// Listen for leaderboard updates
		this.socket.on(SOCKET_EVENTS.LEADERBOARD_UPDATE, (data) => {
			this.handleLeaderboardUpdate(data);
		});

		// Listen for game state changes
		this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (data) => {
			this.handleGameStateUpdate(data);
		});

		// Connection events
		this.socket.on('connect', () => {
			this.onSocketConnect();
		});

		this.socket.on('disconnect', () => {
			this.onSocketDisconnect();
		});
	}

	initializeFromRoute() {
		// Extract game PIN from URL
		this.gamePin = this.router.extractGamePin(window.location.pathname);
		
		if (this.gamePin) {
			this.updateGamePin(this.gamePin);
		} else {
			this.notifications.showError('Neplatný PIN kód');
			this.handleBackToJoin();
		}
	}

	async loadGameData() {
		if (!this.gamePin) return;

		try {
			// Load game info from API
			const gameData = await this.api.getGame(this.gamePin);
			
			if (gameData) {
				this.updateGameInfo(gameData);
				
				// If game is not ended, redirect to appropriate view
				if (gameData.status === GAME_STATES.RUNNING || gameData.status === GAME_STATES.WAITING) {
					this.router.redirectToGame(this.gamePin);
					return;
				}
				
				// Load final leaderboard
				this.loadLeaderboard();
			} else {
				this.notifications.showError('Hra nenájdená');
				this.showEmptyState();
			}
		} catch (error) {
			console.error('Error loading game data:', error);
			this.notifications.showError('Chyba pri načítavaní údajov o hre');
			this.showEmptyState();
		}
	}

	async loadLeaderboard() {
		if (!this.gamePin) return;

		try {
			// Get final leaderboard from API or socket
			this.socket.emit(SOCKET_EVENTS.GET_LEADERBOARD, { pin: this.gamePin });
		} catch (error) {
			console.error('Error loading leaderboard:', error);
			this.notifications.showError('Chyba pri načítavaní výsledkov');
			this.showEmptyState();
		}
	}

	updateGameInfo(gameData) {
		this.gameTitle = gameData.title || DEFAULTS.GAME_TITLE;
		this.gameStatus = gameData.status;
		
		// Update UI
		this.dom.setText(this.elements.gameTitle, this.gameTitle);
		this.dom.setText(this.elements.playerCount, gameData.playerCount || 0);
	}

	updateGamePin(pin) {
		this.gamePin = pin;
		this.dom.setText(this.elements.gamePin, pin);
	}

	handleLeaderboardUpdate(data) {
		if (data.leaderboard && Array.isArray(data.leaderboard)) {
			this.leaderboard = data.leaderboard;
			this.renderLeaderboard();
		}
	}

	handleGameStateUpdate(data) {
		if (data.status) {
			this.gameStatus = data.status;
			
			// If game status changed from ended to running or waiting, redirect
			if (data.status === GAME_STATES.RUNNING || data.status === GAME_STATES.WAITING) {
				this.router.redirectToGame(this.gamePin);
			}
		}
	}

	renderLeaderboard() {
		if (!this.elements.leaderboard) return;

		// Clear existing leaderboard
		this.elements.leaderboard.innerHTML = '';

		if (!this.leaderboard || this.leaderboard.length === 0) {
			this.showEmptyState();
			return;
		}

		// Hide empty state
		this.hideEmptyState();

		// Sort leaderboard by score (descending)
		const sortedLeaderboard = [...this.leaderboard].sort((a, b) => b.score - a.score);

		// Render leaderboard items
		sortedLeaderboard.forEach((player, index) => {
			const item = this.createLeaderboardItem(player, index + 1);
			this.elements.leaderboard.appendChild(item);
		});
	}

	createLeaderboardItem(player, rank) {
		const item = document.createElement('div');
		item.className = 'leaderboard-item';
		
		// Add special styling for top 3
		if (rank === 1) {
			item.classList.add('winner');
		} else if (rank === 2) {
			item.classList.add('runner-up');
		} else if (rank === 3) {
			item.classList.add('third');
		}

		// Create rank element
		const rankElement = document.createElement('div');
		rankElement.className = 'player-rank';
		rankElement.textContent = `${rank}.`;

		// Create name element
		const nameElement = document.createElement('div');
		nameElement.className = 'player-name';
		nameElement.textContent = player.name || `Hráč ${player.id}`;

		// Create score element
		const scoreElement = document.createElement('div');
		scoreElement.className = 'player-score';
		scoreElement.textContent = `${player.score} bodov`;

		// Append elements
		item.appendChild(rankElement);
		item.appendChild(nameElement);
		item.appendChild(scoreElement);

		return item;
	}

	showEmptyState() {
		if (this.elements.emptyState) {
			this.elements.emptyState.style.display = 'block';
		}
		if (this.elements.leaderboard) {
			this.elements.leaderboard.style.display = 'none';
		}
	}

	hideEmptyState() {
		if (this.elements.emptyState) {
			this.elements.emptyState.style.display = 'none';
		}
		if (this.elements.leaderboard) {
			this.elements.leaderboard.style.display = 'flex';
		}
	}

	handleNewGame() {
		// Navigate to dashboard to create new game
		this.router.redirectToDashboard(this.gamePin);
	}

	handleBackToJoin() {
		// Navigate back to join screen
		this.router.redirectToJoin();
	}

	onSocketConnect() {
		console.log('Stage: Connected to server');
		// Rejoin game room if we have a PIN
		if (this.gamePin) {
			this.socket.emit(SOCKET_EVENTS.JOIN_PANEL, { pin: this.gamePin });
		}
	}

	onSocketDisconnect() {
		console.log('Stage: Disconnected from server');
		// Connection banner handles disconnect notifications
	}

	// Cleanup when leaving the page
	cleanup() {
		// Remove socket listeners specific to this app
		this.socket.off(SOCKET_EVENTS.LEADERBOARD_UPDATE);
		this.socket.off(SOCKET_EVENTS.GAME_STATE_UPDATE);
	}
}

// Initialize the stage app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.stageApp = new StageApp();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
	if (window.stageApp) {
		window.stageApp.cleanup();
	}
});

export { StageApp };