import { GameAPI } from '../shared/api.js';
import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultSessionChecker } from '../shared/sessionChecker.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, UI_CONSTANTS } from '../shared/constants.js';

class JoinApp {
	constructor() {
		// Initialize managers
		this.socketManager = defaultSocketManager;
		this.socket = this.socketManager.connect();
		this.notifications = defaultNotificationManager;
		this.gameState = defaultGameState;
		this.dom = defaultDOMHelper;
		this.sessionChecker = defaultSessionChecker;
		
		// Element references
		this.elements = {};
        
		this.init();
	}

	async init() {
		this.bindEvents();
		this.setupSocketEvents();
		this.setupLatencyMeasurement();
		
		// Check for saved session
		await this.checkInitialSession();
	}

	async checkInitialSession() {
		const result = await this.sessionChecker.checkSavedSession();
		
		if (result.shouldRedirect) {
			this.sessionChecker.showSessionMessage(result);
			window.location.href = result.redirectUrl;
		} else if (result.message) {
			this.sessionChecker.showSessionMessage(result);
		}
	}

	bindEvents() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			ELEMENT_IDS.JOIN_GAME_BTN,
			ELEMENT_IDS.GAME_PIN_INPUT,
			ELEMENT_IDS.LATENCY_DISPLAY
		]);

		// Event listeners
		this.dom.addEventListener(this.elements.joinGameBtn, 'click', () => this.joinGame());
		
		// Handle Enter key in PIN input
		this.dom.addEventListener(this.elements.gamePinInput, 'keypress', (e) => {
			if (e.key === 'Enter') {
				this.joinGame();
			}
		});
	}

	setupSocketEvents() {
		// Connection events
		this.socket.on(SOCKET_EVENTS.CONNECT, () => {
			console.log('Connected to server');
		});

		this.socket.on(SOCKET_EVENTS.DISCONNECT, () => {
			console.log('Disconnected from server');
		});

		// Game events
		this.socket.on(SOCKET_EVENTS.GAME_JOINED, (data) => {
			this.gameState.setPlayerToken(data.playerToken);
			this.gameState.setPlayerId(data.playerId);
			this.gameState.setGamePin(this.elements.gamePinInput.value.trim());
			
			this.notifications.showSuccess(`Pripojené ako Hráč ${data.playerId}`);
			// Redirect to game interface
			window.location.href = `/game/${this.gameState.gamePin}`;
		});

		this.socket.on(SOCKET_EVENTS.JOIN_ERROR, (data) => {
			this.notifications.showError(data.message);
			this.enableJoinButton();
		});
	}

	setupLatencyMeasurement() {
		if (this.elements.latencyDisplay) {
			this.socketManager.setupLatencyMeasurement(this.elements.latencyDisplay);
		}
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
		const gamePin = this.elements.gamePinInput?.value.trim() || null;

		if (!gamePin || gamePin.length < UI_CONSTANTS.MIN_PIN_LENGTH) {
			this.notifications.showError('PIN musí mať aspoň 6 znakov');
			this.enableJoinButton();
			return;
		}

		try {
			// Check if game exists via API
			const game = await GameAPI.getGame(gamePin);

			if (!game) {
				this.notifications.showError(`Hra s PIN ${gamePin} neexistuje`);
				this.enableJoinButton();
				return;
			}

			if (game.status === GAME_STATES.FINISHED) {
				this.notifications.showWarning('Hra už skončila');
				window.location.href = `/stage/${gamePin}`;
				return;
			}

			if (game.status === GAME_STATES.ENDED) {
				this.notifications.showInfo('Hra skončila - zobrazujem výsledky');
				window.location.href = `/stage/${gamePin}`;
				return;
			}

			// Join the game via socket
			this.socket.emit(SOCKET_EVENTS.JOIN_GAME, {
				gamePin: gamePin
			});

		} catch (error) {
			console.error('Join game error:', error);
			this.notifications.showError('Chyba pri pripojení k hre');
			this.enableJoinButton();
		}
	}
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
	new JoinApp();
});