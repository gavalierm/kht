/**
 * Game state management utilities
 */

export class GameState {
	constructor() {
		this.gamePin = null;
		this.currentGame = null;
		this.currentQuestion = null;
		this.hasAnswered = false;
		this.isWaiting = true;
		this.playerToken = null;
		this.moderatorToken = null;
		this.playerId = null;
		this.playerName = null;
		this.timerInterval = null;
		this.lastResult = null;
		this.gameStatus = 'waiting';
		
		// Load saved state from localStorage
		this.loadFromStorage();
	}

	/**
	 * Set game PIN
	 * @param {string} pin - Game PIN
	 */
	setGamePin(pin) {
		this.gamePin = pin;
		this.saveToStorage();
	}

	/**
	 * Set player token
	 * @param {string} token - Player token
	 */
	setPlayerToken(token) {
		this.playerToken = token;
		localStorage.setItem('playerToken', token);
	}

	/**
	 * Set moderator token
	 * @param {string} token - Moderator token
	 */
	setModeratorToken(token) {
		this.moderatorToken = token;
		localStorage.setItem('moderatorToken', token);
	}

	/**
	 * Set player ID
	 * @param {string} id - Player ID
	 */
	setPlayerId(id) {
		this.playerId = id;
		if (this.gamePin) {
			localStorage.setItem(`game_${this.gamePin}_id`, id);
		}
	}

	/**
	 * Set player name
	 * @param {string} name - Player name
	 */
	setPlayerName(name) {
		this.playerName = name;
		if (this.gamePin) {
			localStorage.setItem(`game_${this.gamePin}_name`, name);
		}
	}

	/**
	 * Set current game data
	 * @param {Object} game - Game data
	 */
	setCurrentGame(game) {
		this.currentGame = game;
		this.saveToStorage();
	}

	/**
	 * Set current question
	 * @param {Object} question - Question data
	 */
	setCurrentQuestion(question) {
		this.currentQuestion = question;
		this.hasAnswered = false;
		this.isWaiting = false;
	}

	/**
	 * Mark answer as submitted
	 * @param {number} answerIndex - Selected answer index
	 */
	submitAnswer(answerIndex) {
		if (this.hasAnswered) return false;
		
		this.hasAnswered = true;
		this.selectedAnswer = answerIndex;
		return true;
	}

	/**
	 * Set answer result
	 * @param {Object} result - Answer result data
	 */
	setAnswerResult(result) {
		this.lastResult = result;
	}

	/**
	 * Set waiting state
	 * @param {boolean} waiting - Whether game is in waiting state
	 */
	setWaiting(waiting = true) {
		this.isWaiting = waiting;
	}

	/**
	 * Set game status
	 * @param {string} status - Game status
	 */
	setGameStatus(status) {
		this.gameStatus = status;
	}

	/**
	 * Clear game state
	 */
	clearGame() {
		this.gamePin = null;
		this.currentGame = null;
		this.currentQuestion = null;
		this.hasAnswered = false;
		this.isWaiting = true;
		this.lastResult = null;
		this.gameStatus = 'waiting';
		this.playerName = null;
		this.clearTimers();
		this.saveToStorage();
	}

	/**
	 * Clear all timers
	 */
	clearTimers() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	/**
	 * Check if player has saved session for current game
	 * @returns {boolean} Whether saved session exists
	 */
	hasSavedSession() {
		return this.playerToken && this.gamePin && 
			   localStorage.getItem(`game_${this.gamePin}_id`);
	}

	/**
	 * Check if player has valid reconnection data
	 * @returns {boolean} Whether reconnection data exists
	 */
	hasReconnectionData() {
		return this.playerToken && this.gamePin;
	}

	/**
	 * Get saved player ID for current game
	 * @returns {string|null} Saved player ID or null
	 */
	getSavedPlayerId() {
		if (!this.gamePin) return null;
		return localStorage.getItem(`game_${this.gamePin}_id`);
	}

	/**
	 * Remove saved session data
	 */
	clearSavedSession() {
		localStorage.removeItem('playerToken');
		if (this.gamePin) {
			localStorage.removeItem(`game_${this.gamePin}_id`);
			localStorage.removeItem(`game_${this.gamePin}_name`);
		}
		this.playerToken = null;
		this.playerId = null;
		this.playerName = null;
	}

	/**
	 * Save state to localStorage
	 */
	saveToStorage() {
		const state = {
			gamePin: this.gamePin,
			currentGame: this.currentGame,
			gameStatus: this.gameStatus,
			lastSaved: Date.now()
		};
		localStorage.setItem('gameState', JSON.stringify(state));
	}

	/**
	 * Load state from localStorage
	 */
	loadFromStorage() {
		try {
			const playerToken = localStorage.getItem('playerToken');
			if (playerToken) {
				this.playerToken = playerToken;
			}

			const moderatorToken = localStorage.getItem('moderatorToken');
			if (moderatorToken) {
				this.moderatorToken = moderatorToken;
			}

			const savedState = localStorage.getItem('gameState');
			if (savedState) {
				const state = JSON.parse(savedState);
				this.gamePin = state.gamePin;
				this.currentGame = state.currentGame;
				this.gameStatus = state.gameStatus || 'waiting';
				
				// Load player ID and name for current game
				if (this.gamePin) {
					this.playerId = localStorage.getItem(`game_${this.gamePin}_id`);
					this.playerName = localStorage.getItem(`game_${this.gamePin}_name`);
				}
			}
		} catch (error) {
			console.error('Error loading game state from storage:', error);
		}
	}

	/**
	 * Get current state snapshot
	 * @returns {Object} Current state
	 */
	getState() {
		return {
			gamePin: this.gamePin,
			currentGame: this.currentGame,
			currentQuestion: this.currentQuestion,
			hasAnswered: this.hasAnswered,
			isWaiting: this.isWaiting,
			playerToken: this.playerToken,
			playerId: this.playerId,
			playerName: this.playerName,
			lastResult: this.lastResult,
			gameStatus: this.gameStatus,
			selectedAnswer: this.selectedAnswer
		};
	}
}

// Create default instance
export const defaultGameState = new GameState();

// Export convenience methods
export const setGamePin = defaultGameState.setGamePin.bind(defaultGameState);
export const setPlayerToken = defaultGameState.setPlayerToken.bind(defaultGameState);
export const setModeratorToken = defaultGameState.setModeratorToken.bind(defaultGameState);
export const setPlayerId = defaultGameState.setPlayerId.bind(defaultGameState);
export const setPlayerName = defaultGameState.setPlayerName.bind(defaultGameState);
export const setCurrentGame = defaultGameState.setCurrentGame.bind(defaultGameState);
export const setCurrentQuestion = defaultGameState.setCurrentQuestion.bind(defaultGameState);
export const submitAnswer = defaultGameState.submitAnswer.bind(defaultGameState);
export const setAnswerResult = defaultGameState.setAnswerResult.bind(defaultGameState);
export const setWaiting = defaultGameState.setWaiting.bind(defaultGameState);
export const setGameStatus = defaultGameState.setGameStatus.bind(defaultGameState);
export const clearGame = defaultGameState.clearGame.bind(defaultGameState);
export const getGameState = defaultGameState.getState.bind(defaultGameState);