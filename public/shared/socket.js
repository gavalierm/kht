/**
 * Socket.io connection and event handling utilities
 */

import { defaultConnectionBanner } from './connectionStatus.js';

export class SocketManager {
	constructor() {
		this.socket = null;
		this.eventHandlers = new Map();
		this.isConnected = false;
	}

	/**
	 * Initialize socket connection
	 * @returns {Socket} Socket.io instance
	 */
	connect() {
		if (this.socket) {
			return this.socket;
		}

		this.socket = io();
		this.setupBaseEvents();
		return this.socket;
	}

	/**
	 * Setup base connection events
	 */
	setupBaseEvents() {
		this.socket.on('connect', () => {
			this.isConnected = true;
			
			// Hide connection banner if it was visible
			if (defaultConnectionBanner.isShown()) {
				defaultConnectionBanner.showReconnected('Spojenie obnovené!', 2000);
			}
			
			this.emit('socket:connected');
		});

		this.socket.on('disconnect', (reason) => {
			console.log('Disconnected from server:', reason);
			this.isConnected = false;
			
			// Show persistent connection banner
			defaultConnectionBanner.show('Spojenie sa stratilo. Pokúšam sa znovu pripojiť...', true);
			
			this.emit('socket:disconnected');
		});

		this.socket.on('reconnect_attempt', () => {
			console.log('Attempting to reconnect...');
			defaultConnectionBanner.setReconnecting(true);
		});

		this.socket.on('reconnect', () => {
			console.log('Reconnected to server');
			this.isConnected = true;
			
			// Show success message before hiding
			defaultConnectionBanner.showReconnected('Spojenie obnovené!', 2000);
			
			this.emit('socket:reconnected');
		});

		this.socket.on('reconnect_failed', () => {
			console.log('Reconnection failed');
			defaultConnectionBanner.updateMessage('Nepodarilo sa obnoviť spojenie. Skúste obnoviť stránku.');
			defaultConnectionBanner.setReconnecting(false);
		});
	}

	/**
	 * Add event listener
	 * @param {string} event - Event name
	 * @param {Function} handler - Event handler
	 */
	on(event, handler) {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, []);
		}
		this.eventHandlers.get(event).push(handler);

		if (this.socket) {
			this.socket.on(event, handler);
		}
	}

	/**
	 * Remove event listener
	 * @param {string} event - Event name
	 * @param {Function} handler - Event handler to remove
	 */
	off(event, handler) {
		const handlers = this.eventHandlers.get(event);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index > -1) {
				handlers.splice(index, 1);
			}
		}

		if (this.socket) {
			this.socket.off(event, handler);
		}
	}

	/**
	 * Emit event
	 * @param {string} event - Event name
	 * @param {any} data - Event data
	 */
	emit(event, data) {
		if (this.socket) {
			this.socket.emit(event, data);
		}
	}

	/**
	 * Add event listener that fires only once
	 * @param {string} event - Event name
	 * @param {Function} handler - Event handler
	 */
	once(event, handler) {
		if (this.socket) {
			this.socket.once(event, handler);
		}
	}

	/**
	 * Check if socket is connected
	 * @returns {boolean} Connection status
	 */
	connected() {
		return this.socket && this.socket.connected;
	}

	/**
	 * Get socket instance
	 * @returns {Socket} Socket.io instance
	 */
	getSocket() {
		return this.socket;
	}

	/**
	 * Disconnect and reset socket connection
	 */
	disconnect() {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
			this.isConnected = false;
		}
	}

	/**
	 * Setup latency measurement
	 * @param {HTMLElement} latencyDisplay - Element to display latency
	 */
	setupLatencyMeasurement(latencyDisplay) {
		if (!latencyDisplay) return;

		let currentLatency = 0;

		// Listen for latency ping from server
		this.on('latency_ping', (timestamp) => {
			const clientTimestamp = Date.now();
			this.emit('latency_pong', timestamp);
			
			// Calculate round-trip latency
			// Note: This is a simplified client-side calculation
			// The server also calculates latency for game logic
			currentLatency = Math.round((clientTimestamp - timestamp) / 2);
		});

		// Update latency display every second
		setInterval(() => {
			if (this.connected()) {
				latencyDisplay.textContent = `${currentLatency}ms`;
			} else {
				latencyDisplay.textContent = '0ms';
			}
		}, 1000);
	}
}

// Create default instance
export const defaultSocketManager = new SocketManager();

// Export convenience methods
export const connectSocket = () => defaultSocketManager.connect();
export const socketOn = defaultSocketManager.on.bind(defaultSocketManager);
export const socketOff = defaultSocketManager.off.bind(defaultSocketManager);
export const socketEmit = defaultSocketManager.emit.bind(defaultSocketManager);
export const socketOnce = defaultSocketManager.once.bind(defaultSocketManager);
export const isSocketConnected = defaultSocketManager.connected.bind(defaultSocketManager);
export const getSocket = defaultSocketManager.getSocket.bind(defaultSocketManager);