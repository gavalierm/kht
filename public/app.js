// Quiz App Client
class QuizApp {
    constructor() {
        this.socket = io();
        this.currentGame = null;
        this.currentQuestion = null;
        this.hasAnswered = false;
        this.timerInterval = null;
        this.latencyInterval = null;
        this.playerToken = null;
        this.isReconnecting = false; // Prevent reconnection loops
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketEvents();
        this.startLatencyMeasurement();
        this.checkForSavedSession();
    }

    initializeElements() {
        // Screens
        this.loginScreen = document.getElementById('loginScreen');
        this.waitingScreen = document.getElementById('waitingScreen');
        this.questionScreen = document.getElementById('questionScreen');
        this.resultScreen = document.getElementById('resultScreen');
        this.finalScreen = document.getElementById('finalScreen');
        
        // Login elements
        this.gamePinInput = document.getElementById('gamePinInput');
        this.playerNameInput = document.getElementById('playerNameInput');
        this.joinGameBtn = document.getElementById('joinGameBtn');
        this.errorMessage = document.getElementById('errorMessage');
        
        // Waiting screen elements
        this.connectedPlayerName = document.getElementById('connectedPlayerName');
        this.connectedGamePin = document.getElementById('connectedGamePin');
        this.waitingPlayersCount = document.getElementById('waitingPlayersCount');
        
        // Question screen elements
        this.questionCounter = document.getElementById('questionCounter');
        this.timerCircle = document.getElementById('timerCircle');
        this.timeRemaining = document.getElementById('timeRemaining');
        this.questionText = document.getElementById('questionText');
        this.answersGrid = document.getElementById('answersGrid');
        this.answerSubmitted = document.getElementById('answerSubmitted');
        
        // Result screen elements
        this.resultIcon = document.getElementById('resultIcon');
        this.resultTitle = document.getElementById('resultTitle');
        this.correctAnswerText = document.getElementById('correctAnswerText');
        this.pointsEarned = document.getElementById('pointsEarned');
        this.totalScore = document.getElementById('totalScore');
        this.currentPosition = document.getElementById('currentPosition');
        this.responseTime = document.getElementById('responseTime');
        
        // Final screen elements
        this.finalPosition = document.getElementById('finalPosition');
        this.positionMedal = document.getElementById('positionMedal');
        this.finalPositionNumber = document.getElementById('finalPositionNumber');
        this.finalScore = document.getElementById('finalScore');
        this.finalLeaderboardMobile = document.getElementById('finalLeaderboardMobile');
        this.topPlayersList = document.getElementById('topPlayersList');
        this.playAgainBtn = document.getElementById('playAgainBtn');
        
        // Connection status
        this.connectionStatus = document.getElementById('connectionStatus');
    }

