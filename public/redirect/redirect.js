import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultAPI } from '../shared/api.js';
import { GAME_STATES, DEFAULTS } from '../shared/constants.js';

class RedirectHandler {
	constructor() {
		// Initialize managers
		this.notifications = defaultNotificationManager;
		this.router = defaultRouter;
		this.dom = defaultDOMHelper;
		this.api = defaultAPI;
		
		// Redirect state
		this.gamePin = null;
		this.gameData = null;
		this.retryCount = 0;
		this.maxRetries = 3;
		this.redirectTimeout = null;

		// Element references
		this.elements = {};

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'loadingSection',
			'errorSection',
			'loadingSubtext',
			'progressFill',
			'gameInfo',
			'gamePin',
			'gameTitle',
			'errorTitle',
			'errorMessage',
			'retryBtn',
			'backToJoinBtn'
		]);

		// Setup event listeners
		this.setupEventListeners();
		
		// Initialize from route
		this.initializeFromRoute();
		
		// Start redirect process
		this.startRedirectProcess();
	}

	setupEventListeners() {
		// Error section buttons
		if (this.elements.retryBtn) {
			this.elements.retryBtn.addEventListener('click', () => {
				this.handleRetry();
			});
		}

		if (this.elements.backToJoinBtn) {
			this.elements.backToJoinBtn.addEventListener('click', () => {
				this.handleBackToJoin();
			});
		}
	}

	initializeFromRoute() {
		// Extract game PIN from URL
		this.gamePin = this.router.extractGamePin(window.location.pathname);
		
		if (!this.gamePin || !/^\d{6}$/.test(this.gamePin)) {
			this.showError(
				'Neplatný PIN kód',
				'PIN kód musí obsahovať presne 6 číslic. Skontrolujte správnosť zadaného kódu.'
			);
			return;
		}

		// Update UI with PIN
		this.updateGamePin(this.gamePin);
	}

	async startRedirectProcess() {
		if (!this.gamePin) return;

		try {
			// Show loading state
			this.showLoadingState('Kontrolujem stav hry...');
			this.updateProgress(20);

			// Add small delay for better UX
			await this.delay(500);

			// Fetch game data
			this.updateLoadingText('Načítavam údaje o hre...');
			this.updateProgress(50);
			
			const gameData = await this.api.getGame(this.gamePin);
			this.updateProgress(80);

			if (!gameData) {
				this.showGameNotFoundError();
				return;
			}

			// Store game data and show info
			this.gameData = gameData;
			this.showGameInfo(gameData);
			
			// Add delay before redirect for better UX
			this.updateLoadingText('Presmerovávam...');
			this.updateProgress(100);
			await this.delay(800);

			// Perform redirect based on game status
			this.performRedirect(gameData);

		} catch (error) {
			console.error('Redirect error:', error);
			this.showNetworkError();
		}
	}

	async performRedirect(gameData) {
		const status = gameData.status;

		try {
			switch (status) {
				case GAME_STATES.RUNNING:
					// Game is active - redirect to game view
					this.updateLoadingText('Pripájam k aktívnej hre...');
					await this.delay(300);
					this.router.navigateToGame(this.gamePin);
					break;

				case GAME_STATES.ENDED:
					// Game has ended - redirect to results
					this.updateLoadingText('Načítavam výsledky...');
					await this.delay(300);
					this.router.navigateToStage(this.gamePin);
					break;

				case GAME_STATES.WAITING:
					// Game is waiting to start - redirect to game view (waiting room)
					this.updateLoadingText('Pripájam k čakajúcej hre...');
					await this.delay(300);
					this.router.navigateToGame(this.gamePin);
					break;

				default:
					// Unknown status - show error
					this.showError(
						'Neznámy stav hry',
						`Hra je v neznámom stave (${status}). Skúste to znovu neskôr.`
					);
					break;
			}
		} catch (error) {
			console.error('Redirect navigation error:', error);
			this.showError(
				'Chyba presmerovania',
				'Nie je možné presmerovať na požadovanú stránku. Skúste to znovu.'
			);
		}
	}

	showLoadingState(text) {
		this.updateLoadingText(text);
		this.showSection('loadingSection');
		this.hideSection('errorSection');
	}

	showGameInfo(gameData) {
		if (this.elements.gameInfo) {
			this.dom.setText(this.elements.gameTitle, gameData.title || DEFAULTS.GAME_TITLE);
			this.elements.gameInfo.style.display = 'block';
		}
	}

	showGameNotFoundError() {
		this.showError(
			'Hra nenájdená',
			`Hra s PIN kódom ${this.gamePin} neexistuje alebo už bola odstránená. Skontrolujte správnosť kódu.`
		);
	}

	showNetworkError() {
		this.showError(
			'Chyba pripojenia',
			'Nie je možné načítať údaje o hre. Skontrolujte internetové pripojenie a skúste to znovu.'
		);
	}

	showError(title, message) {
		this.dom.setText(this.elements.errorTitle, title);
		this.dom.setText(this.elements.errorMessage, message);
		this.showSection('errorSection');
		this.hideSection('loadingSection');
	}

	updateGamePin(pin) {
		this.dom.setText(this.elements.gamePin, pin);
	}

	updateLoadingText(text) {
		this.dom.setText(this.elements.loadingSubtext, text);
	}

	updateProgress(percentage) {
		if (this.elements.progressFill) {
			this.elements.progressFill.style.width = `${percentage}%`;
		}
	}

	showSection(sectionId) {
		if (this.elements[sectionId]) {
			this.elements[sectionId].style.display = 'flex';
		}
	}

	hideSection(sectionId) {
		if (this.elements[sectionId]) {
			this.elements[sectionId].style.display = 'none';
		}
	}

	handleRetry() {
		this.retryCount++;
		
		if (this.retryCount >= this.maxRetries) {
			this.showError(
				'Príliš veľa pokusov',
				'Dosiahli ste maximálny počet pokusov. Skúste to neskôr alebo sa vráťte na úvodnú stránku.'
			);
			return;
		}

		// Reset state and try again
		this.updateProgress(0);
		this.startRedirectProcess();
	}

	handleBackToJoin() {
		this.router.navigateToJoin();
	}

	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	// Cleanup when leaving the page
	cleanup() {
		if (this.redirectTimeout) {
			clearTimeout(this.redirectTimeout);
		}
	}
}

// Initialize the redirect handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.redirectHandler = new RedirectHandler();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
	if (window.redirectHandler) {
		window.redirectHandler.cleanup();
	}
});

export { RedirectHandler };