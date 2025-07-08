import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultAPI } from '../shared/api.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../shared/constants.js';

class ControlApp {
	constructor() {
		// Initialize managers
		this.notifications = defaultNotificationManager;
		this.dom = defaultDOMHelper;
		this.router = defaultRouter;
		this.socket = defaultSocketManager;
		
		// Question editing state
		this.questions = [];
		this.currentQuestionEdit = null;
		this.isEditingQuestion = false;
		this.editingQuestionIndex = -1;
		this.gamePin = null;
		this.currentTemplateId = 'general';
		
		// Game control state
		this.gameState = 'stopped'; // stopped, running, paused
		this.playerCount = 0;
		this.currentQuestion = 0;
		this.moderatorToken = null;
		this.isConnectedToGame = false;
		
		// UI state
		this.questionsCollapsed = false;

		// Element references
		this.elements = {};
		
		// Loading state
		this.isLoading = false;

		this.init();
	}

	init() {
		// Cache elements
		this.elements = this.dom.cacheElements([
			'questionForm',
			'questionsList',
			'emptyState',
			'addQuestionBtn',
			'questionText',
			'questionTimeout',
			'saveQuestionBtn',
			'cancelQuestionBtn',
			'saveButtonText',
			'answer0',
			'answer1',
			'answer2',
			'answer3',
			'startGameBtn',
			'pauseGameBtn',
			'endGameBtn',
			'statusIndicator',
			'statusText',
			'gamePinDisplay',
			'playerCountDisplay',
			'currentQuestionDisplay',
			'gameInfo',
			'toggleQuestionsBtn',
			'questionsContent'
		]);

		// Extract game PIN from URL
		this.gamePin = this.router.extractGamePin(window.location.pathname);

		// Setup event listeners
		this.setupEventListeners();
		
		// Setup socket listeners
		this.setupSocketListeners();
		
		// Initialize socket connection
		this.initializeSocket();
		
		// Initialize game control UI
		this.updateGameControlUI();
		
		// Load questions
		this.loadQuestions();
	}

	setupEventListeners() {
		// Question management buttons
		if (this.elements.addQuestionBtn) {
			this.elements.addQuestionBtn.addEventListener('click', () => {
				this.handleAddQuestion();
			});
		}

		if (this.elements.saveQuestionBtn) {
			this.elements.saveQuestionBtn.addEventListener('click', () => {
				this.handleSaveQuestion();
			});
		}

		if (this.elements.cancelQuestionBtn) {
			this.elements.cancelQuestionBtn.addEventListener('click', () => {
				this.handleCancelQuestion();
			});
		}

		// Game control buttons
		if (this.elements.startGameBtn) {
			this.elements.startGameBtn.addEventListener('click', () => {
				this.handleStartGame();
			});
		}

		if (this.elements.pauseGameBtn) {
			this.elements.pauseGameBtn.addEventListener('click', () => {
				this.handlePauseGame();
			});
		}

		if (this.elements.endGameBtn) {
			this.elements.endGameBtn.addEventListener('click', () => {
				this.handleEndGame();
			});
		}

		// Toggle questions section
		if (this.elements.toggleQuestionsBtn) {
			this.elements.toggleQuestionsBtn.addEventListener('click', () => {
				this.toggleQuestionsSection();
			});
		}
	}

	setupSocketListeners() {
		// Game connection events
		this.socket.on(SOCKET_EVENTS.GAME_CREATED, (data) => {
			this.handleGameCreated(data);
		});

		this.socket.on(SOCKET_EVENTS.CREATE_GAME_ERROR, (error) => {
			this.notifications.showError(error.message || 'Chyba pri vytváraní hry');
		});

		// Moderator reconnection events
		this.socket.on('moderator_reconnected', (data) => {
			this.handleModeratorReconnected(data);
		});

		this.socket.on('moderator_reconnect_error', (error) => {
			console.log('Moderator reconnect error:', error);
			this.isConnectedToGame = false;
			this.updateGameControlUI();
			
			const errorMessage = error.message || 'Chyba pri pripájaní k hre';
			this.notifications.showError(`${errorMessage}. Skúste obnoviť stránku.`);
		});

		// Game control events
		this.socket.on('question_started_dashboard', (data) => {
			this.handleQuestionStarted(data);
		});

		this.socket.on('question_ended_dashboard', (data) => {
			this.handleQuestionEnded(data);
		});

		this.socket.on('start_question_error', (error) => {
			this.notifications.showError(error.message || 'Chyba pri spustení otázky');
		});

		// Player updates
		this.socket.on('player_joined', (data) => {
			this.handlePlayerJoined(data);
		});

		this.socket.on('player_left', (data) => {
			this.handlePlayerLeft(data);
		});

		// Live stats during questions
		this.socket.on('live_stats', (data) => {
			this.handleLiveStats(data);
		});
	}

