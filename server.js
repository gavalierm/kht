const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// HTTP endpoint
app.get('/', (req, res) => {
  res.redirect('/app');
});

// explicitne dve routy:
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'app.html'));
});

app.get('/app/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'app.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'dashboard.html'));
});

app.get('/dashboard/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'dashboard.html'));
});

app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel', 'panel.html'));
});

app.get('/panel/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel', 'panel.html'));
});


// WebSocket logika
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('message', (msg) => {
    console.log('Received message:', msg);
    socket.broadcast.emit('message', msg); // posiela ostatným
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
