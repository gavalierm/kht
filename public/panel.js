// Simple Panel JavaScript
class QuizPanel {
    constructor() {
        this.socket = io();
        this.currentGame = null;
        this.timerInterval = null;
        this.pendingGamePin = null; // Store PIN until connected
        
        this.initializeElements();
        this.setupSocketEvents();
        this.extractPinFromUrl(); // Extract PIN but don't connect yet
    }

    initializeElements() {
        this.panelPin = document.getElementById('panelPin');
        this.quizTitle = document.getElementById('quizTitle');
        this.timer = document.getElementById('timer');
        this.questionNumber = document.getElementById('questionNumber');
        this.questionText = document.getElementById('questionText');
        this.options = document.getElementById('options');
        this.results = document.getElementById('results');
        this.correctAnswer = document.getElementById('correctAnswer');
        this.leaderboardList = document.getElementById('leaderboardList');
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Panel connected');
            
            // Now that we're connected, try to join the game
            if (this.pendingGamePin) {
                this.connectToGame();
            }
        });

        this.socket.on('panel_game_joined', (data) => {
            this.currentGame = data;
            this.panelPin.textContent = `PIN: ${data.gamePin}`;
            this.quizTitle.textContent = data.title || 'Kvíz';
            console.log(`Panel joined game: ${data.gamePin}`);
        });

        this.socket.on('panel_join_error', (data) => {
            this.panelPin.textContent = `CHYBA: ${data.message}`;
            console.error('Panel join error:', data.message);
        });

        this.socket.on('panel_question_started', (data) => {
            this.currentQuestion = data;
            this.displayQuestion(data);
            this.startTimer(data.timeLimit, data.serverTime);
        });

        this.socket.on('panel_question_ended', (data) => {
            this.stopTimer();
            this.displayResults(data);
            this.updateLeaderboard(data.leaderboard);
        });

        this.socket.on('panel_leaderboard_update', (data) => {
            this.updateLeaderboard(data.leaderboard);
        });

        this.socket.on('panel_game_ended', () => {
            this.questionNumber.textContent = 'Hra skončila';
            this.questionText.textContent = '';
            this.options.innerHTML = '';
            this.hideResults();
            this.hideTimer();
        });
    }

    extractPinFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const gamePin = urlParams.get('pin');
        
        if (gamePin && gamePin.length >= 3) {
            this.pendingGamePin = gamePin;
            this.panelPin.textContent = `PIN: ${gamePin} (pripájam sa...)`;
        } else {
            this.panelPin.textContent = 'CHYBA: Neplatný PIN v URL (?pin=goodevent)';
        }
    }

    connectToGame() {
        if (!this.pendingGamePin) {
            this.panelPin.textContent = 'CHYBA: Žiadny PIN v URL';
            return;
        }
        
        console.log(`Connecting to game: ${this.pendingGamePin}`);
        this.socket.emit('join_panel', { gamePin: this.pendingGamePin });
    }

    displayQuestion(data) {
        this.questionNumber.textContent = `OTÁZKA ${data.questionNumber}/${data.totalQuestions}`;
        this.questionText.textContent = data.question;
        
        this.options.innerHTML = '';
        data.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.textContent = `${String.fromCharCode(65 + index)}) ${option}`;
            this.options.appendChild(optionDiv);
        });
        
        this.hideResults();
        this.showTimer();
    }

    displayResults(data) {
        if (this.currentQuestion && data.correctAnswer !== undefined) {
            const correctOption = this.currentQuestion.options[data.correctAnswer];
            this.correctAnswer.textContent = 
                `SPRÁVNA ODPOVEĎ: ${String.fromCharCode(65 + data.correctAnswer)}) ${correctOption}`;
        }
        
        this.showResults();
        this.hideTimer();
    }

    startTimer(timeLimit, serverTime) {
        const startTime = serverTime || Date.now();
        
        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const remaining = Math.max(0, timeLimit - elapsed);
            
            this.timer.textContent = Math.ceil(remaining);
            
            if (remaining <= 0) {
                this.stopTimer();
            }
        }, 100);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateLeaderboard(leaderboard) {
        if (!leaderboard || leaderboard.length === 0) {
            this.leaderboardList.textContent = 'Žiadni hráči';
            return;
        }

        this.leaderboardList.innerHTML = '';
        
        leaderboard.slice(0, 10).forEach((player) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'leaderboard-item';
            playerDiv.textContent = `${player.position}. ${player.name} - ${player.score} bodov`;
            this.leaderboardList.appendChild(playerDiv);
        });
    }

    showTimer() {
        this.timer.classList.remove('hidden');
    }

    hideTimer() {
        this.timer.classList.add('hidden');
    }

    showResults() {
        this.results.classList.remove('hidden');
    }

    hideResults() {
        this.results.classList.add('hidden');
    }
}

// Initialize panel when page loads
document.addEventListener('DOMContentLoaded', () => {
    new QuizPanel();
});