const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const http = require('http');
const express = require('express');
const path = require('path');
const { delay } = require('../helpers/test-utils');

describe('Create Game Flow E2E', () => {
	let server, port;

	beforeAll((done) => {
		// Create a minimal test server similar to the main app
		const app = express();
		
		// Static file serving
		app.use('/join', express.static(path.join(__dirname, '../../public/join')));
		app.use('/create', express.static(path.join(__dirname, '../../public/create')));
		app.use('/control', express.static(path.join(__dirname, '../../public/control')));
		app.use('/shared', express.static(path.join(__dirname, '../../public/shared')));
		
		// Routes
		app.get('/', (req, res) => {
			res.redirect('/join');
		});
		
		app.get('/join', (req, res) => {
			res.sendFile(path.join(__dirname, '../../public/join/join.html'));
		});
		
		app.get('/create', (req, res) => {
			res.sendFile(path.join(__dirname, '../../public/create/create.html'));
		});
		
		app.get('/control/:pin', (req, res) => {
			res.sendFile(path.join(__dirname, '../../public/control/control.html'));
		});
		
		// API endpoint for testing
		app.get('/api/game/:pin', (req, res) => {
			res.json({
				pin: req.params.pin,
				status: 'waiting',
				currentQuestionIndex: 0,
				questionCount: 10
			});
		});
		
		server = http.createServer(app);
		server.listen(0, () => {
			port = server.address().port;
			done();
		});
	});

	afterAll((done) => {
		server.close(done);
	});

	describe('Create Page Routing', () => {
		test('should serve create page at /create', async () => {
			const response = await fetch(`http://localhost:${port}/create`);
			expect(response.status).toBe(200);
			
			const html = await response.text();
			expect(html).toContain('Vytvoriť novú hru');
			expect(html).toContain('moderatorPassword');
			expect(html).toContain('createGameBtn');
		});

		test('should redirect from /create to /create/', async () => {
			const response = await fetch(`http://localhost:${port}/create`, {
				redirect: 'manual'
			});
			
			expect(response.status).toBe(301);
			expect(response.headers.get('location')).toBe('/create/');
		});

		test('should serve join page with create link', async () => {
			const response = await fetch(`http://localhost:${port}/join`);
			expect(response.status).toBe(200);
			
			const html = await response.text();
			expect(html).toContain('create-link');
			expect(html).toContain('Vytvoriť novú hru →');
			expect(html).toContain('href="/create"');
		});

		test('should serve control page with create link', async () => {
			const response = await fetch(`http://localhost:${port}/control/123456`);
			expect(response.status).toBe(200);
			
			const html = await response.text();
			expect(html).toContain('href="/create"');
			expect(html).toContain('➕ Nová hra');
		});
	});

	describe('Create Page Assets', () => {
		test('should serve create.js script', async () => {
			const response = await fetch(`http://localhost:${port}/create/create.js`);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('javascript');
			
			const js = await response.text();
			expect(js).toContain('CreateApp');
			expect(js).toContain('CREATE_GAME');
			expect(js).toContain('handleGameCreated');
		});

		test('should serve shared common.css', async () => {
			const response = await fetch(`http://localhost:${port}/shared/common.css`);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('css');
			
			const css = await response.text();
			expect(css).toContain('--primary-purple');
			expect(css).toContain('.btn');
		});
	});

	describe('Create Page Structure', () => {
		test('create page should have correct HTML structure', async () => {
			const response = await fetch(`http://localhost:${port}/create`);
			const html = await response.text();
			
			// Check for form elements
			expect(html).toContain('id="moderatorPassword"');
			expect(html).toContain('id="createGameBtn"');
			expect(html).toContain('id="cancelBtn"');
			
			// Check for labels
			expect(html).toContain('Heslo moderátora');
			
			// Check for helpful text
			expect(html).toContain('Povinné pre opätovné pripojenie k hre');
			expect(html).toContain('Vytvoriť hru');
			expect(html).toContain('Zrušiť');
		});
	});
});