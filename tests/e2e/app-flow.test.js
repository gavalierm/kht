const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const http = require('http');
const express = require('express');
const path = require('path');
const { delay } = require('../helpers/test-utils');

describe('End-to-End Application Flow', () => {
  let server, port;

  beforeAll((done) => {
    // Create a minimal test server similar to the main app
    const app = express();
    
    // Static file serving
    app.use('/app', express.static(path.join(__dirname, '../../public/app')));
    app.use('/dashboard', express.static(path.join(__dirname, '../../public/dashboard')));
    app.use('/panel', express.static(path.join(__dirname, '../../public/panel')));
    
    // Routes
    app.get('/', (req, res) => {
      res.redirect('/app');
    });
    
    app.get('/app', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/app/app.html'));
    });
    
    app.get('/app/:pin', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/app/app.html'));
    });
    
    // Mock API endpoint
    app.get('/api/game/:pin', (req, res) => {
      const pin = req.params.pin;
      if (pin === '123456') {
        res.json({
          pin: pin,
          title: 'Test Game',
          status: 'waiting',
          currentQuestionIndex: 0,
          questionCount: 5
        });
      } else {
        res.status(404).json({ error: 'Game not found' });
      }
    });
    
    app.get('/favicon.ico', (req, res) => {
      res.status(204).end();
    });
    
    server = http.createServer(app);
    
    server.listen(() => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('Static File Serving', () => {
    test('should serve the main app page', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Zahraj si s nami kvízovú hru!');
      expect(html).toContain('PIN');
    });

    test('should redirect root to app', async () => {
      const response = await fetch(`http://localhost:${port}/`, {
        redirect: 'manual'
      });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/app');
    });

    test('should serve app with PIN in URL', async () => {
      const response = await fetch(`http://localhost:${port}/app/123456`);
      expect(response.status).toBe(200);
      
      const html = await response.text();
      expect(html).toContain('Zahraj si s nami kvízovú hru!');
    });

    test('should handle favicon requests', async () => {
      const response = await fetch(`http://localhost:${port}/favicon.ico`);
      expect(response.status).toBe(204);
    });
  });

  describe('API Endpoints', () => {
    test('should return game data for valid PIN', async () => {
      const response = await fetch(`http://localhost:${port}/api/game/123456`);
      expect(response.status).toBe(200);
      
      const gameData = await response.json();
      expect(gameData.pin).toBe('123456');
      expect(gameData.title).toBe('Test Game');
      expect(gameData.status).toBe('waiting');
      expect(gameData.questionCount).toBe(5);
    });

    test('should return 404 for invalid PIN', async () => {
      const response = await fetch(`http://localhost:${port}/api/game/999999`);
      expect(response.status).toBe(404);
      
      const error = await response.json();
      expect(error.error).toBe('Game not found');
    });

    test('should handle malformed PIN requests', async () => {
      const response = await fetch(`http://localhost:${port}/api/game/abc`);
      expect(response.status).toBe(404);
    });
  });

  describe('Application Structure', () => {
    test('should have valid HTML structure', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      // Check for essential HTML elements
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</html>');
      
      // Check for app-specific elements
      expect(html).toContain('id="login"');
      expect(html).toContain('id="game"');
      expect(html).toContain('id="gamePinInput"');
      expect(html).toContain('id="joinGameBtn"');
    });

    test('should include necessary scripts', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      // Check for Socket.io client
      expect(html).toContain('socket.io/socket.io.js');
      
      // Check for app script
      expect(html).toContain('/app/app.js');
    });

    test('should have responsive meta tag', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      expect(html).toContain('name="viewport"');
      expect(html).toContain('width=device-width');
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent routes gracefully', async () => {
      const response = await fetch(`http://localhost:${port}/nonexistent`);
      expect(response.status).toBe(404);
    });

    test('should handle requests to missing static files', async () => {
      const response = await fetch(`http://localhost:${port}/app/nonexistent.js`);
      // Express static might serve the main HTML for SPA routing, so check for reasonable response
      expect([200, 404]).toContain(response.status);
      
      // If it's 200, it should be serving the main HTML file
      if (response.status === 200) {
        const content = await response.text();
        expect(content).toContain('<!DOCTYPE html>');
      }
    });
  });

  describe('Performance', () => {
    test('should respond quickly to basic requests', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`http://localhost:${port}/app`);
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('should handle multiple concurrent requests', async () => {
      const requests = Array(10).fill().map(() => 
        fetch(`http://localhost:${port}/app`)
      );
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Content Validation', () => {
    test('should serve valid CSS', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      // Check for CSS styles in the HTML
      expect(html).toContain('<style>');
      expect(html).toContain('background: #47109e'); // App's purple background
      expect(html).toContain('.page'); // CSS classes
    });

    test('should have proper Slovak language content', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      // Check for Slovak text
      expect(html).toContain('Zahraj si s nami kvízovú hru!');
      expect(html).toContain('Pripojiť sa');
      expect(html).toContain('Zadajte 6-miestny PIN');
    });

    test('should have proper character encoding', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      expect(html).toContain('charset="UTF-8"');
      expect(html).toContain('lang="sk"'); // Slovak language
    });
  });

  describe('Application State', () => {
    test('should initialize with login page visible', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      // Login page should be visible by default
      expect(html).toMatch(/class="page[^"]*visible"[^>]*id="login"/);
      
      // Game page should not be visible initially
      expect(html).not.toMatch(/class="page[^"]*visible"[^>]*id="game"/);
    });

    test('should have proper game elements structure', async () => {
      const response = await fetch(`http://localhost:${port}/app`);
      const html = await response.text();
      
      // Check for game structure
      expect(html).toContain('id="playground"');
      expect(html).toContain('id="scoreboard"');
      expect(html).toContain('id="options"');
      expect(html).toContain('class="option option_a"');
      expect(html).toContain('class="option option_b"');
      expect(html).toContain('class="option option_c"');
      expect(html).toContain('class="option option_d"');
    });
  });
});