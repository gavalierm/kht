/**
 * Enhanced sample data fixtures for comprehensive testing
 * - Reflects Slovak application context
 * - Includes realistic game scenarios
 * - Provides comprehensive test data for all components
 */

const sampleQuestions = {
  slovak: [
    {
      id: 1,
      question: "Aké je hlavné mesto Slovenska?",
      options: ["Bratislava", "Košice", "Prešov", "Žilina"],
      correct: 0,
      timeLimit: 30
    },
    {
      id: 2,
      question: "Koľko kontinentov má Zem?",
      options: ["5", "6", "7", "8"],
      correct: 2,
      timeLimit: 25
    },
    {
      id: 3,
      question: "Ktorá rieka preteká cez Bratislavu?",
      options: ["Váh", "Hron", "Dunaj", "Morava"],
      correct: 2,
      timeLimit: 20
    },
    {
      id: 4,
      question: "Ktorý je najvyšší vrch Slovenska?",
      options: ["Kriváň", "Gerlachovský štít", "Rysy", "Ďumbier"],
      correct: 1,
      timeLimit: 25
    },
    {
      id: 5,
      question: "V ktorom roku vznikla Slovenská republika?",
      options: ["1991", "1992", "1993", "1994"],
      correct: 2,
      timeLimit: 30
    }
  ],
  
  history: [
    {
      id: 1,
      question: "Kedy sa skončila druhá svetová vojna?",
      options: ["1944", "1945", "1946", "1947"],
      correct: 1,
      timeLimit: 25
    },
    {
      id: 2,
      question: "Kto bol prvý prezident Slovenska?",
      options: ["Michal Kováč", "Rudolf Schuster", "Ivan Gašparovič", "Andrej Kiska"],
      correct: 0,
      timeLimit: 30
    }
  ],
  
  science: [
    {
      id: 1,
      question: "Aké je chemické označenie pre vodu?",
      options: ["CO2", "H2O", "NaCl", "O2"],
      correct: 1,
      timeLimit: 20
    },
    {
      id: 2,
      question: "Ktorá planeta je najbližšie k Slnku?",
      options: ["Venuša", "Merkúr", "Zem", "Mars"],
      correct: 1,
      timeLimit: 25
    }
  ]
};

const samplePlayers = {
  small: [
    {
      id: 1,
      name: "Hráč 1",
      score: 1500,
      connected: true,
      joinedAt: Date.now() - 120000,
      lastSeen: Date.now() - 10000
    },
    {
      id: 2,
      name: "Hráč 2",
      score: 1200,
      connected: true,
      joinedAt: Date.now() - 100000,
      lastSeen: Date.now() - 5000
    },
    {
      id: 3,
      name: "Hráč 3",
      score: 800,
      connected: false,
      joinedAt: Date.now() - 80000,
      lastSeen: Date.now() - 60000
    }
  ],
  
  medium: Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `Hráč ${i + 1}`,
    score: Math.floor(Math.random() * 3000),
    connected: Math.random() > 0.1, // 90% connected
    joinedAt: Date.now() - (120000 - i * 10000),
    lastSeen: Date.now() - Math.floor(Math.random() * 30000)
  })),
  
  large: Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    name: `Hráč ${i + 1}`,
    score: Math.floor(Math.random() * 5000),
    connected: Math.random() > 0.15, // 85% connected
    joinedAt: Date.now() - (300000 - i * 5000),
    lastSeen: Date.now() - Math.floor(Math.random() * 60000)
  }))
};

const sampleGameStates = {
  waiting: {
    phase: 'WAITING',
    currentQuestionIndex: 0,
    questionStartTime: null,
    answers: [],
    players: 3,
    status: 'waiting'
  },
  
  questionActive: {
    phase: 'QUESTION_ACTIVE',
    currentQuestionIndex: 1,
    questionStartTime: Date.now(),
    answers: [],
    players: 3,
    status: 'question_active'
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
      },
      {
        playerId: 3,
        answer: 0,
        timestamp: Date.now() - 25000,
        responseTime: 5000
      }
    ],
    players: 3,
    status: 'results'
  },
  
  finished: {
    phase: 'FINISHED',
    currentQuestionIndex: 5,
    questionStartTime: null,
    answers: [],
    players: 3,
    status: 'finished'
  }
};

const sampleAnswers = {
  realistic: [
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
      playerId: 3,
      questionIndex: 0,
      answer: 0,
      isCorrect: true,
      pointsEarned: 1400,
      responseTime: 5000
    },
    {
      gameId: 1,
      playerId: 1,
      questionIndex: 1,
      answer: 2,
      isCorrect: true,
      pointsEarned: 1300,
      responseTime: 7000
    },
    {
      gameId: 1,
      playerId: 2,
      questionIndex: 1,
      answer: 2,
      isCorrect: true,
      pointsEarned: 1100,
      responseTime: 12000
    }
  ],
  
  distributed: [
    // Question 1: Mixed answers
    { playerId: 1, answer: 0, isCorrect: true, responseTime: 5000 },
    { playerId: 2, answer: 0, isCorrect: true, responseTime: 8000 },
    { playerId: 3, answer: 1, isCorrect: false, responseTime: 6000 },
    { playerId: 4, answer: 2, isCorrect: false, responseTime: 10000 },
    { playerId: 5, answer: 0, isCorrect: true, responseTime: 12000 },
    
    // Question 2: Most got it right
    { playerId: 1, answer: 2, isCorrect: true, responseTime: 7000 },
    { playerId: 2, answer: 2, isCorrect: true, responseTime: 9000 },
    { playerId: 3, answer: 2, isCorrect: true, responseTime: 11000 },
    { playerId: 4, answer: 1, isCorrect: false, responseTime: 8000 },
    { playerId: 5, answer: 2, isCorrect: true, responseTime: 15000 }
  ]
};

