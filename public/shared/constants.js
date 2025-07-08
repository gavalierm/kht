/**
 * Shared constants for the quiz application
 */

// Socket.io events
export const SOCKET_EVENTS = {
	// Connection events
	CONNECT: 'connect',
	DISCONNECT: 'disconnect',
	RECONNECT: 'reconnect',
	
	// Game events
	JOIN_GAME: 'join_game',
	GAME_JOINED: 'game_joined',
	JOIN_ERROR: 'join_error',
	PLAYER_RECONNECTED: 'player_reconnected',
	RECONNECT_PLAYER: 'reconnect_player',
	RECONNECT_ERROR: 'reconnect_error',
	
	// Question events
	QUESTION_STARTED: 'question_started',
	QUESTION_ENDED: 'question_ended',
	SUBMIT_ANSWER: 'submit_answer',
	ANSWER_RESULT: 'answer_result',
	LEAVE_GAME: 'leave_game',
	
	// Game end events
	GAME_ENDED: 'game_ended',
	GAME_ENDED_DASHBOARD: 'game_ended_dashboard',
	
	// Panel events
	JOIN_PANEL: 'join_panel',
	PANEL_GAME_JOINED: 'panel_game_joined',
	PANEL_JOIN_ERROR: 'panel_join_error',
	PANEL_QUESTION_STARTED: 'panel_question_started',
	PANEL_QUESTION_ENDED: 'panel_question_ended',
	PANEL_LEADERBOARD_UPDATE: 'panel_leaderboard_update',
	PANEL_GAME_ENDED: 'panel_game_ended',
	
	// Moderator events
	CREATE_GAME: 'create_game',
	GAME_CREATED: 'game_created',
	CREATE_GAME_ERROR: 'create_game_error',
	RECONNECT_MODERATOR: 'reconnect_moderator',
	START_QUESTION: 'start_question',
	END_QUESTION: 'end_question',
	START_GAME: 'start_game',
	PAUSE_GAME: 'pause_game',
	END_GAME: 'end_game',
	SHOW_RESULTS: 'show_results',
	GAME_STATE_UPDATE: 'game_state_update',
	PLAYERS_UPDATE: 'players_update',
	
	// Latency events
	LATENCY_PING: 'latency_ping',
	LATENCY_PONG: 'latency_pong'
};

// Game states
export const GAME_STATES = {
	WAITING: 'waiting',
	RUNNING: 'running',
	ACTIVE: 'active',
	QUESTION_ACTIVE: 'question_active',
	RESULTS: 'results',
	FINISHED: 'finished',
	ENDED: 'ended',
	CLOSED: 'closed'
};

// Answer options
export const ANSWER_OPTIONS = {
	A: 0,
	B: 1,
	C: 2,
	D: 3
};

export const ANSWER_OPTION_CLASSES = [
	'option_a',
	'option_b', 
	'option_c',
	'option_d'
];

// API endpoints
export const API_ENDPOINTS = {
	GAME: '/api/game',
	GAME_BY_PIN: (pin) => `/api/game/${pin}`
};

// UI constants
export const UI_CONSTANTS = {
	NOTIFICATION_DURATION: 3000,
	QUESTION_RESULT_DISPLAY_TIME: 10000,
	LATENCY_UPDATE_INTERVAL: 1000,
	MIN_PIN_LENGTH: 6,
	TIMER_UPDATE_INTERVAL: 1000
};

// CSS classes
export const CSS_CLASSES = {
	VISIBLE: 'visible',
	PAGE: 'page',
	PHASE: 'phase',
	OPTION: 'option',
	SUCCESS: 'success',
	ERROR: 'error',
	INFO: 'info',
	WARNING: 'warning',
	CORRECT: 'correct',
	SELECTED: 'selected',
	PANEL_WAITING: 'panel-waiting',
	PANEL_ACTIVE: 'panel-active',
	PANEL_FINISHED: 'panel-finished'
};

// Element IDs
export const ELEMENT_IDS = {
	// Common elements
	MESSAGE_BOX: 'messageBox',
	
	// Login page
	JOIN_GAME_BTN: 'joinGameBtn',
	GAME_PIN_INPUT: 'gamePinInput',
	
	// Game page
	HEADER: 'header',
	GAME_CODE: 'gameCode',
	GAME_STATUS: 'gameStatus',
	QUESTION_TEXT: 'questionText',
	TIMER: 'timer',
	OPTIONS: 'options',
	PLAYGROUND: 'playground',
	RESULT: 'result',
	ANSWER_TEXT: 'answerText',
	STATUS_ICON: 'statusIcon',
	PLAYER_TIME: 'playerTime',
	PLAYER_POSITION: 'playerPosition',
	LATENCY_DISPLAY: 'latencyDisplay',
	PLAYER_ID_DISPLAY: 'player_id',
	
	// Panel page
	PANEL_TITLE: 'panelTitle',
	PANEL_GAME_STATUS: 'panelGameStatus',
	PANEL_PLAYER_COUNT: 'panelPlayerCount',
	PANEL_QUESTION_NUMBER: 'panelQuestionNumber',
	PANEL_QUESTION_TEXT: 'panelQuestionText',
	PANEL_OPTION_A: 'panelOptionA',
	PANEL_OPTION_B: 'panelOptionB',
	PANEL_OPTION_C: 'panelOptionC',
	PANEL_OPTION_D: 'panelOptionD',
	PANEL_LEADERBOARD_LIST: 'panelLeaderboardList',
	PANEL_OPTIONS_GRID: 'panelOptionsGrid'
};

// Local storage keys
export const STORAGE_KEYS = {
	PLAYER_TOKEN: 'playerToken',
	GAME_STATE: 'gameState',
	GAME_PLAYER_ID: (gamePin) => `game_${gamePin}_id`
};

// Route patterns
export const ROUTE_PATTERNS = {
	APP_ROOT: '/',
	APP_GAME: '/game/:pin',
	APP_PANEL: '/panel/:pin'
};

// Default values
export const DEFAULTS = {
	QUESTION_TIME_LIMIT: 30,
	LEADERBOARD_DISPLAY_COUNT: 10,
	ANSWER_OPTION_COUNT: 4
};