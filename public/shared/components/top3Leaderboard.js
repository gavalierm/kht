/**
 * Shared TOP 3 Leaderboard Component
 * Used by both panel and stage interfaces
 */

class Top3Leaderboard {
	constructor() {
		this.medals = ['🥇', '🥈', '🥉'];
	}

	/**
	 * Render TOP 3 players to a container element
	 * @param {HTMLElement} container - The container element to render into
	 * @param {Array} leaderboard - Array of player objects with name and score
	 * @param {string} itemClassName - CSS class for individual items
	 * @param {string} nameClassName - CSS class for player name
	 * @param {string} scoreClassName - CSS class for player score
	 * @param {string} emptyMessage - Message to show when no players
	 */
	render(container, leaderboard, itemClassName = 'leaderboard-item', nameClassName = 'player-name', scoreClassName = 'player-score', emptyMessage = 'Zatiaľ žiadni hráči') {
		if (!container || !leaderboard) return;

		// Clear current leaderboard
		container.innerHTML = '';

		if (leaderboard.length === 0) {
			const item = document.createElement('div');
			item.className = itemClassName;
			item.innerHTML = `
				<span class="${nameClassName}">${emptyMessage}</span>
				<span class="${scoreClassName}">-</span>
			`;
			container.appendChild(item);
			return;
		}

		// Sort leaderboard by score (descending) and show only top 3 players
		const sortedLeaderboard = [...leaderboard].sort((a, b) => b.score - a.score);
		const top3Players = sortedLeaderboard.slice(0, 3);
		
		top3Players.forEach((player, index) => {
			const item = document.createElement('div');
			item.className = itemClassName;
			
			// Add ranking class for styling
			if (index === 0) item.classList.add('first');
			else if (index === 1) item.classList.add('second');
			else if (index === 2) item.classList.add('third');
			
			// Add medal emoji for top 3
			const medal = this.medals[index] || '';
			
			item.innerHTML = `
				<span class="${nameClassName}">${medal} ${player.name || `Hráč ${player.id}`}</span>
				<span class="${scoreClassName}">${player.score}</span>
			`;
			container.appendChild(item);
		});

		return sortedLeaderboard; // Return sorted leaderboard for position checking
	}

	/**
	 * Find player position in leaderboard
	 * @param {Array} sortedLeaderboard - Sorted leaderboard array
	 * @param {Object} currentPlayer - Current player object with id or name
	 * @returns {Object|null} - Object with rank, player data, or null if not found
	 */
	findPlayerPosition(sortedLeaderboard, currentPlayer) {
		if (!sortedLeaderboard || !currentPlayer) return null;

		const playerIndex = sortedLeaderboard.findIndex(player => 
			player.id === currentPlayer.id || player.name === currentPlayer.name
		);

		if (playerIndex === -1) return null;

		return {
			rank: playerIndex + 1,
			player: sortedLeaderboard[playerIndex],
			isTop3: playerIndex < 3
		};
	}

	/**
	 * Generate position message for a player
	 * @param {Object} position - Position object from findPlayerPosition
	 * @returns {string} - Formatted message
	 */
	getPositionMessage(position) {
		if (!position) return '';

		if (position.isTop3) {
			const positions = ['1. miesto! 🏆', '2. miesto! 🥈', '3. miesto! 🥉'];
			return `Gratulujeme! Skončili ste na ${positions[position.rank - 1]}`;
		} else {
			return `Skončili ste na ${position.rank}. mieste so ${position.player.score} bodmi`;
		}
	}
}

// Export for ES6 modules
export { Top3Leaderboard };

// Also create default instance for convenience
export const defaultTop3Leaderboard = new Top3Leaderboard();