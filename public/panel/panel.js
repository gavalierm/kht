class PanelApp {
	constructor() {
		this.socket = io();
		this.gamePin = null;
		this.gameTitle = 'Quiz Game';
		this.currentQuestion = null;
		this.playerCount = 0;
		this.gameStatus = 'waiting';

		// Element references
		this.elements = {
			gameTitle: document.getElementById('panelGameTitle'),
			gameStatus: document.getElementById('panelGameStatus'),
			playerCount: document.getElementById('panelPlayerCount'),
			questionNumber: document.getElementById('panelQuestionNumber'),
			questionText: document.getElementById('panelQuestionText'),
			optionA: document.getElementById('panelOptionA'),
			optionB: document.getElementById('panelOptionB'),
			optionC: document.getElementById('panelOptionC'),
			optionD: document.getElementById('panelOptionD'),
			leaderboardList: document.getElementById('panelLeaderboardList'),
			optionsGrid: document.getElementById('panelOptionsGrid'),
			container: document.querySelector('.panel-container')
		};

		this.init();
	}

	init() {
		// Extract game PIN from URL
		this.extractGamePin();
		
		// Setup socket events
		this.setupSocketEvents();
		
		// Connect to game when socket is ready
		this.socket.on('connect', () => {
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
		const match = path.match(/\/app\/(\d+)\/panel/);
		if (match) {
			this.gamePin = match[1];
			console.log('Extracted game PIN:', this.gamePin);
		} else {
			console.error('Could not extract game PIN from URL:', path);
		}
	}

	setupSocketEvents() {
		// Panel join events
		this.socket.on('panel_game_joined', (data) => {
			console.log('Panel joined game:', data);
			this.gameTitle = data.title || 'Quiz Game';
			this.gamePin = data.gamePin;
			this.updateGameInfo();
			this.updateStatus('waiting');
		});

		this.socket.on('panel_join_error', (data) => {
			console.error('Panel join error:', data.message);
			this.showError(data.message);
		});

		// Question events
		this.socket.on('panel_question_started', (data) => {
			console.log('Question started:', data);
			this.showQuestion(data);
		});

		this.socket.on('panel_question_ended', (data) => {
			console.log('Question ended:', data);
			this.showResults(data);
		});

		// Leaderboard updates
		this.socket.on('panel_leaderboard_update', (data) => {
			console.log('Leaderboard update:', data);
			this.updateLeaderboard(data.leaderboard);
		});

		// Connection events
		this.socket.on('disconnect', () => {
			console.log('Panel disconnected from server');
			this.updateStatus('disconnected');
		});

		this.socket.on('reconnect', () => {
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
		this.socket.emit('join_panel', {
			gamePin: this.gamePin
		});
	}

	updateGameInfo() {
		if (this.elements.gameTitle) {
			this.elements.gameTitle.textContent = this.gameTitle;
		}
	}

	updateStatus(status) {
		this.gameStatus = status;
		
		const statusText = {
			'waiting': 'Waiting for game to start',
			'question_active': 'Question in progress',
			'results': 'Showing results',
			'finished': 'Game finished',
			'disconnected': 'Disconnected'
		};

		if (this.elements.gameStatus) {
			this.elements.gameStatus.textContent = statusText[status] || status;
		}

		// Update container class for styling
		this.elements.container?.classList.remove('panel-waiting', 'panel-active', 'panel-finished');
		
		if (status === 'waiting') {
			this.elements.container?.classList.add('panel-waiting');
		} else if (status === 'finished') {
			this.elements.container?.classList.add('panel-finished');
		}
	}

	updatePlayerCount(count) {
		this.playerCount = count;
		if (this.elements.playerCount) {
			this.elements.playerCount.textContent = `${count} player${count !== 1 ? 's' : ''}`;
		}
	}

	showQuestion(data) {
		this.currentQuestion = data;
		this.updateStatus('question_active');

		// Update question number
		if (this.elements.questionNumber) {
			this.elements.questionNumber.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;
		}

		// Update question text
		if (this.elements.questionText) {
			this.elements.questionText.textContent = data.question;
		}

		// Update options
		const optionElements = [
			this.elements.optionA,
			this.elements.optionB,
			this.elements.optionC,
			this.elements.optionD
		];

		data.options.forEach((option, index) => {
			if (optionElements[index]) {
				optionElements[index].textContent = option;
			}
		});

		// Reset option styles
		this.elements.optionsGrid?.querySelectorAll('.panel-option').forEach(el => {
			el.classList.remove('correct', 'selected');
		});
	}

	showResults(data) {
		this.updateStatus('results');

		// Highlight correct answer
		if (data.correctAnswer !== undefined) {
			const options = this.elements.optionsGrid?.querySelectorAll('.panel-option');
			if (options && options[data.correctAnswer]) {
				options[data.correctAnswer].classList.add('correct');
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
		this.updateStatus('waiting');
		
		if (this.elements.questionText) {
			this.elements.questionText.textContent = 'Waiting for next question...';
		}

		// Reset options
		const optionElements = [
			this.elements.optionA,
			this.elements.optionB,
			this.elements.optionC,
			this.elements.optionD
		];

		optionElements.forEach(el => {
			if (el) el.textContent = '-';
		});

		// Reset option styles
		this.elements.optionsGrid?.querySelectorAll('.panel-option').forEach(el => {
			el.classList.remove('correct', 'selected');
		});
	}

	updateLeaderboard(leaderboard) {
		if (!this.elements.leaderboardList || !leaderboard) return;

		// Clear current leaderboard
		this.elements.leaderboardList.innerHTML = '';

		if (leaderboard.length === 0) {
			const item = document.createElement('div');
			item.className = 'panel-leaderboard-item';
			item.innerHTML = `
				<span class="panel-player-name">No players yet</span>
				<span class="panel-player-score">-</span>
			`;
			this.elements.leaderboardList.appendChild(item);
			this.updatePlayerCount(0);
			return;
		}

		// Add leaderboard items
		leaderboard.slice(0, 10).forEach((player, index) => {
			const item = document.createElement('div');
			item.className = 'panel-leaderboard-item';
			item.innerHTML = `
				<span class="panel-player-name">${index + 1}. ${player.name}</span>
				<span class="panel-player-score">${player.score}</span>
			`;
			this.elements.leaderboardList.appendChild(item);
		});

		this.updatePlayerCount(leaderboard.length);
	}

	showError(message) {
		console.error('Panel error:', message);
		
		if (this.elements.questionText) {
			this.elements.questionText.textContent = `Error: ${message}`;
		}
		
		if (this.elements.gameStatus) {
			this.elements.gameStatus.textContent = 'Error';
		}
	}
}

// Initialize panel when page loads
document.addEventListener('DOMContentLoaded', () => {
	new PanelApp();
});