    bindEvents() {
        this.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.playAgainBtn.addEventListener('click', () => this.resetToLogin());
        
        // Enter key handling
        this.gamePinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.playerNameInput.focus();
            }
        });
        
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });
        
        // Format PIN input - allow letters and numbers
        this.gamePinInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 20);
        });
        
        // Format player name input
        this.playerNameInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.substring(0, 20);
        });
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            this.hideConnectionStatus();
            console.log('Connected to server');
            
            // Reset reconnect counter on successful connection
            this.reconnectAttempts = 0;
            
            // Try to reconnect to saved session only if not already reconnecting
            if (!this.isReconnecting) {
                this.attemptSessionReconnect();
            }
        });

        this.socket.on('disconnect', () => {
            this.showConnectionStatus('offline', 'Pripájam sa...');
            console.log('Disconnected from server');
            // Don't auto-clear session on disconnect - wait for reconnect
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.showConnectionStatus('offline', 'Chyba pripojenia');
        });

        this.socket.on('latency_ping', (timestamp) => {
            this.socket.emit('latency_pong', timestamp);
        });

        this.socket.on('game_joined', (data) => {
            // Clear join timeout
            if (this.joinTimeout) {
                clearTimeout(this.joinTimeout);
                this.joinTimeout = null;
            }
            
            this.isReconnecting = false; // Reset reconnection flag
            this.hideConnectionStatus(); // Hide any connection status
            
            this.currentGame = data;
            this.playerToken = data.playerToken;
            this.saveSession(data.gamePin, data.playerName, data.playerToken);
            
            this.connectedPlayerName.textContent = data.playerName;
            this.connectedGamePin.textContent = data.gamePin;
            this.waitingPlayersCount.textContent = data.playersCount;
            
            this.showScreen('waitingScreen');
            this.hideError();
            console.log(`Joined game ${data.gamePin} as ${data.playerName}`);
        });

        this.socket.on('player_reconnected', (data) => {
            this.isReconnecting = false; // Reset reconnection flag
            this.reconnectAttempts = 0;
            this.hideConnectionStatus(); // Hide reconnection status
            
            this.currentGame = data;
            this.connectedPlayerName.textContent = data.playerName;
            this.connectedGamePin.textContent = data.gamePin;
            this.totalScore.textContent = data.score;
            
            // Show appropriate screen based on game status
            if (data.gameStatus === 'WAITING') {
                this.showScreen('waitingScreen');
            } else if (data.gameStatus === 'QUESTION_ACTIVE') {
                this.showScreen('questionScreen');
            } else {
                this.showScreen('waitingScreen');
            }
            
            this.hideError();
            console.log(`Reconnected to game ${data.gamePin} as ${data.playerName}`);
            this.showNotification('Úspešne pripojený späť do hry!', 'success');
        });

        this.socket.on('reconnect_error', (data) => {
            console.error('Reconnect error:', data.message);
            this.isReconnecting = false;
            this.reconnectAttempts++;
            
            // Clear session after max attempts
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.log('Max reconnect attempts reached, clearing session');
                this.clearSession();
                this.hideConnectionStatus(); // Hide connection status
                this.showScreen('loginScreen');
                this.showNotification('Nepodarilo sa pripojiť späť do hry', 'error');
            } else {
                // Show connection status for retry
                this.showConnectionStatus('offline', `Pripájam sa... (pokus ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            }
        });

        this.socket.on('join_error', (data) => {
            // Clear join timeout
            if (this.joinTimeout) {
                clearTimeout(this.joinTimeout);
                this.joinTimeout = null;
            }
            
            this.showError(data.message);
            this.joinGameBtn.disabled = false;
            this.joinGameBtn.textContent = 'Pripojiť sa';
            console.error('Join error:', data.message);
        });

        this.socket.on('question_started', (data) => {
            this.hideConnectionStatus(); // Ensure connection status is hidden
            this.currentQuestion = data;
            this.hasAnswered = false;
            this.displayQuestion(data);
            this.startTimer(data.timeLimit, data.serverTime);
            this.showScreen('questionScreen');
            console.log(`Question ${data.questionNumber} started`);
        });

        this.socket.on('question_ended', (data) => {
            this.stopTimer();
            console.log('Question ended');
            // Stay on current screen, results will come via answer_result
        });

        this.socket.on('answer_result', (data) => {
            this.displayResult(data);
            this.showScreen('resultScreen');
            console.log(`Answer result: ${data.correct ? 'correct' : 'incorrect'}, points: ${data.points}`);
        });

        this.socket.on('game_ended', (data) => {
            this.displayFinalResults(data);
            this.showScreen('finalScreen');
            console.log('Game ended');
        });
    }

    startLatencyMeasurement() {
        // Measure latency every 10 seconds
        this.latencyInterval = setInterval(() => {
            this.socket.emit('latency_ping', Date.now());
        }, 10000);
    }

    joinGame() {
        const gamePin = this.gamePinInput.value.trim();
        const playerName = this.playerNameInput.value.trim();
        
        if (gamePin.length < 3) {
            this.showError('PIN musí mať aspoň 3 znaky');
            return;
        }
        
        if (playerName.length < 2) {
            this.showError('Meno musí mať aspoň 2 znaky');
            return;
        }
        
        this.joinGameBtn.disabled = true;
        this.joinGameBtn.textContent = 'Pripájam sa...';
        
        console.log(`Attempting to join game: ${gamePin} as ${playerName}`);
        
        // Set timeout for join attempt
        this.joinTimeout = setTimeout(() => {
            this.showError('Pripojenie trvá príliš dlho. Skontrolujte PIN a skúste znovu.');
            this.joinGameBtn.disabled = false;
            this.joinGameBtn.textContent = 'Pripojiť sa';
        }, 10000); // 10 second timeout
        
        this.socket.emit('join_game', {
            gamePin: gamePin,
            playerName: playerName
        });
    }

    displayQuestion(data) {
        this.questionCounter.textContent = `Otázka ${data.questionNumber}/${data.totalQuestions}`;
        this.questionText.textContent = data.question;
        
        // Clear previous answers
        this.answersGrid.innerHTML = '';
        this.answerSubmitted.style.display = 'none';
        
        // Create answer buttons
        data.options.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'answer-btn';
            button.innerHTML = `
                <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
                <span class="answer-text">${option}</span>
            `;
            
            button.addEventListener('click', () => this.submitAnswer(index));
            this.answersGrid.appendChild(button);
        });
    }

    submitAnswer(answerIndex) {
        if (this.hasAnswered) return;
        
        this.hasAnswered = true;
        
        // Disable all buttons and highlight selected
        const buttons = this.answersGrid.querySelectorAll('.answer-btn');
        buttons.forEach((btn, index) => {
            btn.disabled = true;
            if (index === answerIndex) {
                btn.classList.add('selected');
            }
        });
        
        // Show submitted indicator
        this.answerSubmitted.style.display = 'block';
        
        // Send answer to server
        this.socket.emit('submit_answer', {
            gamePin: this.currentGame.gamePin,
            answer: answerIndex,
            clientTime: Date.now()
        });
    }

    startTimer(timeLimit, serverTime) {
        const startTime = serverTime || Date.now();
        this.timeRemaining.textContent = timeLimit;
        
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const remaining = Math.max(0, timeLimit - elapsed);
            
            this.timeRemaining.textContent = Math.ceil(remaining);
            
            // Update timer circle animation
            const percentage = (remaining / timeLimit) * 100;
            this.updateTimerCircle(percentage);
            
            if (remaining <= 0) {
                this.stopTimer();
                this.disableAnswers();
            }
        }, 100);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerCircle(percentage) {
        // Update CSS custom property for circle animation
        this.timerCircle.style.setProperty('--percentage', percentage);
        
        // Color coding
        if (percentage <= 20) {
            this.timerCircle.className = 'timer-circle urgent';
        } else if (percentage <= 50) {
            this.timerCircle.className = 'timer-circle warning';
        } else {
            this.timerCircle.className = 'timer-circle';
        }
    }

    disableAnswers() {
        const buttons = this.answersGrid.querySelectorAll('.answer-btn');
        buttons.forEach(btn => btn.disabled = true);
        
        if (!this.hasAnswered) {
            this.answerSubmitted.innerHTML = '<div class="submitted-icon">⏰</div><p>Čas vypršal!</p>';
            this.answerSubmitted.style.display = 'block';
        }
    }

    displayResult(data) {
        // Set result icon and title
        if (data.correct) {
            this.resultIcon.textContent = '✅';
            this.resultTitle.textContent = 'Správne!';
            this.resultIcon.className = 'result-icon correct';
        } else {
            this.resultIcon.textContent = '❌';
            this.resultTitle.textContent = 'Nesprávne';
            this.resultIcon.className = 'result-icon incorrect';
        }
        
        // Show correct answer
        const correctOption = this.currentQuestion.options[data.correctAnswer];
        this.correctAnswerText.textContent = 
            `Správna odpoveď: ${String.fromCharCode(65 + data.correctAnswer)}) ${correctOption}`;
        
        // Show points earned
        this.pointsEarned.textContent = `+${data.points} bodov`;
        this.pointsEarned.className = data.points > 0 ? 'points-earned positive' : 'points-earned zero';
        
        // Show total score
        this.totalScore.textContent = data.totalScore.toLocaleString();
        
        // Show response time
        this.responseTime.textContent = `${(data.responseTime / 1000).toFixed(1)}s`;
        
        // Position will be updated when leaderboard arrives
        this.currentPosition.textContent = '-';
    }

    displayFinalResults(data) {
        // Find player's final position
        const playerPosition = data.leaderboard.findIndex(p => p.socketId === this.socket.id) + 1;
        const playerData = data.leaderboard.find(p => p.socketId === this.socket.id);
        
        // Set medal based on position
        let medal = '🏆';
        if (playerPosition === 1) medal = '🥇';
        else if (playerPosition === 2) medal = '🥈';
        else if (playerPosition === 3) medal = '🥉';
        else if (playerPosition <= 10) medal = '🏅';
        
        this.positionMedal.textContent = medal;
        this.finalPositionNumber.textContent = `${playerPosition}.`;
        this.finalScore.textContent = playerData ? playerData.score.toLocaleString() : '0';
        
        // Show top 5 players
        this.displayTopPlayers(data.leaderboard.slice(0, 5));
    }

    displayTopPlayers(topPlayers) {
        this.topPlayersList.innerHTML = '';
        
        topPlayers.forEach((player, index) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'top-player-item';
            
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const isCurrentPlayer = player.socketId === this.socket.id;
            
            playerElement.innerHTML = `
                <span class="player-position">${medal}</span>
                <span class="player-name ${isCurrentPlayer ? 'current-player' : ''}">${player.name}</span>
                <span class="player-score">${player.score.toLocaleString()}b</span>
            `;
            
            this.topPlayersList.appendChild(playerElement);
        });
    }

    showScreen(screenId) {
        // Hide all screens
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.style.display = 'none');
        
        // Show target screen
        document.getElementById(screenId).style.display = 'block';
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }

    hideError() {
        this.errorMessage.style.display = 'none';
    }

    showConnectionStatus(type, message) {
        const indicator = this.connectionStatus.querySelector('.connection-indicator');
        indicator.className = `connection-indicator ${type}`;
        indicator.querySelector('.status-text').textContent = message;
        this.connectionStatus.style.display = 'block';
    }

    hideConnectionStatus() {
        if (this.connectionStatus) {
            this.connectionStatus.style.display = 'none';
        }
    }

    resetToLogin() {
        // Reset all state
        this.currentGame = null;
        this.currentQuestion = null;
        this.hasAnswered = false;
        this.stopTimer();
        
        // Clear form
        this.gamePinInput.value = '';
        this.playerNameInput.value = '';
        this.joinGameBtn.disabled = false;
        this.joinGameBtn.textContent = 'Pripojiť sa';
        
        // Show login screen
        this.showScreen('loginScreen');
        this.hideError();
        this.clearSession();
    }

    // Session Management
    saveSession(gamePin, playerName, playerToken) {
        try {
            localStorage.setItem('player_game_pin', gamePin);
            localStorage.setItem('player_name', playerName);
            localStorage.setItem('player_token', playerToken);
            console.log(`Player session saved for game: ${gamePin}`);
        } catch (error) {
            console.error('Failed to save player session:', error);
        }
    }

    clearSession() {
        try {
            localStorage.removeItem('player_game_pin');
            localStorage.removeItem('player_name');
            localStorage.removeItem('player_token');
            console.log('Player session cleared');
        } catch (error) {
            console.error('Failed to clear player session:', error);
        }
    }

    checkForSavedSession() {
        try {
            const savedPin = localStorage.getItem('player_game_pin');
            const savedName = localStorage.getItem('player_name');
            const savedToken = localStorage.getItem('player_token');
            
            if (savedPin && savedName && savedToken) {
                console.log(`Found saved player session for game: ${savedPin}`);
                this.gamePinInput.value = savedPin;
                this.playerNameInput.value = savedName;
                return { gamePin: savedPin, playerName: savedName, playerToken: savedToken };
            }
        } catch (error) {
            console.error('Failed to check saved player session:', error);
        }
        return null;
    }

    attemptSessionReconnect() {
        const savedSession = this.checkForSavedSession();
        if (savedSession && this.socket.connected && !this.isReconnecting) {
            this.isReconnecting = true;
            this.reconnectAttempts++;
            
            console.log(`Attempting to reconnect player to game: ${savedSession.gamePin} (attempt ${this.reconnectAttempts})`);
            this.showConnectionStatus('connecting', 'Pripájam sa späť do hry...');
            
            // Set timeout for reconnection attempt
            const reconnectTimeout = setTimeout(() => {
                if (this.isReconnecting) {
                    console.log('Reconnection timeout');
                    this.isReconnecting = false;
                    this.hideConnectionStatus();
                    // Don't emit error here, let the server timeout handle it
                }
            }, 5000);
            
            this.socket.emit('reconnect_player', {
                gamePin: savedSession.gamePin,
                playerName: savedSession.playerName,
                playerToken: savedSession.playerToken
            });
            
            // Clear timeout on any response
            this.socket.once('player_reconnected', () => {
                clearTimeout(reconnectTimeout);
                this.hideConnectionStatus();
            });
            this.socket.once('reconnect_error', () => {
                clearTimeout(reconnectTimeout);
            });
        }
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        `;
        
        if (type === 'success') notification.style.background = '#4CAF50';
        else if (type === 'error') notification.style.background = '#F44336';
        else notification.style.background = '#2196F3';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('SW registered'))
            .catch(error => console.log('SW registration failed'));
    });
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    new QuizApp();
});