const sampleGameData = {
  basic: {
    pin: "123456",
    questions: sampleQuestions.slovak,
    moderatorPassword: "test123",
    status: "waiting",
    currentQuestionIndex: 0,
    questionStartTime: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  
  withPassword: {
    pin: "654321",
    questions: sampleQuestions.slovak,
    moderatorPassword: "secure_pass_123",
    status: "waiting",
    currentQuestionIndex: 0,
    questionStartTime: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  
  inProgress: {
    pin: "789012",
    questions: sampleQuestions.slovak,
    moderatorPassword: "test456",
    status: "question_active",
    currentQuestionIndex: 2,
    questionStartTime: Date.now() - 10000,
    createdAt: Date.now() - 300000,
    updatedAt: Date.now() - 10000
  },
  
  finished: {
    pin: "345678",
    questions: sampleQuestions.slovak,
    moderatorPassword: "test789",
    status: "finished",
    currentQuestionIndex: 5,
    questionStartTime: null,
    createdAt: Date.now() - 1800000,
    updatedAt: Date.now() - 60000
  }
};

const socketEvents = {
  // Player events
  playerJoin: {
    gamePin: "123456"
  },
  
  playerReconnect: {
    gamePin: "123456",
    playerToken: "test-player-token-123456789abcdef"
  },
  
  submitAnswer: {
    answer: 0,
    timestamp: Date.now()
  },
  
  // Moderator events
  createGame: {
    moderatorPassword: "test123"
  },
  
  createGameWithCustomPin: {
    customPin: "123456",
    moderatorPassword: "test123"
  },
  
  moderatorReconnect: {
    gamePin: "123456",
    password: "test123",
    moderatorToken: "test-moderator-token-123456789abcdef"
  },
  
  startQuestion: {
    gamePin: "123456"
  },
  
  endQuestion: {
    gamePin: "123456"
  },
  
  endGame: {
    gamePin: "123456"
  },
  
  resetGame: {
    gamePin: "123456"
  },
  
  // Panel events
  joinPanel: {
    gamePin: "123456"
  },
  
  // Error scenarios
  invalidJoin: {
    gamePin: "999999"
  },
  
  invalidReconnect: {
    gamePin: "123456",
    playerToken: "invalid-token"
  }
};

const leaderboardData = {
  simple: [
    { position: 1, name: "Hráč 1", score: 2500, playerId: 1 },
    { position: 2, name: "Hráč 2", score: 2200, playerId: 2 },
    { position: 3, name: "Hráč 3", score: 1800, playerId: 3 }
  ],
  
  detailed: [
    { position: 1, name: "Hráč 1", score: 4200, playerId: 1, questionsAnswered: 5, correctAnswers: 5 },
    { position: 2, name: "Hráč 2", score: 3800, playerId: 2, questionsAnswered: 5, correctAnswers: 4 },
    { position: 3, name: "Hráč 3", score: 3500, playerId: 3, questionsAnswered: 5, correctAnswers: 4 },
    { position: 4, name: "Hráč 4", score: 2100, playerId: 4, questionsAnswered: 5, correctAnswers: 3 },
    { position: 5, name: "Hráč 5", score: 1200, playerId: 5, questionsAnswered: 5, correctAnswers: 2 }
  ],
  
  ties: [
    { position: 1, name: "Hráč 1", score: 2500, playerId: 1 },
    { position: 2, name: "Hráč 2", score: 2500, playerId: 2 }, // Tie for 2nd
    { position: 2, name: "Hráč 3", score: 2500, playerId: 3 }, // Tie for 2nd
    { position: 4, name: "Hráč 4", score: 2000, playerId: 4 }
  ]
};

const errorScenarios = {
  network: {
    connectionTimeout: 'Connection timeout',
    serverError: 'Server error occurred',
    invalidData: 'Invalid data received'
  },
  
  game: {
    gameNotFound: 'Hra s týmto PIN kódom neexistuje',
    gameAlreadyStarted: 'Hra už prebieha, nemôžete sa pripojiť',
    gameFinished: 'Hra už skončila',
    gameFull: 'Hra je plná',
    invalidPin: 'Neplatný PIN kód',
    duplicatePin: 'PIN kód už existuje'
  },
  
  player: {
    playerNotFound: 'Hráč nebol nájdený',
    invalidToken: 'Neplatný player token',
    alreadyAnswered: 'Už ste odpovedali na túto otázku',
    notInGame: 'Nie ste v tejto hre'
  },
  
  moderator: {
    invalidPassword: 'Neplatné heslo moderátora',
    invalidToken: 'Neplatný moderator token',
    notAuthorized: 'Nemáte oprávnenie pre túto akciu'
  }
};

const testScenarios = {
  quickGame: {
    name: 'Quick 3-question game',
    questions: sampleQuestions.slovak.slice(0, 3),
    players: samplePlayers.small,
    timeLimit: 15
  },
  
  fullGame: {
    name: 'Full 5-question game',
    questions: sampleQuestions.slovak,
    players: samplePlayers.medium,
    timeLimit: 30
  },
  
  stressTest: {
    name: 'High-concurrency test',
    questions: sampleQuestions.slovak,
    players: samplePlayers.large,
    timeLimit: 30,
    concurrent: true
  },
  
  reconnectionTest: {
    name: 'Reconnection scenarios',
    questions: sampleQuestions.slovak,
    players: samplePlayers.small,
    disconnectRate: 0.3,
    reconnectRate: 0.8
  }
};

module.exports = {
  sampleQuestions,
  samplePlayers,
  sampleGameStates,
  sampleAnswers,
  sampleGameData,
  socketEvents,
  leaderboardData,
  errorScenarios,
  testScenarios
};