	initializeSocket() {
		// Connect the socket first
		this.socket.connect();
		
		if (this.gamePin) {
			// Wait for socket to be ready before attempting reconnection
			if (this.socket.connected()) {
				this.reconnectAsModerator();
			} else {
				// Wait for socket connection
				this.socket.on(SOCKET_EVENTS.CONNECT, () => {
					console.log('Socket connected, attempting moderator reconnection');
					this.reconnectAsModerator();
				});
			}
		}
	}

	reconnectAsModerator() {
		// Try to reconnect using moderator token from localStorage
		const moderatorToken = localStorage.getItem(`moderator_token_${this.gamePin}`);
		
		console.log('Attempting moderator reconnection:', {
			pin: this.gamePin,
			hasToken: !!moderatorToken
		});
		
		if (moderatorToken) {
			this.socket.emit(SOCKET_EVENTS.RECONNECT_MODERATOR, {
				pin: this.gamePin,
				moderator_token: moderatorToken
			});
		} else {
			// For development game PIN 912082, try with the known token
			if (this.gamePin === '912082') {
				const devToken = '6be037f7a2f1ae5cbee2195b9c33117b45a6f50b57ad0eae6da6b3e294baf0d3';
				console.log('Using development token for game 912082');
				this.socket.emit(SOCKET_EVENTS.RECONNECT_MODERATOR, {
					pin: this.gamePin,
					moderator_token: devToken
				});
				// Store the token for future use
				localStorage.setItem(`moderator_token_${this.gamePin}`, devToken);
			} else {
				// If no token, try reconnecting with just the PIN
				this.socket.emit(SOCKET_EVENTS.RECONNECT_MODERATOR, {
					pin: this.gamePin
				});
			}
		}
	}

	// Socket event handlers
	handleGameCreated(data) {
		this.moderatorToken = data.moderator_token;
		this.gamePin = data.pin;
		this.isConnectedToGame = true;
		
		// Store moderator token for reconnection
		localStorage.setItem(`moderator_token_${this.gamePin}`, this.moderatorToken);
		
		this.notifications.showSuccess(`Hra vytvorená s PIN: ${data.pin}`);
		this.updateGameControlUI();
	}

	handleModeratorReconnected(data) {
		console.log('Moderator reconnected:', data);
		this.isConnectedToGame = true;
		this.gameState = data.game?.state || 'waiting';
		this.playerCount = data.game?.players?.length || 0;
		
		this.notifications.showSuccess('Pripojený k hre ako moderátor');
		this.updateGameControlUI();
	}

	handleQuestionStarted(data) {
		this.gameState = 'running';
		this.currentQuestion = data.questionIndex || 0;
		this.updateGameControlUI();
		this.autoCollapseQuestions();
		this.notifications.showInfo(`Otázka ${this.currentQuestion + 1} bola spustená`);
	}

	handleQuestionEnded(data) {
		this.gameState = 'waiting';
		this.updateGameControlUI();
		
		const message = data.hasMoreQuestions ? 
			'Otázka ukončená. Pripravená ďalšia otázka.' : 
			'Posledná otázka ukončená. Hra dokončená.';
		this.notifications.showInfo(message);
	}

	handlePlayerJoined(data) {
		this.playerCount++;
		this.updateGameControlUI();
		this.notifications.showInfo(`Hráč ${data.player.name} sa pripojil`);
	}

	handlePlayerLeft(data) {
		this.playerCount--;
		this.updateGameControlUI();
		this.notifications.showInfo(`Hráč ${data.player.name} opustil hru`);
	}

	handleLiveStats(data) {
		// Update real-time stats during question if needed
		// This could show answer counts, etc.
	}

	// Question Management Methods
	async loadQuestions() {
		try {
			this.showLoading('Načítavam otázky...');
			
			let response;
			if (this.gamePin) {
				// Load questions from specific game
				response = await fetch(`/api/games/${this.gamePin}/questions`);
			} else {
				// Load questions from template
				response = await fetch(`/api/question-templates/${this.currentTemplateId}`);
			}
			
			if (response.ok) {
				const data = await response.json();
				this.questions = data.questions || [];
				this.renderQuestionList();
			} else {
				this.notifications.showError('Chyba pri načítavaní otázok');
			}
		} catch (error) {
			console.error('Error loading questions:', error);
			this.notifications.showError('Chyba pri načítavaní otázok');
		} finally {
			this.hideLoading();
		}
	}

