/**
 * Shared session checking logic for all interfaces
 */

import { GameAPI } from './api.js';
import { defaultGameState } from './gameState.js';
import { defaultNotificationManager } from './notifications.js';

export class SessionChecker {
	constructor() {
		this.gameState = defaultGameState;
		this.notifications = defaultNotificationManager;
	}

	/**
	 * Check for saved session and determine where to redirect
	 * @returns {Promise<Object>} {shouldRedirect: boolean, redirectUrl: string, message: string}
	 */
	async checkSavedSession() {
		const savedPin = this.gameState.gamePin;
		
		if (!savedPin) {
			return { shouldRedirect: false };
		}

		try {
			// Validate the saved game PIN via API
			const game = await GameAPI.getGame(savedPin);
			
			if (game && (game.status === 'waiting' || game.status === 'running')) {
				// Game is still active - redirect to game
				return {
					shouldRedirect: true,
					redirectUrl: `/game/${savedPin}`,
					message: 'Pokračujem v uloženej hre'
				};
			} else {
				// Game ended or doesn't exist - clear obsolete data
				this.gameState.clearGame();
				this.gameState.clearSavedSession();
				return {
					shouldRedirect: false,
					message: 'Uložená hra už skončila'
				};
			}
		} catch (error) {
			console.error('Error validating saved session:', error);
			this.gameState.clearGame();
			this.gameState.clearSavedSession();
			return {
				shouldRedirect: false,
				message: 'Chyba pri kontrole uloženej hry'
			};
		}
	}

	/**
	 * Show appropriate notification based on session check result
	 * @param {Object} result - Result from checkSavedSession
	 */
	showSessionMessage(result) {
		if (result.message) {
			if (result.shouldRedirect) {
				this.notifications.showInfo(result.message);
			} else {
				this.notifications.showWarning(result.message);
			}
		}
	}
}

// Create default instance
export const defaultSessionChecker = new SessionChecker();