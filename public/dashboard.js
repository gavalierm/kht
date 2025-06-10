// Dashboard JavaScript
class QuizDashboard {
    constructor() {
        this.socket = io();
        this.currentGame = null;
        this.currentQuestion = null;
        this.timerInterval = null;
        this.timeRemaining = 0;
        this.moderatorToken = null;
        this.isReconnecting = false; // Prevent reconnection loops
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketEvents();
        this.checkForSavedSession();
        
        // Debug connection
        console.log('Dashboard initializing...');
    }

    initializeElements() {
        // Setup elements
        this.setupSection = document.getElementById('setupSection');
        this.gameSection = document.getElementById('gameSection');
        this.gameInfo = document.getElementById('gameInfo');
        this.createGameBtn = document.getElementById('createGameBtn');
        this.categorySelect = document.getElementById('categorySelect');
        this.customPinInput = document.getElementById('customPinInput');
        
        // Reconnect elements
        this.reconnectPinInput = document.getElementById('reconnectPinInput');
        this.moderatorPasswordInput = document.getElementById('moderatorPasswordInput');
        this.reconnectBtn = document.getElementById('reconnectBtn');
        
        // Debug elements
        this.debugInfo = document.getElementById('debugInfo');
        this.clearSessionBtn = document.getElementById('clearSessionBtn');
        
        // Game elements
        this.gamePin = document.getElementById('gamePin');
        this.playersCount = document.getElementById('playersCount');
        this.questionNumber = document.getElementById('questionNumber');
        this.timer = document.getElementById('timer');
        this.questionText = document.getElementById('questionText');
        this.optionsGrid = document.getElementById('optionsGrid');
        
        // Controls
        this.startQuestionBtn = document.getElementById('startQuestionBtn');
        this.endQuestionBtn = document.getElementById('endQuestionBtn');
        this.nextQuestionBtn = document.getElementById('nextQuestionBtn');
        this.endGameBtn = document.getElementById('endGameBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        
        // Stats and leaderboard
        this.statsContainer = document.getElementById('statsContainer');
        this.answeredCount = document.getElementById('answeredCount');
        this.totalPlayers = document.getElementById('totalPlayers');
        this.answerStats = document.getElementById('answerStats');
        this.leaderboardList = document.getElementById('leaderboardList');
        this.playersList = document.getElementById('playersList');
        
        // Modals
        this.resultsModal = document.getElementById('resultsModal');
        this.finalResultsModal = document.getElementById('finalResultsModal');
        this.correctAnswerDisplay = document.getElementById('correctAnswerDisplay');
        this.resultsStats = document.getElementById('resultsStats');
        this.continueBtn = document.getElementById('continueBtn');
        this.finishGameBtn = document.getElementById('finishGameBtn');
        this.newGameBtn = document.getElementById('newGameBtn');
        this.finalLeaderboard = document.getElementById('finalLeaderboard');
    }

    bindEvents() {
        this.createGameBtn.addEventListener('click', () => this.createGame());
        this.reconnectBtn.addEventListener('click', () => this.reconnectToGame());
        this.clearSessionBtn.addEventListener('click', () => this.debugClearSession());
        this.startQuestionBtn.addEventListener('click', () => this.startQuestion());
        this.endQuestionBtn.addEventListener('click', () => this.endQuestion());
        this.nextQuestionBtn.addEventListener('click', () => this.nextQuestion());
        this.endGameBtn.addEventListener('click', () => this.endGame());
        this.disconnectBtn.addEventListener('click', () => this.disconnectFromGame());
        this.continueBtn.addEventListener('click', () => this.hideResultsModal());
        this.finishGameBtn.addEventListener('click', () => this.showFinalResults());
        this.newGameBtn.addEventListener('click', () => this.resetDashboard());
        
        // Format custom PIN input - allow letters and numbers
        this.customPinInput.addEventListener('input', (e) => {
            // Remove special characters, keep only letters and numbers
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        });
        
        // Format reconnect PIN input
        this.reconnectPinInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        });
        