	renderQuestionList() {
		if (!this.elements.questionsList) return;
		
		this.elements.questionsList.innerHTML = '';
		
		// Hide empty state
		if (this.elements.emptyState) {
			this.elements.emptyState.style.display = this.questions.length === 0 ? 'block' : 'none';
		}
		
		if (this.questions.length === 0) {
			return;
		}
		
		this.questions.forEach((question, index) => {
			const questionItem = this.createQuestionItem(question, index);
			this.elements.questionsList.appendChild(questionItem);
		});
	}

	createQuestionItem(question, index) {
		const item = document.createElement('div');
		item.className = 'question-item';
		
		const content = document.createElement('div');
		content.className = 'question-content';
		
		const questionText = document.createElement('div');
		questionText.className = 'question-text';
		questionText.textContent = `${index + 1}. ${question.question}`;
		
		const options = document.createElement('div');
		options.className = 'question-options';
		
		question.options.forEach((option, optIndex) => {
			const optionDiv = document.createElement('div');
			optionDiv.className = 'question-option';
			
			// Add option color class
			const optionClasses = ['option-a', 'option-b', 'option-c', 'option-d'];
			optionDiv.classList.add(optionClasses[optIndex]);
			
			if (optIndex === question.correct) {
				optionDiv.classList.add('correct');
			}
			
			// Create letter span
			const letterSpan = document.createElement('span');
			letterSpan.className = 'question-option-letter';
			letterSpan.textContent = String.fromCharCode(65 + optIndex);
			
			// Create text span
			const textSpan = document.createElement('span');
			textSpan.textContent = option;
			
			optionDiv.appendChild(letterSpan);
			optionDiv.appendChild(textSpan);
			options.appendChild(optionDiv);
		});
		
		const timeout = document.createElement('div');
		timeout.className = 'question-timeout';
		timeout.textContent = `⏱️ ${question.timeLimit || 30}s`;
		
		content.appendChild(questionText);
		content.appendChild(options);
		content.appendChild(timeout);
		
		const actions = document.createElement('div');
		actions.className = 'question-actions';
		
		const editBtn = document.createElement('button');
		editBtn.className = 'btn-secondary btn-sm';
		editBtn.textContent = 'Upraviť';
		editBtn.onclick = () => this.handleEditQuestion(index);
		
		const deleteBtn = document.createElement('button');
		deleteBtn.className = 'btn-danger btn-sm';
		deleteBtn.textContent = 'Zmazať';
		deleteBtn.onclick = () => this.handleDeleteQuestion(index);
		
		actions.appendChild(editBtn);
		actions.appendChild(deleteBtn);
		
		item.appendChild(content);
		item.appendChild(actions);
		
		return item;
	}

	handleAddQuestion() {
		this.isEditingQuestion = false;
		this.editingQuestionIndex = -1;
		this.currentQuestionEdit = {
			question: '',
			options: ['', '', '', ''],
			correct: 0,
			timeLimit: 30
		};
		this.showQuestionEditForm();
	}

	handleEditQuestion(index) {
		this.isEditingQuestion = true;
		this.editingQuestionIndex = index;
		this.currentQuestionEdit = { ...this.questions[index] };
		this.showQuestionEditForm();
	}

	handleDeleteQuestion(index) {
		if (confirm('Naozaj chcete zmazať túto otázku?')) {
			this.questions.splice(index, 1);
			this.saveQuestionsToServer();
		}
	}

	showQuestionEditForm() {
		if (this.elements.questionForm) {
			this.elements.questionForm.classList.add('active');
		}
		
		// Populate form with current question data
		if (this.elements.questionText) {
			this.elements.questionText.value = this.currentQuestionEdit.question;
		}
		
		if (this.elements.questionTimeout) {
			this.elements.questionTimeout.value = this.currentQuestionEdit.timeLimit;
		}
		
		// Populate answers
		for (let i = 0; i < 4; i++) {
			const answerElement = this.elements[`answer${i}`];
			if (answerElement) {
				answerElement.value = this.currentQuestionEdit.options[i] || '';
			}
		}
		
		// Set correct answer
		const correctRadio = document.querySelector(`input[name="correctAnswer"][value="${this.currentQuestionEdit.correct}"]`);
		if (correctRadio) {
			correctRadio.checked = true;
		}
		
		// Update button text
		if (this.elements.saveButtonText) {
			this.elements.saveButtonText.textContent = this.isEditingQuestion ? 'Uložiť zmeny' : 'Uložiť otázku';
		}
	}

