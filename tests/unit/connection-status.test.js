/**
 * Connection Status Banner Test Suite
 * Testing persistent connection status banner functionality
 * @jest-environment jsdom
 */

import { ConnectionStatusBanner } from '../../public/shared/connectionStatus.js';

describe('Connection Status Banner', () => {
	let banner;

	beforeEach(() => {
		// Create a clean DOM environment for each test
		document.body.innerHTML = '';
		banner = new ConnectionStatusBanner();
	});

	afterEach(() => {
		if (banner) {
			banner.destroy();
		}
	});

	describe('Initialization', () => {
		test('should initialize with default options', () => {
			expect(banner.bannerId).toBe('connectionStatusBanner');
			expect(banner.position).toBe('top');
			expect(banner.showSpinner).toBe(true);
			expect(banner.isVisible).toBe(false);
		});

		test('should accept custom options', () => {
			const customBanner = new ConnectionStatusBanner({
				bannerId: 'customBanner',
				position: 'bottom',
				showSpinner: false
			});

			expect(customBanner.bannerId).toBe('customBanner');
			expect(customBanner.position).toBe('bottom');
			expect(customBanner.showSpinner).toBe(false);
			
			customBanner.destroy();
		});

		test('should create banner element in DOM', () => {
			const bannerElement = document.getElementById('connectionStatusBanner');
			expect(bannerElement).toBeTruthy();
			expect(bannerElement.className).toContain('connection-status-banner');
		});

		test('should start hidden', () => {
			const bannerElement = document.getElementById('connectionStatusBanner');
			expect(bannerElement.style.display).toBe('none');
			expect(banner.isVisible).toBe(false);
		});
	});

	describe('Show/Hide Functionality', () => {
		test('should show banner with message', () => {
			const message = 'Connection lost';
			banner.show(message);
			
			const bannerElement = document.getElementById('connectionStatusBanner');
			expect(bannerElement.style.display).toBe('flex');
			expect(banner.isVisible).toBe(true);
			expect(banner.currentMessage).toBe(message);
		});

		test('should hide banner', () => {
			banner.show('Test message');
			banner.hide();
			
			const bannerElement = document.getElementById('connectionStatusBanner');
			expect(bannerElement.style.display).toBe('none');
			expect(banner.isVisible).toBe(false);
		});

		test('should update message when already visible', () => {
			banner.show('First message');
			banner.show('Second message');
			
			expect(banner.currentMessage).toBe('Second message');
		});

		test('should update message when hidden', () => {
			banner.updateMessage('New message');
			expect(banner.currentMessage).toBe('New message');
		});
	});

	describe('Reconnecting State', () => {
		test('should enter reconnecting state', () => {
			banner.showReconnecting();
			
			expect(banner.reconnectingState).toBe(true);
			expect(banner.isVisible).toBe(true);
		});

		test('should exit reconnecting state', () => {
			banner.showReconnecting();
			banner.hide();
			
			expect(banner.reconnectingState).toBe(false);
			expect(banner.isVisible).toBe(false);
		});

		test('should handle reconnecting state transitions', () => {
			banner.showReconnecting();
			expect(banner.reconnectingState).toBe(true);
			
			banner.showReconnected();
			expect(banner.reconnectingState).toBe(false);
		});
	});

	describe('Reconnection Success', () => {
		test('should show reconnected message when visible', () => {
			banner.show('Disconnected');
			banner.showReconnected();
			
			expect(banner.isVisible).toBe(true);
		});

		test('should not show reconnected message when hidden', () => {
			banner.showReconnected();
			expect(banner.isVisible).toBe(false);
		});

		test('should hide after success duration', async () => {
			banner.show('Disconnected');
			banner.showReconnected();
			
			// Wait for the success duration (1500ms)
			await new Promise(resolve => setTimeout(resolve, 1600));
			
			expect(banner.isVisible).toBe(false);
		});
	});

	describe('Icon Updates', () => {
		test('should update icon for different states', () => {
			const iconElement = document.getElementById('connectionStatusBannerIcon');
			
			banner.show('Disconnected');
			expect(iconElement.textContent).toBe('⚠️');
			
			banner.showReconnecting();
			expect(iconElement.textContent).toBe('🔄');
			
			banner.showReconnected();
			expect(iconElement.textContent).toBe('✅');
		});
	});

	describe('Spinner Control', () => {
		test('should show spinner', () => {
			banner.showSpinner();
			const spinnerElement = document.getElementById('connectionStatusBannerSpinner');
			expect(spinnerElement.style.display).toBe('inline-block');
		});

		test('should hide spinner', () => {
			banner.hideSpinner();
			const spinnerElement = document.getElementById('connectionStatusBannerSpinner');
			expect(spinnerElement.style.display).toBe('none');
		});

		test('should respect showSpinner option', () => {
			const noSpinnerBanner = new ConnectionStatusBanner({ showSpinner: false });
			const spinnerElement = document.getElementById('connectionStatusBannerSpinner');
			
			// Spinner should not be visible initially when showSpinner is false
			expect(spinnerElement).toBe(null);
			
			noSpinnerBanner.destroy();
		});
	});

	describe('Error Handling', () => {
		test('should handle missing banner element gracefully', () => {
			banner.banner.remove(); // Remove the banner element
			
			expect(() => banner.show('Test')).not.toThrow();
			expect(() => banner.hide()).not.toThrow();
		});

		test('should handle missing child elements gracefully', () => {
			const iconElement = document.getElementById('connectionStatusBannerIcon');
			iconElement.remove();
			
			expect(() => banner.show('Test')).not.toThrow();
		});
	});

	describe('Cleanup', () => {
		test('should destroy banner and clean up', () => {
			banner.destroy();
			
			const bannerElement = document.getElementById('connectionStatusBanner');
			expect(bannerElement).toBe(null);
		});

		test('should handle destruction when no banner exists', () => {
			banner.banner = null;
			expect(() => banner.destroy()).not.toThrow();
		});
	});

	describe('Integration Scenarios', () => {
		test('should handle complete disconnect/reconnect cycle', () => {
			// Simulate connection lost
			banner.show('Connection lost');
			expect(banner.isVisible).toBe(true);
			
			// Simulate reconnecting
			banner.showReconnecting();
			expect(banner.reconnectingState).toBe(true);
			
			// Simulate reconnected
			banner.showReconnected();
			expect(banner.reconnectingState).toBe(false);
		});

		test('should handle rapid disconnect/reconnect events', () => {
			banner.show('Disconnected');
			banner.showReconnecting();
			banner.hide();
			banner.show('Disconnected again');
			
			expect(banner.isVisible).toBe(true);
			expect(banner.reconnectingState).toBe(false);
		});

		test('should maintain state consistency during complex interactions', () => {
			banner.show('Initial message');
			expect(banner.isVisible).toBe(true);
			expect(banner.currentMessage).toBe('Initial message');
			
			banner.showReconnecting();
			expect(banner.reconnectingState).toBe(true);
			
			banner.updateMessage('Reconnecting...');
			expect(banner.currentMessage).toBe('Reconnecting...');
			
			banner.showReconnected();
			expect(banner.reconnectingState).toBe(false);
		});
	});
});