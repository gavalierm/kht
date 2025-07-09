/**
 * Connection Banner Integration Tests
 * E2E tests to verify connection banner works correctly without conflicts
 */

const request = require('supertest');
const app = require('../../server.js');

describe('Connection Banner Integration', () => {
	describe('HTML Pages Include Connection Banner', () => {
		test('game page includes connection banner script', async () => {
			const response = await request(app)
				.get('/game/123456')
				.expect(200);

			const html = response.text;
			expect(html).toContain('connectionStatus.js');
			expect(html).toContain('/shared/common.css');
		});

		test('moderator page includes connection banner script', async () => {
			const response = await request(app)
				.get('/moderator/123456')
				.expect(200);

			const html = response.text;
			expect(html).toContain('connectionStatus.js');
			expect(html).toContain('/shared/common.css');
		});

		test('panel page includes connection banner script', async () => {
			const response = await request(app)
				.get('/panel/123456')
				.expect(200);

			const html = response.text;
			expect(html).toContain('connectionStatus.js');
			expect(html).toContain('/shared/common.css');
		});

		test('stage page includes connection banner script', async () => {
			const response = await request(app)
				.get('/stage/123456')
				.expect(200);

			const html = response.text;
			expect(html).toContain('connectionStatus.js');
			expect(html).toContain('/shared/common.css');
		});
	});

	describe('CSS Styles for Connection Banner', () => {
		test('common.css includes connection banner styles', async () => {
			const response = await request(app)
				.get('/shared/common.css')
				.expect(200);

			const css = response.text;
			
			// Check for main banner styles
			expect(css).toContain('.connection-status-banner');
			expect(css).toContain('.connection-status-content');
			expect(css).toContain('.connection-status-message');
			expect(css).toContain('.connection-status-icon');
			expect(css).toContain('.connection-status-spinner');
			
			// Check for state classes
			expect(css).toContain('.connection-status-visible');
			expect(css).toContain('.connection-status-reconnecting');
			expect(css).toContain('.connection-status-success');
			
			// Check for animations
			expect(css).toContain('@keyframes spin');
			expect(css).toContain('@keyframes pulse');
			expect(css).toContain('@keyframes bounce');
		});
	});

	describe('JavaScript Module Availability', () => {
		test('connection status module is accessible', async () => {
			const response = await request(app)
				.get('/shared/connectionStatus.js')
				.expect(200);

			const js = response.text;
			
			// Check for main class and exports
			expect(js).toContain('class ConnectionStatusBanner');
			expect(js).toContain('export class ConnectionStatusBanner');
			expect(js).toContain('export const defaultConnectionBanner');
			
			// Check for key methods
			expect(js).toContain('show(');
			expect(js).toContain('hide(');
			expect(js).toContain('setReconnecting(');
			expect(js).toContain('showReconnected(');
			expect(js).toContain('updateMessage(');
		});

		test('socket manager imports connection banner', async () => {
			const response = await request(app)
				.get('/shared/socket.js')
				.expect(200);

			const js = response.text;
			expect(js).toContain('import { defaultConnectionBanner }');
			expect(js).toContain('defaultConnectionBanner.show');
			expect(js).toContain('defaultConnectionBanner.showReconnected');
		});
	});

	describe('No Duplicate Notification Systems', () => {
		test('game.js does not contain duplicate connection notifications', async () => {
			const response = await request(app)
				.get('/game.js')
				.expect(200);

			const js = response.text;
			
			// Should not contain old connection notifications
			expect(js).not.toContain('showWarning(\'Spojenie prerušené');
			expect(js).not.toContain('showInfo(\'Pokúšam sa pripojiť');
			expect(js).not.toContain('showSuccess(\'Úspešne pripojené');
			
			// Should contain comments indicating banner handles it
			expect(js).toContain('Connection banner handles');
		});

		test('moderator.js does not contain duplicate connection notifications', async () => {
			const response = await request(app)
				.get('/moderator/moderator.js')
				.expect(200);

			const js = response.text;
			
			// Should not contain old connection notifications
			expect(js).not.toContain('showWarning(\'Spojenie so serverom bolo prerušené');
			
			// Should contain comment indicating banner handles it
			expect(js).toContain('Connection banner handles');
		});

		test('stage.js does not contain duplicate connection notifications', async () => {
			const response = await request(app)
				.get('/stage/stage.js')
				.expect(200);

			const js = response.text;
			
			// Should not contain old connection notifications
			expect(js).not.toContain('showWarning(\'Spojenie so serverom bolo prerušené');
			
			// Should contain comment indicating banner handles it
			expect(js).toContain('Connection banner handles');
		});
	});

	describe('Preserved Game-Specific Notifications', () => {
		test('game.js preserves non-connection notifications', async () => {
			const response = await request(app)
				.get('/game.js')
				.expect(200);

			const js = response.text;
			
			// Should preserve game-specific notifications
			expect(js).toContain('showSuccess(`Pripojené ako Hráč');
			expect(js).toContain('showError(data.message)');
			expect(js).toContain('showError(\'PIN musí mať');
			expect(js).toContain('showError(`Hra s PIN');
			expect(js).toContain('showInfo(\'Otázka práve prebieha');
		});
	});

	describe('Banner Timing Requirements', () => {
		test('banner positioning allows immediate display', async () => {
			const response = await request(app)
				.get('/shared/common.css')
				.expect(200);

			const css = response.text;
			
			// Check for proper positioning and z-index for immediate visibility
			expect(css).toContain('position: fixed');
			expect(css).toContain('z-index: 9999');
			expect(css).toContain('top: 0');
			
			// Check for fast transitions (meeting 1 second requirement)
			expect(css).toContain('transition: transform 0.3s ease-out');
		});
	});

	describe('Responsive Design', () => {
		test('banner includes mobile-responsive styles', async () => {
			const response = await request(app)
				.get('/shared/common.css')
				.expect(200);

			const css = response.text;
			
			// Check for mobile media queries
			expect(css).toContain('@media (max-width: 768px)');
			expect(css).toContain('.connection-status-content');
			expect(css).toContain('padding: 10px 16px');
		});
	});
});