	hideQuestionEditForm() {
		if (this.elements.questionForm) {
			this.elements.questionForm.classList.remove('active');
		}
	}

	handleSaveQuestion() {
		// Validate form
		const questionText = this.elements.questionText?.value.trim();
		if (!questionText) {
			this.notifications.showError('Zadajte text otázky');
			return;
		}
		
		const answers = [];
		for (let i = 0; i < 4; i++) {
			const answer = this.elements[`answer${i}`]?.value.trim();
			if (!answer) {
				this.notifications.showError(`Zadajte odpoveď ${String.fromCharCode(65 + i)}`);
				return;
			}
			answers.push(answer);
		}
		
		const correctAnswer = document.querySelector('input[name="correctAnswer"]:checked')?.value;
		if (correctAnswer === undefined) {
			this.notifications.showError('Vyberte správnu odpoveď');
			return;
		}
		
		const timeLimit = parseInt(this.elements.questionTimeout?.value);
		if (!timeLimit || timeLimit < 10 || timeLimit > 180) {
			this.notifications.showError('Časový limit musí byť medzi 10 a 180 sekúnd');
			return;
		}
		
		// Create question object
		const question = {
			question: questionText,
			options: answers,
			correct: parseInt(correctAnswer),
			timeLimit: timeLimit
		};
		
		// Add or update question
		if (this.isEditingQuestion) {
			this.questions[this.editingQuestionIndex] = question;
		} else {
			this.questions.push(question);
		}
		
		// Save to server
		this.saveQuestionsToServer();
	}

	handleCancelQuestion() {
		this.hideQuestionEditForm();
		this.currentQuestionEdit = null;
		this.isEditingQuestion = false;
		this.editingQuestionIndex = -1;
	}