        // Update debug info periodically
        setInterval(() => this.updateDebugInfo(), 2000);
    }

    setupSocketEvents() {
        this.socket.on('game_created', (data) => {
            this.currentGame = {
                pin: data.gamePin,
                title: data.title,
                questionCount: data.questionCount,
                currentQuestionIndex: 0
            };
            
            this.gamePin.textContent = data.gamePin;
            this.setupSection.style.display = 'none';
            this.gameSection.style.display = 'flex';
            this.gameInfo.style.display = 'flex';
            
            // Initially disable start button (no players yet)
            this.updateStartButtonState(0);
            
            console.log(`Game created with PIN: ${data.gamePin}`);
            this.showNotification(`Hra vytvorená! PIN: ${data.gamePin}`, 'success');
        });

        this.socket.on('create_game_error', (data) => {
            console.error('Create game error:', data.message);
            this.showNotification(data.message, 'error');
            this.createGameBtn.disabled = false;
            this.createGameBtn.textContent = 'Vytvoriť hru';
        });

        this.socket.on('start_question_error', (data) => {
            this.showNotification(data.message, 'error');
            
            // Re-enable the start button
            this.startQuestionBtn.disabled = false;
        });

        this.socket.on('player_joined', (data) => {
            this.playersCount.textContent = data.totalPlayers;
            this.totalPlayers.textContent = data.totalPlayers;
            this.updatePlayersList(data.players);
            console.log(`Player joined: ${data.playerName}, total: ${data.totalPlayers}`);
            this.showNotification(`${data.playerName} sa pripojil`, 'info');
            
            // Enable start button when players join
            this.updateStartButtonState(data.totalPlayers);
        });

        this.socket.on('player_left', (data) => {
            this.playersCount.textContent = data.totalPlayers;
            this.totalPlayers.textContent = data.totalPlayers;
            console.log(`Player left, total: ${data.totalPlayers}`);
            
            // Update start button state
            this.updateStartButtonState(data.totalPlayers);
        });

        this.socket.on('question_started_dashboard', (data) => {
            this.currentQuestion = data;
            this.displayQuestion(data);
            this.startTimer(data.timeLimit);
            this.statsContainer.style.display = 'block';
            
            console.log(`Question ${data.questionNumber} started on dashboard`);
            
            this.startQuestionBtn.disabled = true;
            this.endQuestionBtn.disabled = false;
            this.nextQuestionBtn.style.display = 'none';
        });

        this.socket.on('live_stats', (data) => {
            this.updateLiveStats(data);
        });

        this.socket.on('question_ended_dashboard', (data) => {
            this.stopTimer();
            this.updateLeaderboard(data.leaderboard);
            this.showQuestionResults(data);
            
            console.log(`Question ended on dashboard, can continue: ${data.canContinue}`);
            
            this.startQuestionBtn.disabled = false;
            this.endQuestionBtn.disabled = true;
            
            if (data.canContinue) {
                this.nextQuestionBtn.style.display = 'inline-block';
            } else {
                this.finishGameBtn.style.display = 'inline-block';
            }
        });

        this.socket.on('disconnect', () => {
            this.showNotification('Pripojenie sa prerušilo', 'error');
        });

        this.socket.on('connect', () => {
            this.showNotification('Pripojené k serveru', 'success');
        });

        this.socket.on('start_question_error', (data) => {
            this.showNotification(data.message, 'error');
            
            // Re-enable the start button
            this.startQuestionBtn.disabled = false;
        });
    }

    createGame() {
        const category = this.categorySelect.value;
        const customPin = this.customPinInput.value.trim();
        
        // Validate custom PIN if provided
        if (customPin && customPin.length < 3) {
            this.showNotification('Vlastný PIN musí mať aspoň 3 znaky', 'error');
            return;
        }
        
        console.log(`Creating game with category: ${category}, custom PIN: ${customPin || 'auto'}`);
        
        this.socket.emit('create_game', { 
            category,
            customPin: customPin || null
        });
        this.createGameBtn.disabled = true;
        this.createGameBtn.textContent = 'Vytvára sa...';
    }

    updateStartButtonState(playerCount) {
        if (playerCount === 0) {
            this.startQuestionBtn.disabled = true;
            this.startQuestionBtn.title = 'Pripojte najmenej jedného hráča pre spustenie otázky';
        } else {
            this.startQuestionBtn.disabled = false;
            this.startQuestionBtn.title = '';
        }
    }

    startQuestion() {
        if (!this.currentGame) return;
        
        console.log(`Starting question in game ${this.currentGame.pin}`);
        
        this.socket.emit('start_question', {
            gamePin: this.currentGame.pin
        });
    }

    endQuestion() {
        if (!this.currentGame) return;
        
        console.log(`Ending question in game ${this.currentGame.pin}`);
        
        this.socket.emit('end_question', {
            gamePin: this.currentGame.pin
        });
    }

    nextQuestion() {
        this.currentGame.currentQuestionIndex++;
        this.hideResultsModal();
        this.resetQuestionDisplay();
        this.nextQuestionBtn.style.display = 'none';
    }

    endGame() {
        if (confirm('Naozaj chcete ukončiť hru?')) {
            this.showFinalResults();
        }
    }

    disconnectFromGame() {
        if (confirm('Naozaj sa chcete odpojiť od hry? Hra bude pokračovať bez moderátora.')) {
            this.clearSession();
            this.resetDashboard();
            this.showNotification('Odpojený od hry', 'info');
        }
    }

    debugClearSession() {
        this.clearSession();
        this.showNotification('Session vymazaný', 'info');
        this.updateDebugInfo();
    }

    updateDebugInfo() {
        const savedSession = this.checkForSavedSession();
        if (savedSession) {
            this.debugInfo.textContent = `PIN: ${savedSession.gamePin}, Token: ${savedSession.moderatorToken?.substring(0, 8)}...`;
        } else {
            this.debugInfo.textContent = 'Žiadne uložené údaje';
        }
    }

    reconnectToGame() {
        const gamePin = this.reconnectPinInput.value.trim();
        const password = this.moderatorPasswordInput.value.trim();
        
        if (gamePin.length < 3) {
            this.showNotification('PIN musí mať aspoň 3 znaky', 'error');
            return;
        }
        
        this.reconnectBtn.disabled = true;
        this.reconnectBtn.textContent = 'Pripájam sa...';
        
        console.log(`Attempting to reconnect to game: ${gamePin}`);
        
        this.socket.emit('reconnect_moderator', {
            gamePin: gamePin,
            password: password || null,
            moderatorToken: null // Manual reconnect without token
        });
        
        // Reset button after timeout
        setTimeout(() => {
            this.reconnectBtn.disabled = false;
            this.reconnectBtn.textContent = '🔌 Pripojiť sa k hre';
        }, 10000);
    }

    displayQuestion(data) {
        this.questionNumber.textContent = `Otázka ${data.questionNumber}/${data.totalQuestions}`;
        this.questionText.textContent = data.question;
        
        this.optionsGrid.innerHTML = '';
        data.options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'option';
            optionElement.innerHTML = `
                <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                <span class="option-text">${option}</span>
            `;
            
            // Highlight correct answer for moderator
            if (index === data.correctAnswer) {
                optionElement.classList.add('correct-option');
            }
            
            this.optionsGrid.appendChild(optionElement);
        });
    }

    startTimer(timeLimit) {
        this.timeRemaining = timeLimit;
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerDisplay();
            
            if (this.timeRemaining <= 0) {
                this.stopTimer();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerDisplay() {
        this.timer.textContent = `⏱️ ${this.timeRemaining}s`;
        
        // Color coding for urgency
        if (this.timeRemaining <= 5) {
            this.timer.className = 'timer urgent';
        } else if (this.timeRemaining <= 10) {
            this.timer.className = 'timer warning';
        } else {
            this.timer.className = 'timer';
        }
    }

    updateLiveStats(data) {
        this.answeredCount.textContent = data.answeredCount;
        
        if (data.answerStats && this.currentQuestion) {
            this.answerStats.innerHTML = '';
            
            data.answerStats.forEach((stat, index) => {
                const optionLetter = String.fromCharCode(65 + index);
                const optionText = this.currentQuestion.options[index];
                
                const statElement = document.createElement('div');
                statElement.className = 'answer-stat';
                statElement.innerHTML = `
                    <div class="stat-label">${optionLetter}) ${optionText}</div>
                    <div class="stat-bar">
                        <div class="stat-fill" style="width: ${stat.percentage}%"></div>
                        <span class="stat-percentage">${stat.percentage}%</span>
                    </div>
                `;
                
                this.answerStats.appendChild(statElement);
            });
        }
    }

    updateLeaderboard(leaderboard) {
        if (!leaderboard || leaderboard.length === 0) {
            this.leaderboardList.innerHTML = '<div class="no-players">Žiadni hráči</div>';
            return;
        }

        this.leaderboardList.innerHTML = '';
        leaderboard.forEach((player, index) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'leaderboard-item';
            
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${player.position}.`;
            
            playerElement.innerHTML = `
                <span class="position">${medal}</span>
                <span class="player-name">${player.name}</span>
                <span class="player-score">${player.score.toLocaleString()}b</span>
            `;
            
            this.leaderboardList.appendChild(playerElement);
        });
    }

    updatePlayersList(players) {
        if (!players || players.length === 0) {
            this.playersList.innerHTML = '<div class="no-players">Žiadni hráči</div>';
            return;
        }

        this.playersList.innerHTML = '';
        players.forEach(playerName => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <span class="player-indicator">👤</span>
                <span class="player-name">${playerName}</span>
            `;
            this.playersList.appendChild(playerElement);
        });
    }

    showQuestionResults(data) {
        const correctOption = this.currentQuestion.options[data.correctAnswer];
        this.correctAnswerDisplay.innerHTML = `
            <strong>Správna odpoveď:</strong> ${String.fromCharCode(65 + data.correctAnswer)}) ${correctOption}
        `;
        
        this.resultsStats.innerHTML = `
            <div class="result-stat">
                <strong>Celkovo odpovedalo:</strong> ${data.totalAnswers}/${data.totalPlayers} hráčov
            </div>
            <div class="result-stat">
                <strong>Úspešnosť:</strong> ${data.answerStats[data.correctAnswer].percentage}%
            </div>
        `;
        
        this.resultsModal.style.display = 'flex';
    }

    hideResultsModal() {
        this.resultsModal.style.display = 'none';
    }

    showFinalResults() {
        this.hideResultsModal();
        
        // Get current leaderboard for final results
        const leaderboardItems = this.leaderboardList.children;
        let finalHtml = '<h3>🏆 Finálne poradie</h3>';
        
        if (leaderboardItems.length === 0 || leaderboardItems[0].classList.contains('no-players')) {
            finalHtml += '<div class="no-players">Žiadni hráči</div>';
        } else {
            for (let item of leaderboardItems) {
                finalHtml += `<div class="final-leaderboard-item">${item.innerHTML}</div>`;
            }
        }
        
        this.finalLeaderboard.innerHTML = finalHtml;
        this.finalResultsModal.style.display = 'flex';
    }

    resetDashboard() {
        this.finalResultsModal.style.display = 'none';
        this.gameSection.style.display = 'none';
        this.gameInfo.style.display = 'none';
        this.setupSection.style.display = 'block';
        
        this.createGameBtn.disabled = false;
        this.createGameBtn.textContent = 'Vytvoriť hru';
        this.customPinInput.value = '';
        
        this.resetQuestionDisplay();
        this.clearSession();
        this.currentGame = null;
        this.currentQuestion = null;
        
        // Reset UI elements
        this.playersCount.textContent = '0';
        this.leaderboardList.innerHTML = '<div class="no-players">Žiadni hráči</div>';
        this.playersList.innerHTML = '<div class="no-players">Žiadni hráči</div>';
    }

    // Session Management
    saveSession(gamePin, moderatorToken) {
        try {
            localStorage.setItem('dashboard_game_pin', gamePin);
            localStorage.setItem('dashboard_moderator_token', moderatorToken);
            console.log(`Session saved for game: ${gamePin}`);
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    clearSession() {
        try {
            localStorage.removeItem('dashboard_game_pin');
            localStorage.removeItem('dashboard_moderator_token');
            localStorage.removeItem('dashboard_moderator_password');
            console.log('Session cleared');
        } catch (error) {
            console.error('Failed to clear session:', error);
        }
    }

    checkForSavedSession() {
        try {
            const savedPin = localStorage.getItem('dashboard_game_pin');
            const savedToken = localStorage.getItem('dashboard_moderator_token');
            
            if (savedPin && savedToken) {
                console.log(`Found saved session for game: ${savedPin}`);
                this.showNotification(`Našla sa uložená hra: ${savedPin}`, 'info');
                return { gamePin: savedPin, moderatorToken: savedToken };
            }
        } catch (error) {
            console.error('Failed to check saved session:', error);
        }
        return null;
    }

    attemptSessionReconnect() {
        const savedSession = this.checkForSavedSession();
        if (savedSession && this.socket.connected && !this.isReconnecting) {
            this.isReconnecting = true;
            this.reconnectAttempts++;
            
            console.log(`Attempting to reconnect moderator to game: ${savedSession.gamePin} with token: ${savedSession.moderatorToken} (attempt ${this.reconnectAttempts})`);
            
            // Set timeout for reconnection attempt
            const reconnectTimeout = setTimeout(() => {
                if (this.isReconnecting) {
                    console.log('Moderator reconnection timeout');
                    this.isReconnecting = false;
                    this.showNotification('Timeout pripojenia k hre', 'warning');
                }
            }, 8000); // Longer timeout for moderator
            
            this.socket.emit('reconnect_moderator', {
                gamePin: savedSession.gamePin,
                moderatorToken: savedSession.moderatorToken,
                password: null // Auto reconnect uses token
            });
            
            // Clear timeout on any response
            this.socket.once('moderator_reconnected', () => {
                clearTimeout(reconnectTimeout);
                this.isReconnecting = false;
            });
            this.socket.once('moderator_reconnect_error', () => {
                clearTimeout(reconnectTimeout);
                this.isReconnecting = false;
            });
        } else if (savedSession) {
            console.log('Cannot attempt reconnect:', {
                hasSession: !!savedSession,
                connected: this.socket.connected,
                isReconnecting: this.isReconnecting
            });
        }
    }

    resetQuestionDisplay() {
        this.questionText.textContent = 'Čakanie na spustenie otázky...';
        this.optionsGrid.innerHTML = '';
        this.statsContainer.style.display = 'none';
        this.stopTimer();
        this.timer.textContent = '⏱️ 30s';
        this.timer.className = 'timer';
        
        this.startQuestionBtn.disabled = false;
        this.endQuestionBtn.disabled = true;
        this.nextQuestionBtn.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        console.log(`Notification: ${type} - ${message}`);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new QuizDashboard();
});