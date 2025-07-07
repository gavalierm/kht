/**
 * Sample data fixtures for testing
 */

const sampleQuestions = {
  quiz: {
    title: "Sample Quiz for Testing",
    questions: [
      {
        id: 1,
        question: "What is the capital of Slovakia?",
        options: ["Bratislava", "Košice", "Prague", "Vienna"],
        correct: 0,
        timeLimit: 30
      },
      {
        id: 2,
        question: "How many continents are there?",
        options: ["5", "6", "7", "8"],
        correct: 2,
        timeLimit: 25
      },
      {
        id: 3,
        question: "What is 2 + 2?",
        options: ["3", "4", "5", "6"],
        correct: 1,
        timeLimit: 20
      },
      {
        id: 4,
        question: "Which programming language is this application written in?",
        options: ["Python", "JavaScript", "Java", "C++"],
        correct: 1,
        timeLimit: 25
      },
      {
        id: 5,
        question: "What database is used in this application?",
        options: ["MySQL", "PostgreSQL", "SQLite", "MongoDB"],
        correct: 2,
        timeLimit: 30
      }
    ]
  }
};

const samplePlayers = [
  {
    id: 1,
    name: "TestPlayer1",
    score: 1500,
    connected: true
  },
  {
    id: 2,
    name: "TestPlayer2", 
    score: 1200,
    connected: true
  },
  {
    id: 3,
    name: "TestPlayer3",
    score: 800,
    connected: false
  },
  {
    id: 4,
    name: "TestPlayer4",
    score: 2000,
    connected: true
  }
];

const sampleGameStates = {
  waiting: {
    phase: 'WAITING',
    currentQuestionIndex: 0,
    questionStartTime: null,
    answers: []
  },
  active: {
    phase: 'QUESTION_ACTIVE',
    currentQuestionIndex: 1,
    questionStartTime: Date.now(),
    answers: []
  },
  results: {
    phase: 'RESULTS',
    currentQuestionIndex: 1,
    questionStartTime: Date.now() - 30000,
    answers: [
      {
        playerId: 1,
        answer: 0,
        timestamp: Date.now() - 15000,
        responseTime: 15000
      },
      {
        playerId: 2,
        answer: 1,
        timestamp: Date.now() - 20000,
        responseTime: 10000
      }
    ]
  },
  finished: {
    phase: 'FINISHED',
    currentQuestionIndex: 5,
    questionStartTime: null,
    answers: []
  }
};

const sampleAnswers = [
  {
    gameId: 1,
    playerId: 1,
    questionIndex: 0,
    answer: 0,
    isCorrect: true,
    pointsEarned: 1200,
    responseTime: 8000
  },
  {
    gameId: 1,
    playerId: 2,
    questionIndex: 0,
    answer: 1,
    isCorrect: false,
    pointsEarned: 0,
    responseTime: 15000
  },
  {
    gameId: 1,
    playerId: 1,
    questionIndex: 1,
    answer: 2,
    isCorrect: true,
    pointsEarned: 1400,
    responseTime: 5000
  }
];

const sampleGameData = {
  pin: "123456",
  title: "Test Game",
  questions: sampleQuestions.quiz.questions,
  moderatorPassword: null,
  status: "waiting",
  currentQuestionIndex: 0
};

const socketEvents = {
  // Player events
  playerJoin: {
    gamePin: "123456"
  },
  playerReconnect: {
    gamePin: "123456",
    playerToken: "test-player-token-123"
  },
  submitAnswer: {
    answer: 0,
    timestamp: Date.now()
  },
  
  // Moderator events
  createGame: {
    customPin: "123456",
    category: "general",
    moderatorPassword: null
  },
  moderatorReconnect: {
    gamePin: "123456",
    password: null,
    moderatorToken: "test-moderator-token-123"
  },
  startQuestion: {
    gamePin: "123456"
  },
  endQuestion: {
    gamePin: "123456"
  },
  
  // Panel events
  joinPanel: {
    gamePin: "123456"
  }
};

module.exports = {
  sampleQuestions,
  samplePlayers,
  sampleGameStates,
  sampleAnswers,
  sampleGameData,
  socketEvents
};