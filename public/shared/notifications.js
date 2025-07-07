/**
 * Notification system for displaying messages to users
 */

export class NotificationManager {
	constructor(messageBoxId = 'messageBox') {
		this.messageBox = null;
		this.messageBoxId = messageBoxId;
	}

	/**
	 * Get or create the message box element
	 * @returns {HTMLElement} Message box element
	 */
	getMessageBox() {
		if (!this.messageBox) {
			this.messageBox = document.getElementById(this.messageBoxId);
			if (!this.messageBox) {
				console.warn(`Message box with ID '${this.messageBoxId}' not found`);
			}
		}
		return this.messageBox;
	}

	/**
	 * Show a notification message
	 * @param {string} message - Message to display
	 * @param {string} type - Type of message (error, info, success, warning)
	 * @param {number} duration - Duration in milliseconds (default: 3000)
	 */
	showNotification(message, type = 'info', duration = 3000) {
		const messageBox = this.getMessageBox();
		if (!messageBox) return;

		const notification = document.createElement('div');
		notification.classList.add(type);
		notification.textContent = message;

		messageBox.appendChild(notification);

		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, duration);
	}

	/**
	 * Show an error message
	 * @param {string} message - Error message to display
	 */
	showError(message) {
		this.showNotification(message, 'error');
	}

	/**
	 * Show an info message
	 * @param {string} message - Info message to display
	 */
	showInfo(message) {
		this.showNotification(message, 'info');
	}

	/**
	 * Show a success message
	 * @param {string} message - Success message to display
	 */
	showSuccess(message) {
		this.showNotification(message, 'success');
	}

	/**
	 * Show a warning message
	 * @param {string} message - Warning message to display
	 */
	showWarning(message) {
		this.showNotification(message, 'warning');
	}

	/**
	 * Clear all notifications
	 */
	clearAll() {
		const messageBox = this.getMessageBox();
		if (messageBox) {
			messageBox.innerHTML = '';
		}
	}
}

// Create a default instance
export const defaultNotificationManager = new NotificationManager();

// Export convenience methods
export const showError = defaultNotificationManager.showError.bind(defaultNotificationManager);
export const showInfo = defaultNotificationManager.showInfo.bind(defaultNotificationManager);
export const showSuccess = defaultNotificationManager.showSuccess.bind(defaultNotificationManager);
export const showWarning = defaultNotificationManager.showWarning.bind(defaultNotificationManager);
export const showNotification = defaultNotificationManager.showNotification.bind(defaultNotificationManager);