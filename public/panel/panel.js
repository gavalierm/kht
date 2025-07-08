import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultTop3Leaderboard } from '../shared/components/top3Leaderboard.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../shared/constants.js';

class PanelApp {
	constructor() {
		// Initialize managers
		this.socket = defaultSocketManager.connect();
		this.notifications = defaultNotificationManager;
		this.router = defaultRouter;
		this.dom = defaultDOMHelper;
		
		// Panel state
		this.gamePin = null;
		this.currentQuestion = null;
		this.gameStatus = GAME_STATES.WAITING;
		this.countdownTimer = null;
		this.timeRemaining = 0;

		// Element references
		this.elements = {};
		
		// Loading state
		this.isLoading = true;
		
		// Initialize TOP 3 component
		this.top3 = defaultTop3Leaderboard;

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'panelPinCode',
			'panelCountdown',
			'panelLoadingOverlay',
			ELEMENT_IDS.PANEL_TITLE,
			ELEMENT_IDS.PANEL_QUESTION_NUMBER,
			ELEMENT_IDS.PANEL_QUESTION_TEXT,
			ELEMENT_IDS.PANEL_OPTION_A,
			ELEMENT_IDS.PANEL_OPTION_B,
			ELEMENT_IDS.PANEL_OPTION_C,
			ELEMENT_IDS.PANEL_OPTION_D,
			ELEMENT_IDS.PANEL_LEADERBOARD_LIST,
			ELEMENT_IDS.PANEL_OPTIONS_GRID
		]);

		// Get container and loading elements
		this.elements.container = this.dom.querySelector('.panel-container');
		this.elements.panelLoadingOverlay = this.dom.querySelector('#panelLoadingOverlay');
		this.elements.loadingText = this.dom.querySelector('.panel-loading-text');
		this.elements.timerText = this.dom.querySelector('.timer-text');
		
		// Extract game PIN from URL
		this.extractGamePin();
		
		// Setup socket events
		this.setupSocketEvents();
		
		// Show loading initially
		this.showLoading('Pripájame sa k serveru...');
		
		// Connect to game when socket is ready
		this.socket.on(SOCKET_EVENTS.CONNECT, () => {
			console.log('Panel connected to server');
			this.updateLoadingText('Pripájame sa k hre...');
			if (this.gamePin) {
				this.joinPanel();
			} else {
				this.showError('No game PIN found in URL');
			}
		});
	}

	extractGamePin() {
		const path = window.location.pathname;
		// Extract PIN from /panel/123456
		const gamePin = this.router.extractGamePin(path);
		if (gamePin) {
			this.gamePin = gamePin;
			this.updatePinDisplay();
			console.log('Extracted game PIN:', this.gamePin);
		} else {
			console.error('Could not extract game PIN from URL:', path);
		}
	}

	updatePinDisplay() {
		if (this.elements.panelPinCode && this.gamePin) {
			this.dom.setText(this.elements.panelPinCode, `#${this.gamePin}`);
		}
	}

	setupSocketEvents() {
		// Panel join events
		this.socket.on(SOCKET_EVENTS.PANEL_GAME_JOINED, (data) => {
			console.log('Panel joined game:', data);
			this.gamePin = data.gamePin;
			this.showPanelInterface();
			this.updateGameInfo();
			// Only update status if server provides current game status, otherwise keep current state
			if (data.gameStatus) {
				this.updateStatus(data.gameStatus);
			} else {
				// If no game status provided, assume waiting state only for initial connection
				if (!this.gameStatus || this.gameStatus === 'disconnected') {
					this.updateStatus(GAME_STATES.WAITING);
				}
				// Otherwise keep the current state (question active, results, etc.)
			}
		});

		this.socket.on(SOCKET_EVENTS.PANEL_JOIN_ERROR, (data) => {
			console.error('Panel join error:', data.message);
			this.hideLoading();
			this.showError(data.message);
		});

		// Question events
		this.socket.on(SOCKET_EVENTS.PANEL_QUESTION_STARTED, (data) => {
			console.log('Question started:', data);
			this.showQuestion(data);
		});

		this.socket.on(SOCKET_EVENTS.PANEL_QUESTION_ENDED, (data) => {
			console.log('Question ended:', data);
			this.showResults(data);
		});

		this.socket.on(SOCKET_EVENTS.PANEL_GAME_ENDED, (data) => {
			console.log('Game ended:', data);
			this.showGameEnded(data);
		});

		// Also listen for generic game_ended event
		this.socket.on('game_ended', (data) => {
			console.log('Game ended (generic event):', data);
			this.showGameEnded(data);
		});

		// Leaderboard updates
		this.socket.on(SOCKET_EVENTS.PANEL_LEADERBOARD_UPDATE, (data) => {
			console.log('Leaderboard update:', data);
			this.updateLeaderboard(data.leaderboard);
		});

		// Game state updates
		this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (data) => {
			console.log('Game state update:', data);
			this.handleGameStateUpdate(data);
		});

		// Connection events
		this.socket.on(SOCKET_EVENTS.DISCONNECT, () => {
			console.log('Panel disconnected from server');
			// Connection banner handles disconnect notifications
		});

		this.socket.on(SOCKET_EVENTS.RECONNECT, () => {
			console.log('Panel reconnected to server');
			// Connection banner handles reconnection notifications
			if (this.gamePin) {
				this.joinPanel();
			}
		});
	}

	joinPanel() {
		if (!this.gamePin) {
			this.showError('No game PIN available');
			return;
		}

		console.log('Joining panel for game:', this.gamePin);
		this.socket.emit(SOCKET_EVENTS.JOIN_PANEL, {
			gamePin: this.gamePin
		});
	}

	updateGameInfo() {
	}

	updateStatus(status) {
		this.gameStatus = status;
		
		const statusText = {
			[GAME_STATES.WAITING]: 'Pripravte sa na kvíz!',
			[GAME_STATES.QUESTION_ACTIVE]: 'Odpovedajte na otázku',
			[GAME_STATES.RESULTS]: 'Zobrazujú sa výsledky',
			[GAME_STATES.FINISHED]: 'Hra skončila',
			'disconnected': 'Pripojenie prerušené'
		};

		// Use question text area for status messages
		if (this.elements.panelQuestionText && status !== GAME_STATES.QUESTION_ACTIVE) {
			this.dom.setText(this.elements.panelQuestionText, statusText[status] || status);
		}

		// Update container class for styling
		this.dom.removeClass(this.elements.container, CSS_CLASSES.PANEL_WAITING);
		this.dom.removeClass(this.elements.container, CSS_CLASSES.PANEL_ACTIVE);
		this.dom.removeClass(this.elements.container, CSS_CLASSES.PANEL_FINISHED);
		
		if (status === GAME_STATES.WAITING) {
			this.dom.addClass(this.elements.container, CSS_CLASSES.PANEL_WAITING);
			// Show spinner in countdown during waiting
			this.dom.addClass(this.elements.panelCountdown, 'waiting');
		} else if (status === GAME_STATES.FINISHED) {
			this.dom.addClass(this.elements.container, CSS_CLASSES.PANEL_FINISHED);
		} else {
			// Remove waiting spinner when not waiting
			this.dom.removeClass(this.elements.panelCountdown, 'waiting');
		}
	}


	showQuestion(data) {
		this.currentQuestion = data;
		this.updateStatus(GAME_STATES.QUESTION_ACTIVE);

		// Update question number
		if (this.elements.panelQuestionNumber) {
			this.dom.setText(this.elements.panelQuestionNumber, 
				`${data.questionNumber}/${data.totalQuestions}`);
		}

		// Update question text
		if (this.elements.panelQuestionText) {
			this.dom.setText(this.elements.panelQuestionText, data.question);
		}

		// Update options
		const optionElements = [
			this.elements.panelOptionA,
			this.elements.panelOptionB,
			this.elements.panelOptionC,
			this.elements.panelOptionD
		];

		data.options.forEach((option, index) => {
			if (optionElements[index]) {
				this.dom.setText(optionElements[index], option);
			}
		});

		// Reset option styles
		if (this.elements.panelOptionsGrid) {
			const options = this.elements.panelOptionsGrid.querySelectorAll('.panel-option');
			options.forEach(el => {
				this.dom.removeClass(el, CSS_CLASSES.CORRECT);
				this.dom.removeClass(el, CSS_CLASSES.SELECTED);
			});
		}

		// Start countdown
		this.startCountdown(data.timeLimit || 30);
	}

	startCountdown(timeLimit) {
		this.timeRemaining = timeLimit;
		this.showCountdown();
		
		if (this.countdownTimer) {
			clearInterval(this.countdownTimer);
		}
		
		this.countdownTimer = setInterval(() => {
			this.timeRemaining--;
			this.updateCountdown();
			
			if (this.timeRemaining <= 0) {
				this.stopCountdown();
			}
		}, 1000);
	}

	stopCountdown() {
		if (this.countdownTimer) {
			clearInterval(this.countdownTimer);
			this.countdownTimer = null;
		}
		this.hideCountdown();
	}

	showCountdown() {
		if (this.elements.panelCountdown) {
			this.elements.panelCountdown.style.display = 'block';
			this.updateCountdown();
		}
	}

	hideCountdown() {
		if (this.elements.panelCountdown) {
			this.elements.panelCountdown.style.display = 'none';
		}
	}

	updateCountdown() {
		if (this.elements.timerText) {
			this.dom.setText(this.elements.timerText, this.timeRemaining);
		}
		
		if (this.elements.panelCountdown) {
			// Change color when time is running out
			if (this.timeRemaining <= 10) {
				this.elements.panelCountdown.style.background = 'red';
				this.elements.panelCountdown.style.color = 'white';
			} else {
				this.elements.panelCountdown.style.background = 'white';
				this.elements.panelCountdown.style.color = 'var(--primary-purple)';
			}
		}
	}

	showResults(data) {
		this.stopCountdown();
		this.updateStatus(GAME_STATES.RESULTS);

		// Highlight correct answer
		if (data.correctAnswer !== undefined && this.elements.panelOptionsGrid) {
			const options = this.elements.panelOptionsGrid.querySelectorAll('.panel-option');
			if (options && options[data.correctAnswer]) {
				this.dom.addClass(options[data.correctAnswer], CSS_CLASSES.CORRECT);
			}
		}

		// Update leaderboard
		if (data.leaderboard) {
			this.updateLeaderboard(data.leaderboard);
		}

		// Auto-reset after a delay
		setTimeout(() => {
			this.resetToWaiting();
		}, 10000);
	}

	resetToWaiting() {
		this.stopCountdown();
		this.updateStatus(GAME_STATES.WAITING);
		
		if (this.elements.panelQuestionText) {
			this.dom.setText(this.elements.panelQuestionText, 'Pripravte sa na ďalšiu otázku!');
		}

		// Reset options
		const optionElements = [
			this.elements.panelOptionA,
			this.elements.panelOptionB,
			this.elements.panelOptionC,
			this.elements.panelOptionD
		];

		optionElements.forEach(el => {
			if (el) {
				this.dom.setText(el, '-');
			}
		});

		// Reset option styles
		if (this.elements.panelOptionsGrid) {
			const options = this.elements.panelOptionsGrid.querySelectorAll('.panel-option');
			options.forEach(el => {
				this.dom.removeClass(el, CSS_CLASSES.CORRECT);
				this.dom.removeClass(el, CSS_CLASSES.SELECTED);
			});
		}
	}

	updateLeaderboard(leaderboard) {
		if (!this.elements.panelLeaderboardList || !leaderboard) return;

		// Use shared TOP 3 component to render leaderboard
		this.top3.render(
			this.elements.panelLeaderboardList,
			leaderboard,
			'panel-leaderboard-item',
			'panel-player-name',
			'panel-player-score',
			'Zatiaľ žiadni hráči'
		);
	}

	showError(message) {
		console.error('Panel error:', message);
		this.hideLoading();
		
		if (this.elements.panelQuestionText) {
			this.dom.setText(this.elements.panelQuestionText, `Chyba: ${message}`);
		}
		
		// Show error notification
		this.notifications.showError(message);
	}

	// Loading state management methods (like in game.js)
	showLoading(message = 'Načítavam...') {
		this.isLoading = true;
		if (this.elements.panelLoadingOverlay) {
			this.dom.removeClass(this.elements.panelLoadingOverlay, 'hidden');
		}
		this.updateLoadingText(message);
	}

	hideLoading() {
		this.isLoading = false;
		if (this.elements.panelLoadingOverlay) {
			this.dom.addClass(this.elements.panelLoadingOverlay, 'hidden');
		}
	}

	updateLoadingText(message) {
		if (this.elements.loadingText) {
			this.dom.setText(this.elements.loadingText, message);
		}
	}

	showGameEnded(data) {
		console.log('Showing game ended view:', data);
		
		// Update status to finished
		this.updateStatus(GAME_STATES.FINISHED);
		
		// Show final leaderboard
		if (data.leaderboard && this.elements.panelLeaderboardList) {
			this.updateLeaderboard(data.leaderboard);
		}
		
		// Update question info to show game completed
		if (this.elements.panelQuestionText) {
			this.dom.setText(this.elements.panelQuestionText, `🏆 Hra ukončená! Celkovo ${data.totalQuestions} otázok.`);
		}
		
		// Hide options since game is over
		if (this.elements.panelOptionsGrid) {
			this.dom.addClass(this.elements.panelOptionsGrid, 'hidden');
		}
		
		// Show completion message
		this.notifications.showSuccess('Hra bola úspešne ukončená!');
		
		// Redirect to stage interface after 10 seconds to show final results
		setTimeout(() => {
			if (this.gamePin) {
				console.log(`Redirecting panel to stage interface for game ${this.gamePin}`);
				window.location.href = `/stage/${this.gamePin}`;
			}
		}, 10000);
	}

	handleGameStateUpdate(data) {
		console.log('Handling game state update:', data);
		
		if (data.status === 'waiting') {
			// Game is waiting for next question to start
			this.updateStatus(GAME_STATES.WAITING);
			
			// Show waiting message
			if (this.elements.panelQuestionText) {
				this.dom.setText(this.elements.panelQuestionText, 
					`Čakáme na otázku ${data.questionNumber}/${data.totalQuestions}...`);
			}
			
			// Hide options during waiting
			if (this.elements.panelOptionsGrid) {
				this.dom.addClass(this.elements.panelOptionsGrid, 'hidden');
			}
			
			// Hide countdown
			if (this.elements.countdownText) {
				this.dom.setText(this.elements.countdownText, '');
				this.dom.addClass(this.elements.countdownText, 'hidden');
			}
			
		} else if (data.status === 'finished') {
			this.updateStatus(GAME_STATES.FINISHED);
		}
	}

	showPanelInterface() {
		// Hide loading overlay
		this.hideLoading();
		
		// Show panel container
		if (this.elements.container) {
			this.dom.addClass(this.elements.container, 'visible');
		}
	}

	hidePanelInterface() {
		// Hide panel container
		if (this.elements.container) {
			this.dom.removeClass(this.elements.container, 'visible');
		}
	}
}

// Initialize panel when page loads
document.addEventListener('DOMContentLoaded', () => {
	new PanelApp();
});