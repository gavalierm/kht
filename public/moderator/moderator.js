import { defaultSocketManager } from '../shared/socket.js';
import { defaultNotificationManager } from '../shared/notifications.js';
import { defaultRouter } from '../shared/router.js';
import { defaultDOMHelper } from '../shared/dom.js';
import { defaultGameState } from '../shared/gameState.js';
import { defaultAPI } from '../shared/api.js';
import { SOCKET_EVENTS, GAME_STATES, ELEMENT_IDS, CSS_CLASSES, DEFAULTS } from '../shared/constants.js';

class ModeratorApp {
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
		
		// Game moderator state
		this.gameState = 'stopped'; // stopped, running
		this.gamePhase = 'WAITING'; // WAITING, QUESTION_ACTIVE, RESULTS, FINISHED
		this.playerCount = 0;
		this.currentQuestion = 0;
		this.moderatorToken = null;
		
		// UI state
		this.questionsCollapsed = false;
		this.isLoggedIn = false;

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
			'endGameBtn',
			'resetGameBtn',
			'gamePinDisplay',
			'gameStateDisplay',
			'playerCountDisplay',
			'currentQuestionDisplay',
			'gameInfo',
			'toggleQuestionsBtn',
			'questionsContent',
			'loginPage',
			'moderatorInterface',
			'loginGamePin',
			'moderatorPassword',
			'loginBtn',
			'loginButtonText',
			'logoutBtn'
		]);

		// Extract game PIN from URL
		this.gamePin = this.router.extractGamePin(window.location.pathname);

		// Setup event listeners
		this.setupEventListeners();
		
		// Setup socket listeners
		this.setupSocketListeners();
		
		// Initialize login UI
		this.initializeLogin();
		
		// Check if already logged in
		this.checkExistingLogin();
	}

	setupSocketListeners() {
		// Ensure socket is connected before setting up listeners
		// Connection banner handles connection status notifications
		this.socket.connect();
		
		// Game connection events
		this.socket.on(SOCKET_EVENTS.GAME_CREATED, (data) => {
			this.handleGameCreated(data);
		});

		this.socket.on(SOCKET_EVENTS.CREATE_GAME_ERROR, (error) => {
			this.notifications.showError(error.message || 'Chyba pri vytváraní hry');
		});

		// Moderator reconnection events
		this.socket.on('moderator_reconnected', (data) => {
			this.handleLoginSuccess(data);
		});

		this.socket.on('moderator_reconnect_error', (error) => {
			this.handleLoginError(error);
		});

		// Game moderator events
		this.socket.on('question_started_dashboard', (data) => {
			this.handleQuestionStarted(data);
		});

		this.socket.on('question_ended_dashboard', (data) => {
			this.handleQuestionEnded(data);
		});

		this.socket.on('next_question_ready', (data) => {
			this.handleNextQuestionReady(data);
		});

		this.socket.on(SOCKET_EVENTS.GAME_ENDED_DASHBOARD, (data) => {
			this.handleGameEndedDashboard(data);
		});

		// Operation errors - auto-reload to re-authenticate
		this.socket.on('start_question_error', (error) => {
			// Auto-reload on any error to trigger re-authentication
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => window.location.reload(), 1000);
		});

		this.socket.on('end_game_error', (error) => {
			// Auto-reload on any error to trigger re-authentication
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => window.location.reload(), 1000);
		});

		this.socket.on('reset_game_error', (error) => {
			// Auto-reload on any error to trigger re-authentication
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => window.location.reload(), 1000);
		});

		this.socket.on('end_question_error', (error) => {
			// Auto-reload on any error to trigger re-authentication
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => window.location.reload(), 1000);
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

		// Game reset for test game
		this.socket.on('game_reset_success', (data) => {
			this.handleGameReset(data);
		});

		// Listen for game state updates
		this.socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (data) => {
			this.handleGameStateUpdate(data);
		});
	}

	handleGameStateUpdate(data) {
		console.log('Moderator: Game state update:', data);
		
		if (data.status === 'waiting') {
			// Game is waiting for next question to start
			this.gameState = 'waiting';
			this.updateGameStateDisplay('WAITING', 'Čakáme na ďalšiu otázku...');
		} else if (data.status === 'finished') {
			this.gameState = 'finished';
			this.updateGameStateDisplay('FINISHED');
		}
	}

	handleNextQuestionReady(data) {
		console.log('Moderator: Next question ready:', data);
		
		// Update UI to show that next question is ready
		this.updateGameStatusDisplay(`Otázka ${data.questionNumber}/${data.totalQuestions} je pripravená`);
		
		// Enable start question button if it exists
		if (this.elements.startQuestionBtn) {
			this.elements.startQuestionBtn.disabled = false;
		}
	}

	updateGameStatusDisplay(message) {
		// Update any status display elements
		if (this.elements.gameStatusDisplay) {
			this.dom.setText(this.elements.gameStatusDisplay, message);
		}
	}

	updateGameStateDisplay(phase, customMessage = null) {
		this.gamePhase = phase;
		
		let message = customMessage;
		let cssClass = 'game-state';
		
		if (!message) {
			switch (phase) {
				case 'WAITING':
					message = 'Čaká sa na hráčov';
					cssClass += ' state-waiting';
					break;
				case 'QUESTION_ACTIVE':
					message = 'Otázka je aktívna';
					cssClass += ' state-question-active';
					break;
				case 'RESULTS':
					message = 'Zobrazujú sa výsledky';
					cssClass += ' state-results';
					break;
				case 'FINISHED':
					message = 'Hra skončila';
					cssClass += ' state-finished';
					break;
				default:
					message = 'Neznámy stav';
					cssClass += ' state-waiting';
			}
		}
		
		if (this.elements.gameStateDisplay) {
			this.elements.gameStateDisplay.textContent = message;
			this.elements.gameStateDisplay.className = cssClass;
		}
		
		// Update button states based on phase
		this.updateButtonStates();
	}

	updateButtonStates() {
		// Start Game Button
		if (this.elements.startGameBtn) {
			const canStart = this.gamePhase === 'WAITING' || this.gamePhase === 'RESULTS';
			this.elements.startGameBtn.disabled = !canStart || this.gameState === 'running';
			
			// Visual feedback
			this.elements.startGameBtn.classList.remove('btn-active', 'btn-inactive');
			if (canStart && this.gameState !== 'running') {
				this.elements.startGameBtn.classList.add('btn-active');
			} else {
				this.elements.startGameBtn.classList.add('btn-inactive');
			}
		}

		// End Game Button
		if (this.elements.endGameBtn) {
			const canEnd = this.gamePhase !== 'FINISHED' && this.gameState !== 'stopped';
			this.elements.endGameBtn.disabled = !canEnd;
			
			// Visual feedback
			this.elements.endGameBtn.classList.remove('btn-active', 'btn-inactive');
			if (canEnd) {
				this.elements.endGameBtn.classList.add('btn-active');
			} else {
				this.elements.endGameBtn.classList.add('btn-inactive');
			}
		}

		// Reset Game Button
		if (this.elements.resetGameBtn) {
			const canReset = this.gamePhase === 'FINISHED' || this.gameState === 'finished';
			this.elements.resetGameBtn.disabled = !canReset;
			
			// Visual feedback
			this.elements.resetGameBtn.classList.remove('btn-active', 'btn-inactive');
			if (canReset) {
				this.elements.resetGameBtn.classList.add('btn-active');
			} else {
				this.elements.resetGameBtn.classList.add('btn-inactive');
			}
		}
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

		// Game moderator buttons
		if (this.elements.startGameBtn) {
			this.elements.startGameBtn.addEventListener('click', () => {
				this.handleStartGame();
			});
		}

		if (this.elements.endGameBtn) {
			this.elements.endGameBtn.addEventListener('click', () => {
				this.handleEndGame();
			});
		}

		if (this.elements.resetGameBtn) {
			this.elements.resetGameBtn.addEventListener('click', () => {
				this.handleResetGame();
			});
		}

		// Toggle questions section
		if (this.elements.toggleQuestionsBtn) {
			this.elements.toggleQuestionsBtn.addEventListener('click', () => {
				this.toggleQuestionsSection();
			});
		}

		// Login form
		if (this.elements.loginBtn) {
			this.elements.loginBtn.addEventListener('click', () => {
				this.handleLogin();
			});
		}

		// Allow Enter key to submit login form
		if (this.elements.moderatorPassword) {
			this.elements.moderatorPassword.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					this.handleLogin();
				}
			});
		}


		// Logout button
		if (this.elements.logoutBtn) {
			this.elements.logoutBtn.addEventListener('click', () => {
				this.handleLogout();
			});
		}
	}



	// Socket event handlers
	handleGameCreated(data) {
		this.moderatorToken = data.moderatorToken;
		this.gamePin = data.pin;
		
		// Store moderator token for reconnection
		localStorage.setItem(`moderator_token_${this.gamePin}`, this.moderatorToken);
		
		this.notifications.showSuccess(`Hra vytvorená s PIN: ${data.pin}`);
		this.updateGameModeratorUI();
	}


	handleQuestionStarted(data) {
		this.gameState = 'running';
		this.currentQuestion = data.questionIndex !== undefined ? data.questionIndex : (data.questionNumber - 1);
		this.updateGameStateDisplay('QUESTION_ACTIVE', `Otázka ${data.questionNumber}/${data.totalQuestions} prebieha`);
		this.updateGameModeratorUI();
		this.autoCollapseQuestions();
		this.notifications.showInfo(`Otázka ${data.questionNumber} bola spustená`);
	}

	handleQuestionEnded(data) {
		this.gameState = 'waiting';
		this.updateGameStateDisplay('RESULTS', 'Zobrazujú sa výsledky otázky');
		this.updateGameModeratorUI();
		
		const message = data.hasMoreQuestions ? 
			'Otázka ukončená. Pripravená ďalšia otázka.' : 
			'Posledná otázka ukončená. Hra dokončená.';
		this.notifications.showInfo(message);
	}

	handleNextQuestionReady(data) {
		// Update current question index to reflect the advancement
		this.currentQuestion = data.questionIndex || (data.questionNumber - 1); // Use 0-based index directly or convert
		this.gameState = 'waiting';
		this.updateGameStateDisplay('WAITING', `Otázka ${data.questionNumber}/${data.totalQuestions} pripravená`);
		this.updateGameModeratorUI();
		
		this.notifications.showSuccess(`Otázka ${data.questionNumber} z ${data.totalQuestions} je pripravená na spustenie`);
	}

	handlePlayerJoined(data) {
		// Use exact count from server if available, otherwise increment
		this.playerCount = data.totalPlayers || (this.playerCount + 1);
		this.updateGameModeratorUI();
		
		// Safe access to player name
		const playerName = data.playerName || data.player?.name || data.name || 'neznámy hráč';
		this.notifications.showInfo(`Hráč ${playerName} sa pripojil`);
	}

	handlePlayerLeft(data) {
		// Use exact count from server if available, otherwise decrement
		this.playerCount = data.totalPlayers || (this.playerCount - 1);
		this.updateGameModeratorUI();
		
		// Safe access to player name
		const playerName = data.playerName || data.player?.name || data.name || 'neznámy hráč';
		this.notifications.showInfo(`Hráč ${playerName} opustil hru`);
	}

	handleLiveStats(data) {
		// Update real-time stats during question if needed
		// This could show answer counts, etc.
	}

	handleGameReset(data) {
		// Reset local state to match server
		this.gameState = 'waiting';
		this.currentQuestion = 0;
		this.updateGameStateDisplay('WAITING', 'Hra bola resetovaná');
		this.updateGameModeratorUI();
		
		this.notifications.showSuccess(data.message || 'Hra bola resetovaná');
	}

	// Login Management Methods
	initializeLogin() {
		// Show game PIN in login form
		if (this.elements.loginGamePin && this.gamePin) {
			this.elements.loginGamePin.textContent = this.gamePin;
		}
	}

	checkExistingLogin() {
		// Check if we have a stored moderator token
		const moderatorToken = localStorage.getItem(`moderator_token_${this.gamePin}`);
		
		if (moderatorToken) {
			// Auto-login with stored token (automatic, no user interaction needed)
			this.autoLoginWithToken(moderatorToken);
		} else {
			// Show login page
			this.showLoginPage();
		}
	}

	autoLoginWithToken(token) {
		this.socket.connect();
		
		// Small delay to ensure socket is ready
		setTimeout(() => {
			if (this.socket.connected()) {
				this.attemptLogin(null, token);
			} else {
				this.socket.once(SOCKET_EVENTS.CONNECT, () => {
					this.attemptLogin(null, token);
				});
			}
		}, 100);
	}

	handleLogin() {
		const password = this.elements.moderatorPassword?.value.trim();
		
		if (!password) {
			this.notifications.showError('Zadajte heslo moderátora');
			return;
		}
		
		// Clear any existing login timeout and reset loading state
		if (this.loginTimeout) {
			clearTimeout(this.loginTimeout);
			this.loginTimeout = null;
		}
		this.setLoginLoading(false);
		
		// Connect socket if not connected
		this.socket.connect();
		
		// Small delay to ensure socket is ready
		setTimeout(() => {
			if (this.socket.connected()) {
				this.attemptLogin(password, null);
			} else {
				this.socket.once(SOCKET_EVENTS.CONNECT, () => {
					this.attemptLogin(password, null);
				});
			}
		}, 100);
	}

	attemptLogin(password, token) {
		// Show loading state
		this.setLoginLoading(true);
		
		const loginData = {
			gamePin: this.gamePin
		};
		
		// Add credentials if provided
		if (token) {
			loginData.moderatorToken = token;
		} else if (password) {
			loginData.password = password;
		}
		
		// Set timeout to prevent freezing
		const loginTimeout = setTimeout(() => {
			this.setLoginLoading(false);
			this.notifications.showError('Prihlásenie trvá príliš dlho. Skúste to znovu.');
		}, 10000); // 10 second timeout
		
		// Store timeout reference to clear it on success/error
		this.loginTimeout = loginTimeout;
		
		// Emit reconnect moderator event
		this.socket.emit(SOCKET_EVENTS.RECONNECT_MODERATOR, loginData);
	}


	handleLoginSuccess(data) {
		// Clear login timeout
		if (this.loginTimeout) {
			clearTimeout(this.loginTimeout);
			this.loginTimeout = null;
		}
		
		this.setLoginLoading(false);
		this.isLoggedIn = true;
		this.moderatorToken = data.moderatorToken;
		this.gameState = data.status || 'waiting';
		this.playerCount = data.totalPlayers || 0;
		this.currentQuestion = data.currentQuestionIndex || 0;
		
		// Initialize game state display
		const serverStatus = data.status || 'waiting';
		let gamePhase = 'WAITING';
		if (serverStatus === 'finished') {
			gamePhase = 'FINISHED';
		}
		this.updateGameStateDisplay(gamePhase);
		
		// Store token for future use
		if (this.moderatorToken) {
			localStorage.setItem(`moderator_token_${this.gamePin}`, this.moderatorToken);
		}
		
		// Show moderator interface
		this.showModeratorInterface();
		
		// Initialize moderator UI and load questions
		this.updateGameModeratorUI();
		this.loadQuestions();
		
		this.notifications.showSuccess('Úspešne prihlásený ako moderátor');
	}

	handleLoginError(error) {
		// Clear login timeout
		if (this.loginTimeout) {
			clearTimeout(this.loginTimeout);
			this.loginTimeout = null;
		}
		
		// Always reload on authentication errors to trigger auto-reconnect
		// This handles server restarts, expired tokens, network issues, etc.
		this.notifications.showInfo('Obnovujem pripojenie...');
		
		// Auto-reload page after short delay to trigger auto-reconnect
		setTimeout(() => {
			window.location.reload();
		}, 1000);
	}

	handleLogout() {
		// Clear any pending login timeout
		if (this.loginTimeout) {
			clearTimeout(this.loginTimeout);
			this.loginTimeout = null;
		}
		
		// Notify server about logout
		if (this.gamePin && this.socket.connected()) {
			this.socket.emit('moderator_logout', { gamePin: this.gamePin });
		}
		
		// Clear stored token
		localStorage.removeItem(`moderator_token_${this.gamePin}`);
		
		// Reset state
		this.isLoggedIn = false;
		this.moderatorToken = null;
		this.gameState = 'stopped';
		this.gamePhase = 'WAITING';
		this.playerCount = 0;
		this.currentQuestion = 0;
		
		// Clear any loading states
		this.setLoginLoading(false);
		
		// Clear form
		if (this.elements.moderatorPassword) this.elements.moderatorPassword.value = '';
		
		// Show login page
		this.showLoginPage();
		
		this.notifications.showInfo('Odhlásený');
	}

	showLoginPage() {
		if (this.elements.loginPage) this.elements.loginPage.style.display = 'flex';
		if (this.elements.moderatorInterface) this.elements.moderatorInterface.style.display = 'none';
	}

	showModeratorInterface() {
		if (this.elements.loginPage) this.elements.loginPage.style.display = 'none';
		if (this.elements.moderatorInterface) this.elements.moderatorInterface.style.display = 'flex';
	}

	setLoginLoading(loading) {
		if (this.elements.loginBtn) {
			if (loading) {
				this.elements.loginBtn.classList.add('loading');
				this.elements.loginBtn.disabled = true;
			} else {
				this.elements.loginBtn.classList.remove('loading');
				this.elements.loginBtn.disabled = false;
			}
		}
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
				// Update UI after questions are loaded to fix question counter
				this.updateGameModeratorUI();
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

	// Game Moderator Methods
	handleStartGame() {
		if (!this.isLoggedIn) {
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => {
				window.location.reload();
			}, 500);
			return;
		}
		
		if (this.questions.length === 0) {
			this.notifications.showError('Pridajte aspoň jednu otázku pred spustením hry');
			return;
		}

		// Start the next question via socket
		this.socket.emit(SOCKET_EVENTS.START_QUESTION, { gamePin: this.gamePin });
		const questionNumber = this.currentQuestion + 1;
		this.notifications.showInfo(`Spúšťam otázku ${questionNumber}...`);
	}

	handleEndGame() {
		if (!this.isLoggedIn) {
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => {
				window.location.reload();
			}, 500);
			return;
		}
		
		if (confirm('Naozaj chcete ukončiť hru? Všetok postup bude stratený.')) {
			// End the game using the new END_GAME event
			this.socket.emit(SOCKET_EVENTS.END_GAME, { gamePin: this.gamePin });
			
			// Don't change local state immediately - let server events handle it
			// The server will either end the game or reset it (for test game)
			this.notifications.showInfo('Ukončujem hru...');
		}
	}

	handleResetGame() {
		if (!this.isLoggedIn) {
			this.notifications.showInfo('Obnovujem pripojenie...');
			setTimeout(() => {
				window.location.reload();
			}, 500);
			return;
		}
		
		if (confirm('Naozaj chcete resetovať hru? Všetok postup bude stratený a hra sa vráti na začiatok.')) {
			// Reset the game using the new RESET_GAME event
			this.socket.emit(SOCKET_EVENTS.RESET_GAME, { gamePin: this.gamePin });
			
			// Don't change local state immediately - let server events handle it
			this.notifications.showInfo('Resetujem hru...');
		}
	}

	handleGameEndedDashboard(data) {
		console.log('Game ended dashboard event:', data);
		
		// Update local state
		this.gameState = 'finished';
		this.updateGameStateDisplay('FINISHED');
		this.updateGameModeratorUI();
		
		// Show final results notification
		this.notifications.showSuccess(`Hra ukončená! Celkovo ${data.totalPlayers} hráčov dokončilo ${data.totalQuestions} otázok.`);
		
		// Update game info display with final statistics
		this.updateGameInfoWithFinalStats(data);
	}

	updateGameInfoWithFinalStats(data) {
		console.log('Updating game info with final stats:', data);
		
		// Make game info visible
		if (this.elements.gameInfo) {
			this.elements.gameInfo.style.display = 'block';
		}

		// Update game PIN display
		if (this.elements.gamePinDisplay && this.gamePin) {
			this.elements.gamePinDisplay.textContent = this.gamePin;
		}

		// Update player count with final count
		if (this.elements.playerCountDisplay) {
			this.elements.playerCountDisplay.textContent = data.totalPlayers || this.playerCount;
		}

		// Update current question display to show completion status
		if (this.elements.currentQuestionDisplay) {
			this.elements.currentQuestionDisplay.textContent = `Dokončené: ${data.totalQuestions || this.questions.length} otázok`;
		}
	}

	updateGameModeratorUI() {
		// Update button states using new method
		this.updateButtonStates();

		// Update game info
		if (this.elements.gameInfo) {
			this.elements.gameInfo.style.display = 'block';
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
			const totalQuestions = this.questions ? this.questions.length : 0;
			if (totalQuestions > 0) {
				this.elements.currentQuestionDisplay.textContent = `${this.currentQuestion + 1} / ${totalQuestions}`;
			} else {
				this.elements.currentQuestionDisplay.textContent = 'Načítavam otázky...';
			}
		}
	}

	// UI Moderator Methods
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

		// Auto-collapse when game is running to focus on game moderator controls
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
			this.socket.off('next_question_ready');
			this.socket.off('start_question_error');
			this.socket.off('end_game_error');
			this.socket.off('reset_game_error');
			this.socket.off('end_question_error');
			this.socket.off('player_joined');
			this.socket.off('player_left');
			this.socket.off('live_stats');
		}
	}
}

// Initialize the moderator app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.moderatorApp = new ModeratorApp();
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
	if (window.moderatorApp) {
		window.moderatorApp.cleanup();
	}
});

export { ModeratorApp };