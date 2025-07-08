import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultAPI } from '../shared/api.js';
import { defaultTop3Leaderboard } from '../shared/components/top3Leaderboard.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS, API_ENDPOINTS } from '../shared/constants.js';

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
		this.leaderboard = [];
		this.gameStatus = GAME_STATES.ENDED;

		// Element references
		this.elements = {};
		
		// Player data from localStorage
		this.currentPlayer = this.getCurrentPlayerData();

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'gamePin',
			'top3Leaderboard',
			'playerPositionMessage',
			'emptyState',
			'backToJoinBtn'
		]);

		// Initialize TOP 3 component
		this.top3 = defaultTop3Leaderboard;
		
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
			// Get final leaderboard from API
			const response = await fetch(API_ENDPOINTS.GAME_LEADERBOARD(this.gamePin));
			if (response.ok) {
				const data = await response.json();
				this.handleLeaderboardUpdate({ leaderboard: data.leaderboard });
			} else {
				throw new Error('Failed to load leaderboard');
			}
		} catch (error) {
			console.error('Error loading leaderboard:', error);
			this.notifications.showError('Chyba pri načítavaní výsledkov');
			this.showEmptyState();
		}
	}

	updateGameInfo(gameData) {
		this.gameStatus = gameData.status;
		// Game info updated - no UI updates needed for stage
	}

	updateGamePin(pin) {
		this.gamePin = pin;
		this.dom.setText(this.elements.gamePin, `#${pin}`);
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
		if (!this.elements.top3Leaderboard) return;

		if (!this.leaderboard || this.leaderboard.length === 0) {
			this.showEmptyState();
			return;
		}

		// Hide empty state
		this.hideEmptyState();

		// Use shared TOP 3 component to render leaderboard
		const sortedLeaderboard = this.top3.render(
			this.elements.top3Leaderboard,
			this.leaderboard,
			'top3-item',
			'top3-player-name',
			'top3-player-score',
			'Žiadni hráči'
		);

		// Show current player position
		this.showPlayerPosition(sortedLeaderboard);
	}


	showEmptyState() {
		if (this.elements.emptyState) {
			this.elements.emptyState.style.display = 'block';
		}
		if (this.elements.top3Leaderboard) {
			this.elements.top3Leaderboard.style.display = 'none';
		}
		if (this.elements.playerPositionMessage) {
			this.elements.playerPositionMessage.style.display = 'none';
		}
	}

	hideEmptyState() {
		if (this.elements.emptyState) {
			this.elements.emptyState.style.display = 'none';
		}
		if (this.elements.top3Leaderboard) {
			this.elements.top3Leaderboard.style.display = 'flex';
		}
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

	getCurrentPlayerData() {
		// Try to get player data from localStorage
		try {
			const gameState = localStorage.getItem('gameState');
			if (gameState) {
				const parsed = JSON.parse(gameState);
				return {
					id: parsed.playerId,
					name: parsed.playerName,
					token: parsed.playerToken
				};
			}
		} catch (error) {
			console.log('No player data found in localStorage');
		}
		return null;
	}

	showPlayerPosition(sortedLeaderboard) {
		if (!this.elements.playerPositionMessage || !this.currentPlayer || !sortedLeaderboard) {
			this.elements.playerPositionMessage.style.display = 'none';
			return;
		}

		// Use shared TOP 3 component to find player position
		const position = this.top3.findPlayerPosition(sortedLeaderboard, this.currentPlayer);
		
		if (!position) {
			this.elements.playerPositionMessage.style.display = 'none';
			return;
		}

		// Get formatted position message
		const message = this.top3.getPositionMessage(position);
		
		this.dom.setText(this.elements.playerPositionMessage, message);
		this.elements.playerPositionMessage.style.display = 'block';
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