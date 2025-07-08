/**
 * Connection Status Banner Component
 * Provides persistent visual feedback for socket connection status
 */

export class ConnectionStatusBanner {
	constructor(options = {}) {
		this.bannerId = options.bannerId || 'connectionStatusBanner';
		this.position = options.position || 'top'; // top or bottom
		this.showSpinner = options.showSpinner !== false; // default true
		
		this.banner = null;
		this.isVisible = false;
		this.currentMessage = '';
		this.reconnectingState = false;
		
		this.init();
	}

	/**
	 * Initialize the banner component
	 */
	init() {
		this.createBanner();
		this.hide(); // Start hidden
	}

	/**
	 * Create the banner HTML element
	 */
	createBanner() {
		// Check if banner already exists
		let existingBanner = document.getElementById(this.bannerId);
		if (existingBanner) {
			this.banner = existingBanner;
			return;
		}

		// Create banner element
		this.banner = document.createElement('div');
		this.banner.id = this.bannerId;
		this.banner.className = `connection-status-banner connection-status-${this.position}`;
		
		// Create banner content structure
		this.banner.innerHTML = `
			<div class="connection-status-content">
				<div class="connection-status-icon" id="${this.bannerId}Icon">
					⚡
				</div>
				<div class="connection-status-message" id="${this.bannerId}Message">
					Connection lost. Trying to reconnect...
				</div>
				<div class="connection-status-spinner" id="${this.bannerId}Spinner">
					<div class="spinner"></div>
				</div>
			</div>
		`;

		// Add to page
		document.body.appendChild(this.banner);
		
		// Cache child elements
		this.iconElement = document.getElementById(`${this.bannerId}Icon`);
		this.messageElement = document.getElementById(`${this.bannerId}Message`);
		this.spinnerElement = document.getElementById(`${this.bannerId}Spinner`);
	}

	/**
	 * Show the banner with specified message
	 * @param {string} message - Message to display
	 * @param {boolean} showSpinner - Whether to show spinner
	 */
	show(message = 'Connection lost. Trying to reconnect...', showSpinner = true) {
		if (!this.banner) {
			console.warn('Connection status banner not initialized');
			return;
		}

		this.currentMessage = message;
		this.updateMessage(message);
		this.setSpinnerVisible(showSpinner && this.showSpinner);
		
		// Add visible class with animation
		this.banner.classList.add('connection-status-visible');
		this.isVisible = true;

		// Update icon based on state
		this.updateIcon('disconnected');
	}

	/**
	 * Hide the banner
	 */
	hide() {
		if (!this.banner) return;

		this.banner.classList.remove('connection-status-visible');
		this.isVisible = false;
		this.reconnectingState = false;
	}

	/**
	 * Update the banner message
	 * @param {string} message - New message to display
	 */
	updateMessage(message) {
		if (this.messageElement) {
			this.messageElement.textContent = message;
			this.currentMessage = message;
		}
	}

	/**
	 * Set the banner to reconnecting state
	 * @param {boolean} isReconnecting - Whether currently reconnecting
	 */
	setReconnecting(isReconnecting = true) {
		this.reconnectingState = isReconnecting;
		
		if (isReconnecting) {
			this.updateMessage('Reconnecting...');
			this.setSpinnerVisible(true);
			this.updateIcon('reconnecting');
			this.banner.classList.add('connection-status-reconnecting');
		} else {
			this.banner.classList.remove('connection-status-reconnecting');
		}
	}

	/**
	 * Show reconnection success message briefly before hiding
	 * @param {string} message - Success message
	 * @param {number} duration - How long to show success message (ms)
	 */
	showReconnected(message = 'Reconnected!', duration = 2000) {
		if (!this.isVisible) return;

		this.updateMessage(message);
		this.setSpinnerVisible(false);
		this.updateIcon('connected');
		this.banner.classList.add('connection-status-success');
		this.banner.classList.remove('connection-status-reconnecting');

		// Hide after specified duration
		setTimeout(() => {
			this.banner.classList.remove('connection-status-success');
			this.hide();
		}, duration);
	}

	/**
	 * Update the status icon
	 * @param {string} state - 'connected', 'disconnected', 'reconnecting'
	 */
	updateIcon(state) {
		if (!this.iconElement) return;

		switch (state) {
			case 'connected':
				this.iconElement.textContent = '✅';
				break;
			case 'disconnected':
				this.iconElement.textContent = '⚠️';
				break;
			case 'reconnecting':
				this.iconElement.textContent = '🔄';
				break;
			default:
				this.iconElement.textContent = '⚡';
		}
	}

	/**
	 * Show or hide the spinner
	 * @param {boolean} visible - Whether spinner should be visible
	 */
	setSpinnerVisible(visible) {
		if (this.spinnerElement) {
			this.spinnerElement.style.display = visible ? 'flex' : 'none';
		}
	}

	/**
	 * Check if banner is currently visible
	 * @returns {boolean} Banner visibility state
	 */
	isShown() {
		return this.isVisible;
	}

	/**
	 * Get current message
	 * @returns {string} Current banner message
	 */
	getMessage() {
		return this.currentMessage;
	}

	/**
	 * Destroy the banner and clean up
	 */
	destroy() {
		if (this.banner && this.banner.parentNode) {
			this.banner.parentNode.removeChild(this.banner);
		}
		this.banner = null;
		this.isVisible = false;
	}
}

// Create default instance
export const defaultConnectionBanner = new ConnectionStatusBanner();

// Export convenience methods
export const showConnectionLost = (message) => defaultConnectionBanner.show(message);
export const hideConnectionBanner = () => defaultConnectionBanner.hide();
export const setReconnecting = (isReconnecting) => defaultConnectionBanner.setReconnecting(isReconnecting);
export const showReconnected = (message, duration) => defaultConnectionBanner.showReconnected(message, duration);
export const isConnectionBannerVisible = () => defaultConnectionBanner.isShown();