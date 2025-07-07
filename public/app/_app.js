class App {
	constructor() {
		this.socket = io();

		this.gamePin = null;
		this.currentGame = null;
		this.currentQuestion = null;
		this.hasAnswered = false;
		this.timerInterval = null;
		this.latencyInterval = null;
		this.playerToken = null;

		this.messageBox = null;
        
		this.bindEvents();

		this.joinGame();
		//this.setupSocketEvents();
		//this.startLatencyMeasurement();
		//this.checkForSavedSession();
	}

	redirectToLogin() {
		return this.redirectTo('/app');
	}

	redirectTo(path = '/app') {
		const normalize = p => p.replace(/\/+$/, '').toLowerCase(); // odstráni koncové lomky a znormalizuje
		const currentPath = normalize(window.location.pathname);
		const targetPath = normalize(path);

		// Regex overenie: povolené len alfanumerické znaky, pomlčky a lomky
		if (!/^\/[a-z0-9\/\-]*$/i.test(targetPath)) {
			console.error('Neplatná cieľová cesta:', targetPath);
			return;
		}

		if (currentPath !== targetPath) {
			history.pushState(null, '', path);
		}

		this.handleRouteChange(targetPath);
	}

	handleRouteChange(path) {
		// Skry všetky stránky
		document.querySelectorAll('.page').forEach(el => {
			el.classList.remove('visible');
		});

		console.log('handleRouteChange', path)

		switch (path) {
			case '/app':
				document.querySelector('#login.page')?.classList.add('visible');
				break;

			case '/game':
				document.querySelector('#game.page')?.classList.add('visible');
				break;

			default:
				console.warn('Neznáma cesta:', path);
		}
	}

	async joinGame() {

		this.joinGameBtn.disabled = false;
		this.joinGameBtn.textContent = 'Pripojiť sa';

		console.log('joinGame', this.gamePin);

		if (!this.gamePin) {
			this.gamePin = (window.location.pathname.split('/')[2]?.trim() || null);
		}

		if (!this.gamePin) {
			this.gamePinInput = this.gamePinInput ?? document.getElementById("gamePinInput");
			this.gamePin = (this.gamePinInput.value.trim() || null);
		}

		if (!this.gamePin) {
			this.gamePin = null;
			return this.redirectToLogin();
		}

		if (this.gamePin.length < 6) {
			this.showError('PIN musí mať aspoň 6 znakov');
			this.gamePin = null;
			return this.redirectToLogin();
		}
		
		this.joinGameBtn.disabled = true;
		this.joinGameBtn.textContent = 'Pripájam sa...';
        
		console.log(`Attempting to join game: ${this.gamePin}`);

		const game = await this.api('getGame', this.gamePin);

		if (!game) {
			this.showError(`No Game with pin ${this.gamePin}`);
			return this.redirectToLogin();
		}

		console.log(game);
        
		if (game.status == 'CLOSED') {
			this.showWarning('Hra skončila');

			this.gamePin = null;
			
			this.joinGameBtn.disabled = false;
			this.joinGameBtn.textContent = 'Pripojiť sa';
			this.gamePinInput.value = '';

			return this.redirectToLogin(); 
		}
		

		this.joinGameBtn.disabled = true;
		this.joinGameBtn.textContent = 'Pripojené';
		//this.socket.emit('join_game', {
		//	gamePin: gamePin
		//});
	}

	async api(action, payload = null) {
		switch (action) {
			case 'getGame':
				if (!payload) {
					console.warn('Chýba PIN payload.');
					return null;
				}
				try {
					const res = await fetch(`/api/game/${payload}`);
					if (!res.ok) return null;
					return await res.json();
				} catch (err) {
					console.error('Chyba pri načítaní hry:', err);
					return null;
				}

			default:
				console.warn('Neznáme API:', action);
				return null;
		}
	}


	bindEvents() {
		//elements
		this.joinGameBtn = this.joinGameBtn ?? document.getElementById("joinGameBtn");
		this.joinGameBtn.addEventListener('click', () => this.joinGame());
	}

	showError(message) {
		return this.showNotification(message, 'error');
	}

	showInfo(message) {
		return this.showNotification(message, 'info');
	}

	showSuccess(message) {
		return this.showNotification(message, 'success');
	}

	showWarning(message) {
		return this.showNotification(message, 'warning');
	}

	showNotification(message, type = 'info') {
		// Simple notification system
		const notification = document.createElement('div');

		notification.classList.add(type);
		notification.textContent = message;

		this.messageBox = this.messageBox ?? document.getElementById("messageBox"); 
        
		this.messageBox.appendChild(notification);
        
		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, 3000);
	}


}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
	new App();
});
