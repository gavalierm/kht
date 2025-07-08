import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { redirectToGameControl } from '../shared/navigation.js';
import { SOCKET_EVENTS } from '../shared/constants.js';

class DashboardApp {
	constructor() {
		// Initialize managers
		this.socket = defaultSocketManager.connect();
		this.notifications = defaultNotificationManager;
		this.dom = defaultDOMHelper;
		this.gameState = defaultGameState;
		
		// Element references
		this.elements = {};

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'gameTitle',
			'gameCreationCard',
			'createGameBtn',
			'gameCategory',
			'customPin',
			'moderatorPassword'
		]);

		this.bindEvents();
		this.setupSocketEvents();
		this.showGameCreation();
	}

	bindEvents() {
		// Game creation button
		if (this.elements.createGameBtn) {
			this.elements.createGameBtn.addEventListener('click', () => {
				this.handleCreateGame();
			});
		}

		// Allow Enter key to submit form
		document.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.handleCreateGame();
			}
		});
	}

	setupSocketEvents() {
		// Connection events
		this.socket.on('connect', () => {
			console.log('Dashboard: Connected to server');
		});

		this.socket.on('disconnect', () => {
			console.log('Dashboard: Disconnected from server');
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

	showGameCreation() {
		if (this.elements.gameCreationCard) {
			this.elements.gameCreationCard.style.display = 'block';
		}
		this.dom.setText(this.elements.gameTitle, '🎮 Vytvorenie novej hry');
	}

	async handleCreateGame() {
		try {
			const category = this.elements.gameCategory?.value || 'general';
			const customPin = this.elements.customPin?.value?.trim();
			const moderatorPassword = this.elements.moderatorPassword?.value?.trim();

			// Validate custom PIN if provided
			if (customPin && (customPin.length !== 6 || !/^[0-9]{6}$/.test(customPin))) {
				this.notifications.showError('PIN musí mať presne 6 číslic');
				return;
			}

			// Disable create button to prevent double-clicking
			this.setCreateButtonLoading(true);

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
			this.setCreateButtonLoading(false);
		}
	}

	setCreateButtonLoading(loading) {
		if (this.elements.createGameBtn) {
			this.elements.createGameBtn.disabled = loading;
			this.elements.createGameBtn.textContent = loading ? '⏳ Vytváram hru...' : '⚙️ Vytvoriť hru';
		}
	}

	handleGameCreated(data) {
		console.log('Game created successfully:', data);
		
		// Store moderator token for the control interface
		if (data.moderatorToken) {
			this.gameState.setModeratorToken(data.moderatorToken);
		}
		
		// Show success message
		this.notifications.showSuccess(`Hra úspešne vytvorená! PIN: ${data.gamePin}`);
		
		// Reset button state
		this.setCreateButtonLoading(false);
		
		// Redirect to control interface after short delay to show success message
		setTimeout(() => {
			redirectToGameControl(data.gamePin);
		}, 1500);
	}

	handleCreateGameError(error) {
		console.error('Game creation error:', error);
		this.notifications.showError(error.message || 'Chyba pri vytváraní hry');
		this.setCreateButtonLoading(false);
	}

	handleSocketError(error) {
		console.error('Socket error:', error);
		this.notifications.showError('Chyba spojenia so serverom');
		this.setCreateButtonLoading(false);
	}
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	new DashboardApp();
});