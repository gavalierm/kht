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
		
		// Question editing state
		this.questions = [];
		this.currentQuestionEdit = null;
		this.isEditingQuestion = false;
		this.editingQuestionIndex = -1;
		this.gamePin = null;
		this.currentTemplateId = 'general';

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
			'answer3'
		]);

		// Extract game PIN from URL
		this.gamePin = this.router.extractGamePin(window.location.pathname);

		// Setup event listeners
		this.setupEventListeners();
		
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
		// Nothing to cleanup for now
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