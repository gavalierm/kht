import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
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
		this.gameTitle = DEFAULTS.GAME_TITLE;
		this.currentQuestion = null;
		this.gameStatus = GAME_STATES.WAITING;
		this.countdownTimer = null;
		this.timeRemaining = 0;

		// Element references
		this.elements = {};
		
		// Loading state
		this.isLoading = true;

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'panelPinCode',
			'panelCountdown',
			'panelLoadingOverlay',
			ELEMENT_IDS.PANEL_GAME_TITLE,
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
			this.gameTitle = data.title || DEFAULTS.GAME_TITLE;
			this.gamePin = data.gamePin;
			this.hideLoading();
			this.updateGameInfo();
			this.updateStatus(GAME_STATES.WAITING);
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

		// Leaderboard updates
		this.socket.on(SOCKET_EVENTS.PANEL_LEADERBOARD_UPDATE, (data) => {
			console.log('Leaderboard update:', data);
			this.updateLeaderboard(data.leaderboard);
		});

		// Connection events
		this.socket.on(SOCKET_EVENTS.DISCONNECT, () => {
			console.log('Panel disconnected from server');
			this.updateStatus('disconnected');
		});

		this.socket.on(SOCKET_EVENTS.RECONNECT, () => {
			console.log('Panel reconnected to server');
			this.showLoading('Obnovujem pripojenie...');
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
		if (this.elements.panelGameTitle) {
			this.dom.setText(this.elements.panelGameTitle, this.gameTitle);
		}
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
				`Otázka ${data.questionNumber}/${data.totalQuestions}`);
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

		const totalPlayers = leaderboard.length;

		// Clear current leaderboard
		this.dom.setHTML(this.elements.panelLeaderboardList, '');

		if (totalPlayers === 0) {
			const item = document.createElement('div');
			item.className = 'panel-leaderboard-item';
			item.innerHTML = `
				<span class="panel-player-name">Zatiaľ žiadni hráči</span>
				<span class="panel-player-score">-</span>
			`;
			this.elements.panelLeaderboardList.appendChild(item);
			return;
		}

		// Show only top 3 players with details
		const top3Players = leaderboard.slice(0, 3);
		top3Players.forEach((player, index) => {
			const item = document.createElement('div');
			item.className = 'panel-leaderboard-item';
			
			// Add medal emojis for top 3
			const medals = ['🥇', '🥈', '🥉'];
			const medal = medals[index] || '';
			
			item.innerHTML = `
				<span class="panel-player-name">${medal} ${player.name}</span>
				<span class="panel-player-score">${player.score}</span>
			`;
			this.elements.panelLeaderboardList.appendChild(item);
		});

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
}

// Initialize panel when page loads
document.addEventListener('DOMContentLoaded', () => {
	new PanelApp();
});