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
		this.hasConnectedBefore = false;

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
		
		// Check if this is a panel context (LED display) and hide UI elements
		const urlParams = new URLSearchParams(window.location.search);
		this.context = urlParams.get('context');
		if (this.context === 'panel') {
			// Hide the back button for panel view
			if (this.elements.backToJoinBtn) {
				this.elements.backToJoinBtn.classList.add('hidden');
			}
		}
		
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
			// Always load leaderboard for stage - this is the final results view
			await this.loadLeaderboard();
			
			// Also load game info for validation
			const gameData = await this.api.getGame(this.gamePin);
			if (gameData) {
				this.updateGameInfo(gameData);
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
				console.log('Loaded leaderboard data:', data);
				if (data.leaderboard && data.leaderboard.length > 0) {
					this.handleLeaderboardUpdate({ leaderboard: data.leaderboard });
				} else {
					console.log('No leaderboard data available');
					this.showEmptyState();
				}
			} else {
				console.error('Failed to load leaderboard, status:', response.status);
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

		// Add CSS-only particles to winner and handle score animations
		this.setupItemAnimations();

		// Show current player position
		this.showPlayerPosition(sortedLeaderboard);
	}

	setupItemAnimations() {
		const items = this.elements.top3Leaderboard.querySelectorAll('.top3-item');
		items.forEach((item) => {
			// Add CSS-only floating particles for winner
			if (item.classList.contains('first')) {
				this.addCSSParticleEffect(item);
			}

			// Add CSS-only score animation
			const scoreElement = item.querySelector('.top3-player-score');
			if (scoreElement) {
				this.addScoreAnimation(scoreElement);
			}
		});
	}

	addCSSParticleEffect(winnerItem) {
		// Add CSS-only floating particles around the winner
		// Remove any existing particles first
		const existingParticles = winnerItem.querySelectorAll('.particle1, .particle2, .particle3');
		existingParticles.forEach(particle => particle.remove());
		
		// Create particle elements that will be styled with CSS
		for (let i = 1; i <= 3; i++) {
			const particle = document.createElement('span');
			particle.className = `particle${i}`;
			winnerItem.appendChild(particle);
		}
	}

	addScoreAnimation(scoreElement) {
		// Add CSS-only score animation
		scoreElement.classList.add('score-reveal', 'animated');
	}


	showEmptyState() {
		if (this.elements.emptyState) {
			this.elements.emptyState.classList.remove('hidden');
			this.elements.emptyState.classList.add('visible');
		}
		if (this.elements.top3Leaderboard) {
			this.elements.top3Leaderboard.classList.add('hidden');
			this.elements.top3Leaderboard.classList.remove('visible-flex');
		}
		if (this.elements.playerPositionMessage) {
			this.elements.playerPositionMessage.classList.add('hidden');
			this.elements.playerPositionMessage.classList.remove('visible');
		}
	}

	hideEmptyState() {
		if (this.elements.emptyState) {
			this.elements.emptyState.classList.add('hidden');
			this.elements.emptyState.classList.remove('visible');
		}
		if (this.elements.top3Leaderboard) {
			this.elements.top3Leaderboard.classList.remove('hidden');
			this.elements.top3Leaderboard.classList.add('visible-flex');
		}
	}


	handleBackToJoin() {
		// Clear game state and saved session to prevent auto-redirect back to game
		this.gameState.clearGame();
		this.gameState.clearSavedSession();
		
		// Navigate back to join screen
		this.router.redirectToJoin();
	}

	onSocketConnect() {
		console.log('Stage: Connected to server');
		// Rejoin game room if we have a PIN
		if (this.gamePin) {
			this.socket.emit(SOCKET_EVENTS.JOIN_PANEL, { pin: this.gamePin });
			// Only reload leaderboard data if this is a REconnection (not initial connection)
			if (this.hasConnectedBefore) {
				console.log('Stage: Reconnected - reloading leaderboard data');
				setTimeout(() => this.loadLeaderboard(), 500);
			} else {
				console.log('Stage: Initial connection - skipping leaderboard reload');
				this.hasConnectedBefore = true;
			}
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
		if (!this.elements.playerPositionMessage || !sortedLeaderboard) {
			if (this.elements.playerPositionMessage) {
				this.elements.playerPositionMessage.classList.add('hidden');
				this.elements.playerPositionMessage.classList.remove('visible');
			}
			return;
		}

		let message = '';

		// If this is a panel context, show simple congratulations
		if (this.context === 'panel') {
			if (sortedLeaderboard.length > 0) {
				message = `🏆 Gratulujeme! 🏆`;
			} else {
				// Hide if no results
				this.elements.playerPositionMessage.classList.add('hidden');
				this.elements.playerPositionMessage.classList.remove('visible');
				return;
			}
		} else {
			// Regular context - show current player position
			if (!this.currentPlayer) {
				this.elements.playerPositionMessage.classList.add('hidden');
				this.elements.playerPositionMessage.classList.remove('visible');
				return;
			}

			// Use shared TOP 3 component to find player position
			const position = this.top3.findPlayerPosition(sortedLeaderboard, this.currentPlayer);
			
			if (!position) {
				this.elements.playerPositionMessage.classList.add('hidden');
				this.elements.playerPositionMessage.classList.remove('visible');
				return;
			}

			// Get formatted position message
			message = this.top3.getPositionMessage(position);
		}
		
		// Set text in the inner styled element
		const messageElement = this.elements.playerPositionMessage.querySelector('.congratulations-message');
		if (messageElement) {
			this.dom.setText(messageElement, message);
		}
		this.elements.playerPositionMessage.classList.remove('hidden');
		this.elements.playerPositionMessage.classList.add('visible');
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