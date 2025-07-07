/**
 * API utilities for making HTTP requests to the server
 */

export class GameAPI {
	/**
	 * Get game information by PIN
	 * @param {string} gamePin - The game PIN
	 * @returns {Promise<Object|null>} Game data or null if not found
	 */
	static async getGame(gamePin) {
		if (!gamePin) {
			console.warn('Missing game PIN');
			return null;
		}

		try {
			const response = await fetch(`/api/game/${gamePin}`);
			if (!response.ok) {
				return null;
			}
			return await response.json();
		} catch (error) {
			console.error('Error fetching game:', error);
			return null;
		}
	}

	/**
	 * Generic API call wrapper
	 * @param {string} action - API action to perform
	 * @param {any} payload - Data to send with the request
	 * @returns {Promise<any>} API response
	 */
	static async call(action, payload = null) {
		switch (action) {
			case 'getGame':
				return this.getGame(payload);
			default:
				console.warn('Unknown API action:', action);
				return null;
		}
	}
}

// Export individual methods for convenience
export const getGame = GameAPI.getGame.bind(GameAPI);
export const apiCall = GameAPI.call.bind(GameAPI);