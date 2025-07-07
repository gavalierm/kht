import { defaultSocketManager } from '../lib/socket.js';
import { defaultNotificationManager } from '../lib/notifications.js';
import { defaultRouter } from '../lib/router.js';
import { defaultDOMHelper } from '../lib/dom.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../constants.js';

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
		this.playerCount = 0;
		this.gameStatus = GAME_STATES.WAITING;

		// Element references
		this.elements = {};

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			ELEMENT_IDS.PANEL_GAME_TITLE,
			ELEMENT_IDS.PANEL_GAME_STATUS,
			ELEMENT_IDS.PANEL_PLAYER_COUNT,
			ELEMENT_IDS.PANEL_QUESTION_NUMBER,
			ELEMENT_IDS.PANEL_QUESTION_TEXT,
			ELEMENT_IDS.PANEL_OPTION_A,
			ELEMENT_IDS.PANEL_OPTION_B,
			ELEMENT_IDS.PANEL_OPTION_C,
			ELEMENT_IDS.PANEL_OPTION_D,
			ELEMENT_IDS.PANEL_LEADERBOARD_LIST,
			ELEMENT_IDS.PANEL_OPTIONS_GRID
		]);

		// Get container element
		this.elements.container = this.dom.querySelector('.panel-container');
		
		// Extract game PIN from URL
		this.extractGamePin();
		
		// Setup socket events
		this.setupSocketEvents();
		
		// Connect to game when socket is ready
		this.socket.on(SOCKET_EVENTS.CONNECT, () => {
			console.log('Panel connected to server');
			if (this.gamePin) {
				this.joinPanel();
			} else {
				this.showError('No game PIN found in URL');
			}
		});
	}

	extractGamePin() {
		const path = window.location.pathname;
		// Extract PIN from /app/123456/panel
		const gamePin = this.router.extractGamePin(path);
		if (gamePin) {
			this.gamePin = gamePin;
			console.log('Extracted game PIN:', this.gamePin);
		} else {
			console.error('Could not extract game PIN from URL:', path);
		}
	}

	setupSocketEvents() {
		// Panel join events
		this.socket.on(SOCKET_EVENTS.PANEL_GAME_JOINED, (data) => {
			console.log('Panel joined game:', data);
			this.gameTitle = data.title || DEFAULTS.GAME_TITLE;
			this.gamePin = data.gamePin;
			this.updateGameInfo();
			this.updateStatus(GAME_STATES.WAITING);
		});

		this.socket.on(SOCKET_EVENTS.PANEL_JOIN_ERROR, (data) => {
			console.error('Panel join error:', data.message);
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
			[GAME_STATES.WAITING]: 'Waiting for game to start',
			[GAME_STATES.QUESTION_ACTIVE]: 'Question in progress',
			[GAME_STATES.RESULTS]: 'Showing results',
			[GAME_STATES.FINISHED]: 'Game finished',
			'disconnected': 'Disconnected'
		};

		if (this.elements.panelGameStatus) {
			this.dom.setText(this.elements.panelGameStatus, statusText[status] || status);
		}

		// Update container class for styling
		this.dom.removeClass(this.elements.container, CSS_CLASSES.PANEL_WAITING);
		this.dom.removeClass(this.elements.container, CSS_CLASSES.PANEL_ACTIVE);
		this.dom.removeClass(this.elements.container, CSS_CLASSES.PANEL_FINISHED);
		
		if (status === GAME_STATES.WAITING) {
			this.dom.addClass(this.elements.container, CSS_CLASSES.PANEL_WAITING);
		} else if (status === GAME_STATES.FINISHED) {
			this.dom.addClass(this.elements.container, CSS_CLASSES.PANEL_FINISHED);
		}
	}

	updatePlayerCount(count) {
		this.playerCount = count;
		if (this.elements.panelPlayerCount) {
			this.dom.setText(this.elements.panelPlayerCount, 
				`${count} player${count !== 1 ? 's' : ''}`);
		}
	}

	showQuestion(data) {
		this.currentQuestion = data;
		this.updateStatus(GAME_STATES.QUESTION_ACTIVE);

		// Update question number
		if (this.elements.panelQuestionNumber) {
			this.dom.setText(this.elements.panelQuestionNumber, 
				`Question ${data.questionNumber}/${data.totalQuestions}`);
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
	}

	showResults(data) {
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
		this.updateStatus(GAME_STATES.WAITING);
		
		if (this.elements.panelQuestionText) {
			this.dom.setText(this.elements.panelQuestionText, 'Waiting for next question...');
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

		// Clear current leaderboard
		this.dom.setHTML(this.elements.panelLeaderboardList, '');

		if (leaderboard.length === 0) {
			const item = document.createElement('div');
			item.className = 'panel-leaderboard-item';
			item.innerHTML = `
				<span class="panel-player-name">No players yet</span>
				<span class="panel-player-score">-</span>
			`;
			this.elements.panelLeaderboardList.appendChild(item);
			this.updatePlayerCount(0);
			return;
		}

		// Add leaderboard items (top 10)
		leaderboard.slice(0, DEFAULTS.LEADERBOARD_DISPLAY_COUNT).forEach((player, index) => {
			const item = document.createElement('div');
			item.className = 'panel-leaderboard-item';
			item.innerHTML = `
				<span class="panel-player-name">${index + 1}. ${player.name}</span>
				<span class="panel-player-score">${player.score}</span>
			`;
			this.elements.panelLeaderboardList.appendChild(item);
		});

		this.updatePlayerCount(leaderboard.length);
	}

	showError(message) {
		console.error('Panel error:', message);
		
		if (this.elements.panelQuestionText) {
			this.dom.setText(this.elements.panelQuestionText, `Error: ${message}`);
		}
		
		if (this.elements.panelGameStatus) {
			this.dom.setText(this.elements.panelGameStatus, 'Error');
		}
	}
}

// Initialize panel when page loads
document.addEventListener('DOMContentLoaded', () => {
	new PanelApp();
});