	async saveQuestionsToServer() {
		try {
			this.showLoading('Ukladám otázky...');
			
			let response;
			if (this.gamePin) {
				// Save questions to specific game
				response = await fetch(`/api/games/${this.gamePin}/questions`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						questions: this.questions
					})
				});
			} else {
				// Save questions to template
				response = await fetch(`/api/question-templates/${this.currentTemplateId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						questions: this.questions
					})
				});
			}
			
			if (response.ok) {
				const successMessage = this.gamePin ? 
					'Otázky hry boli úspešne uložené' : 
					'Otázky boli úspešne uložené';
				this.notifications.showSuccess(successMessage);
				this.hideQuestionEditForm();
				this.renderQuestionList();
			} else {
				const error = await response.json();
				this.notifications.showError(error.message || 'Chyba pri ukladaní otázok');
			}
		} catch (error) {
			console.error('Error saving questions:', error);
			this.notifications.showError('Chyba pri ukladaní otázok');
		} finally {
			this.hideLoading();
		}
	}

	// Game Control Methods
	handleStartGame() {
		if (this.questions.length === 0) {
			this.notifications.showError('Pridajte aspoň jednu otázku pred spustením hry');
			return;
		}

		if (!this.isConnectedToGame) {
			this.notifications.showError('Nie ste pripojený k hre');
			return;
		}

		// Start the first question via socket
		this.socket.emit(SOCKET_EVENTS.START_QUESTION);
		this.notifications.showInfo('Spúšťam prvú otázku...');
	}

	handlePauseGame() {
		if (this.gameState === 'running') {
			// End current question to effectively pause
			this.socket.emit(SOCKET_EVENTS.END_QUESTION);
			this.notifications.showInfo('Ukončujem aktuálnu otázku...');
		} else {
			// Start next question to resume
			this.socket.emit(SOCKET_EVENTS.START_QUESTION);
			this.notifications.showInfo('Spúšťam ďalšiu otázku...');
		}
	}

	handleEndGame() {
		if (confirm('Naozaj chcete ukončiť hru? Všetok postup bude stratený.')) {
			// First end current question if running
			if (this.gameState === 'running') {
				this.socket.emit(SOCKET_EVENTS.END_QUESTION);
			}
			
			// Reset local state
			this.gameState = 'waiting';
			this.currentQuestion = 0;
			this.updateGameControlUI();
			this.notifications.showSuccess('Hra bola ukončená');
		}
	}

	updateGameControlUI() {
		// Update status indicator and text
		if (this.elements.statusIndicator && this.elements.statusText) {
			this.elements.statusIndicator.className = 'status-indicator';
			
			if (!this.isConnectedToGame) {
				this.elements.statusText.textContent = 'Nie ste pripojený ako moderátor';
			} else {
				switch (this.gameState) {
					case 'running':
						this.elements.statusIndicator.classList.add('active');
						this.elements.statusText.textContent = 'Hra beží';
						break;
					case 'paused':
						this.elements.statusIndicator.classList.add('paused');
						this.elements.statusText.textContent = 'Hra je pozastavená';
						break;
					default:
						this.elements.statusIndicator.classList.add('active');
						this.elements.statusText.textContent = 'Pripojený ako moderátor';
				}
			}
		}

		// Update button states
		if (this.elements.startGameBtn) {
			this.elements.startGameBtn.disabled = !this.isConnectedToGame || this.gameState === 'running';
		}

		if (this.elements.pauseGameBtn) {
			this.elements.pauseGameBtn.disabled = !this.isConnectedToGame;
			const pauseText = this.elements.pauseGameBtn.querySelector('span:last-child');
			if (pauseText) {
				pauseText.textContent = this.gameState === 'running' ? 'Ukončiť otázku' : 'Spustiť otázku';
			}
		}

		if (this.elements.endGameBtn) {
			this.elements.endGameBtn.disabled = !this.isConnectedToGame;
		}

		// Update game info
		if (this.elements.gameInfo) {
			const shouldShow = this.isConnectedToGame;
			this.elements.gameInfo.style.display = shouldShow ? 'block' : 'none';
		}

		// Update game PIN display
		if (this.elements.gamePinDisplay && this.gamePin) {
			this.elements.gamePinDisplay.textContent = this.gamePin;
		}

		// Update player count
		if (this.elements.playerCountDisplay) {
			this.elements.playerCountDisplay.textContent = this.playerCount;
		}

		// Update current question
		if (this.elements.currentQuestionDisplay) {
			if (!this.isConnectedToGame) {
				this.elements.currentQuestionDisplay.textContent = '-';
			} else {
				this.elements.currentQuestionDisplay.textContent = `${this.currentQuestion + 1} / ${this.questions.length}`;
			}
		}
	}

	// UI Control Methods
	toggleQuestionsSection() {
		const questionsBox = document.querySelector('.collapsible-box');
		const toggleIcon = this.elements.toggleQuestionsBtn?.querySelector('.toggle-icon');
		const toggleText = this.elements.toggleQuestionsBtn?.querySelector('.toggle-text');

		this.questionsCollapsed = !this.questionsCollapsed;

		if (questionsBox) {
			if (this.questionsCollapsed) {
				questionsBox.classList.add('collapsed');
			} else {
				questionsBox.classList.remove('collapsed');
			}
		}

		// Update button text and icon
		if (toggleText) {
			toggleText.textContent = this.questionsCollapsed ? 'Zobraziť' : 'Skryť';
		}

		// Auto-collapse when game is running to focus on game controls
		if (this.gameState === 'running' && !this.questionsCollapsed) {
			setTimeout(() => {
				this.notifications.showInfo('Otázky boli automaticky skryté počas hry');
			}, 300);
		}
	}

	// Auto-collapse questions when game starts
	autoCollapseQuestions() {
		if (!this.questionsCollapsed) {
			this.toggleQuestionsSection();
		}
	}

	// Loading state management
	showLoading(message = 'Načítavam...') {
		this.isLoading = true;
		// Add loading spinner to save button
		if (this.elements.saveQuestionBtn) {
			this.elements.saveQuestionBtn.classList.add('loading');
		}
	}

	hideLoading() {
		this.isLoading = false;
		// Remove loading spinner from save button
		if (this.elements.saveQuestionBtn) {
			this.elements.saveQuestionBtn.classList.remove('loading');
		}
	}

	// Cleanup when leaving the page
	cleanup() {
		// Remove socket listeners
		if (this.socket) {
			this.socket.off(SOCKET_EVENTS.GAME_CREATED);
			this.socket.off(SOCKET_EVENTS.CREATE_GAME_ERROR);
			this.socket.off('moderator_reconnected');
			this.socket.off('moderator_reconnect_error');
			this.socket.off('question_started_dashboard');
			this.socket.off('question_ended_dashboard');
			this.socket.off('start_question_error');
			this.socket.off('player_joined');
			this.socket.off('player_left');
			this.socket.off('live_stats');
		}
	}
}

// Initialize the control app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.controlApp = new ControlApp();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
	if (window.controlApp) {
		window.controlApp.cleanup();
	}
});

export { ControlApp };