import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, UI_CONSTANTS } from '../shared/constants.js';

class CreateApp {
	constructor() {
		// Initialize managers
		this.socketManager = defaultSocketManager;
		this.socket = this.socketManager.connect();
		this.notifications = defaultNotificationManager;
		this.gameState = defaultGameState;
		this.dom = defaultDOMHelper;
		
		// Element references
		this.elements = {};
		
		// State
		this.isCreating = false;
        
		this.init();
	}

	async init() {
		this.bindElements();
		this.bindEvents();
		this.setupSocketEvents();
		
		// Focus on password input
		if (this.elements.moderatorPassword) {
			this.elements.moderatorPassword.focus();
		}
	}

	bindElements() {
		// Cache elements
		this.elements = {
			moderatorPassword: document.getElementById('moderatorPassword'),
			createGameBtn: document.getElementById('createGameBtn'),
			cancelBtn: document.getElementById('cancelBtn')
		};
	}

	bindEvents() {
		// Create button
		if (this.elements.createGameBtn) {
			this.elements.createGameBtn.addEventListener('click', () => this.createGame());
		}
		
		// Cancel button
		if (this.elements.cancelBtn) {
			this.elements.cancelBtn.addEventListener('click', () => this.cancel());
		}
		
		// Handle Enter key in password input
		if (this.elements.moderatorPassword) {
			this.elements.moderatorPassword.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					this.createGame();
				}
			});
		}
	}

	setupSocketEvents() {
		// Connection events
		this.socket.on(SOCKET_EVENTS.CONNECT, () => {
			console.log('Connected to server');
			this.enableCreateButton();
		});

		this.socket.on(SOCKET_EVENTS.DISCONNECT, () => {
			console.log('Disconnected from server');
			if (this.isCreating) {
				this.notifications.showError('Stratené spojenie so serverom');
				this.resetCreateButton();
			}
		});

		// Game creation events
		this.socket.on(SOCKET_EVENTS.GAME_CREATED, (data) => {
			this.handleGameCreated(data);
		});

		this.socket.on(SOCKET_EVENTS.CREATE_GAME_ERROR, (data) => {
			this.handleCreateGameError(data);
		});
	}

	enableCreateButton() {
		if (this.elements.createGameBtn && !this.isCreating) {
			this.elements.createGameBtn.disabled = false;
		}
	}

	setCreateButtonLoading(loading) {
		if (this.elements.createGameBtn) {
			this.elements.createGameBtn.disabled = loading;
			if (loading) {
				this.elements.createGameBtn.classList.add('loading');
				this.elements.createGameBtn.innerHTML = '<span class="loading-spinner"></span>Vytváram...';
			} else {
				this.elements.createGameBtn.classList.remove('loading');
				this.elements.createGameBtn.innerHTML = 'Vytvoriť hru';
			}
		}
	}

	resetCreateButton() {
		this.isCreating = false;
		this.setCreateButtonLoading(false);
		this.enableCreateButton();
	}

	async createGame() {
		if (this.isCreating) return;
		
		this.isCreating = true;
		this.setCreateButtonLoading(true);

		// Get form values
		const moderatorPassword = this.elements.moderatorPassword?.value.trim();

		// Validate moderator password (required)
		if (!moderatorPassword) {
			this.notifications.showError('Heslo moderátora je povinné');
			this.resetCreateButton();
			return;
		}

		if (moderatorPassword.length < 3) {
			this.notifications.showError('Heslo moderátora musí mať aspoň 3 znaky');
			this.resetCreateButton();
			return;
		}

		try {
			// Create game via socket
			const gameData = {
				moderatorPassword: moderatorPassword
			};
			
			this.socket.emit(SOCKET_EVENTS.CREATE_GAME, gameData);

		} catch (error) {
			console.error('Create game error:', error);
			this.notifications.showError('Chyba pri vytváraní hry');
			this.resetCreateButton();
		}
	}

	handleGameCreated(data) {
		console.log('Game created successfully:', data);
		
		// Store moderator token in localStorage (same format as control.js)
		if (data.moderatorToken) {
			localStorage.setItem(`moderator_token_${data.gamePin}`, data.moderatorToken);
			console.log('Stored moderator token for game:', data.gamePin);
		}
		
		this.notifications.showSuccess(`Hra vytvorená! PIN: ${data.gamePin}`);
		
		// Redirect to control panel with game PIN
		setTimeout(() => {
			window.location.href = `/game/${data.gamePin}`;
		}, 1000);
	}

	handleCreateGameError(data) {
		console.error('Game creation error:', data);
		this.notifications.showError(data.message || 'Chyba pri vytváraní hry');
		this.resetCreateButton();
	}

	cancel() {
		// Redirect back to join page
		window.location.href = '/join';
	}
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
	new CreateApp();
});