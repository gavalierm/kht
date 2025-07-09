/**
 * Frontend Tests for Constants and Configuration
 * - Tests that all constants are properly defined
 * - Tests Slovak language context constants
 * - Tests UI constants and configuration values
 * - Tests consistency of constants across the application
 */

import { describe, test, expect } from '@jest/globals';

describe('Constants and Configuration Frontend Tests', () => {
  let constants;

  beforeEach(async () => {
    // Import all constants
    constants = await import('../../public/shared/constants.js');
  });

  describe('Socket.io Events Constants', () => {
    test('should define all connection events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.CONNECT).toBe('connect');
      expect(SOCKET_EVENTS.DISCONNECT).toBe('disconnect');
      expect(SOCKET_EVENTS.RECONNECT).toBe('reconnect');
    });

    test('should define all game events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.JOIN_GAME).toBe('join_game');
      expect(SOCKET_EVENTS.GAME_JOINED).toBe('game_joined');
      expect(SOCKET_EVENTS.JOIN_ERROR).toBe('join_error');
      expect(SOCKET_EVENTS.PLAYER_RECONNECTED).toBe('player_reconnected');
      expect(SOCKET_EVENTS.RECONNECT_PLAYER).toBe('reconnect_player');
      expect(SOCKET_EVENTS.RECONNECT_ERROR).toBe('reconnect_error');
    });

    test('should define all question events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.QUESTION_STARTED).toBe('question_started');
      expect(SOCKET_EVENTS.QUESTION_ENDED).toBe('question_ended');
      expect(SOCKET_EVENTS.SUBMIT_ANSWER).toBe('submit_answer');
      expect(SOCKET_EVENTS.ANSWER_RESULT).toBe('answer_result');
      expect(SOCKET_EVENTS.LEAVE_GAME).toBe('leave_game');
    });

    test('should define all game end events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.GAME_ENDED).toBe('game_ended');
      expect(SOCKET_EVENTS.GAME_ENDED_DASHBOARD).toBe('game_ended_dashboard');
    });

    test('should define all panel events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.JOIN_PANEL).toBe('join_panel');
      expect(SOCKET_EVENTS.PANEL_GAME_JOINED).toBe('panel_game_joined');
      expect(SOCKET_EVENTS.PANEL_JOIN_ERROR).toBe('panel_join_error');
      expect(SOCKET_EVENTS.PANEL_QUESTION_STARTED).toBe('panel_question_started');
      expect(SOCKET_EVENTS.PANEL_QUESTION_ENDED).toBe('panel_question_ended');
      expect(SOCKET_EVENTS.PANEL_LEADERBOARD_UPDATE).toBe('panel_leaderboard_update');
      expect(SOCKET_EVENTS.PANEL_GAME_ENDED).toBe('panel_game_ended');
    });

    test('should define all moderator events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.CREATE_GAME).toBe('create_game');
      expect(SOCKET_EVENTS.GAME_CREATED).toBe('game_created');
      expect(SOCKET_EVENTS.CREATE_GAME_ERROR).toBe('create_game_error');
      expect(SOCKET_EVENTS.RECONNECT_MODERATOR).toBe('reconnect_moderator');
      expect(SOCKET_EVENTS.START_QUESTION).toBe('start_question');
      expect(SOCKET_EVENTS.END_QUESTION).toBe('end_question');
      expect(SOCKET_EVENTS.START_GAME).toBe('start_game');
      expect(SOCKET_EVENTS.END_GAME).toBe('end_game');
      expect(SOCKET_EVENTS.RESET_GAME).toBe('reset_game');
      expect(SOCKET_EVENTS.SHOW_RESULTS).toBe('show_results');
      expect(SOCKET_EVENTS.GAME_STATE_UPDATE).toBe('game_state_update');
      expect(SOCKET_EVENTS.PLAYERS_UPDATE).toBe('players_update');
    });

    test('should define latency events', () => {
      const { SOCKET_EVENTS } = constants;
      
      expect(SOCKET_EVENTS.LATENCY_PING).toBe('latency_ping');
      expect(SOCKET_EVENTS.LATENCY_PONG).toBe('latency_pong');
    });

    test('should have no duplicate event names', () => {
      const { SOCKET_EVENTS } = constants;
      
      const eventValues = Object.values(SOCKET_EVENTS);
      const uniqueValues = [...new Set(eventValues)];
      
      expect(eventValues.length).toBe(uniqueValues.length);
    });
  });

  describe('Game States Constants', () => {
    test('should define all game states', () => {
      const { GAME_STATES } = constants;
      
      expect(GAME_STATES.WAITING).toBe('waiting');
      expect(GAME_STATES.RUNNING).toBe('running');
      expect(GAME_STATES.ACTIVE).toBe('active');
      expect(GAME_STATES.QUESTION_ACTIVE).toBe('question_active');
      expect(GAME_STATES.RESULTS).toBe('results');
      expect(GAME_STATES.FINISHED).toBe('finished');
      expect(GAME_STATES.ENDED).toBe('ended');
      expect(GAME_STATES.CLOSED).toBe('closed');
    });

    test('should have lowercase state names', () => {
      const { GAME_STATES } = constants;
      
      Object.values(GAME_STATES).forEach(state => {
        expect(state).toBe(state.toLowerCase());
      });
    });
  });

  describe('Answer Options Constants', () => {
    test('should define answer options correctly', () => {
      const { ANSWER_OPTIONS } = constants;
      
      expect(ANSWER_OPTIONS.A).toBe(0);
      expect(ANSWER_OPTIONS.B).toBe(1);
      expect(ANSWER_OPTIONS.C).toBe(2);
      expect(ANSWER_OPTIONS.D).toBe(3);
    });

    test('should have sequential answer option values', () => {
      const { ANSWER_OPTIONS } = constants;
      
      const values = Object.values(ANSWER_OPTIONS);
      const expectedValues = [0, 1, 2, 3];
      
      expect(values.sort()).toEqual(expectedValues);
    });

    test('should define answer option classes', () => {
      const { ANSWER_OPTION_CLASSES } = constants;
      
      expect(ANSWER_OPTION_CLASSES).toHaveLength(4);
      expect(ANSWER_OPTION_CLASSES[0]).toBe('option_a');
      expect(ANSWER_OPTION_CLASSES[1]).toBe('option_b');
      expect(ANSWER_OPTION_CLASSES[2]).toBe('option_c');
      expect(ANSWER_OPTION_CLASSES[3]).toBe('option_d');
    });

    test('should have consistent answer options and classes', () => {
      const { ANSWER_OPTIONS, ANSWER_OPTION_CLASSES } = constants;
      
      expect(Object.keys(ANSWER_OPTIONS).length).toBe(ANSWER_OPTION_CLASSES.length);
    });
  });

  describe('UI Constants', () => {
    test('should define timing constants', () => {
      const { UI_CONSTANTS } = constants;
      
      expect(UI_CONSTANTS.NOTIFICATION_DURATION).toBe(3000);
      expect(UI_CONSTANTS.QUESTION_RESULT_DISPLAY_TIME).toBe(10000);
      expect(UI_CONSTANTS.LATENCY_UPDATE_INTERVAL).toBe(1000);
      expect(UI_CONSTANTS.TIMER_UPDATE_INTERVAL).toBe(1000);
    });

    test('should define input validation constants', () => {
      const { UI_CONSTANTS } = constants;
      
      expect(UI_CONSTANTS.MIN_PIN_LENGTH).toBe(6);
    });

    test('should have reasonable timing values', () => {
      const { UI_CONSTANTS } = constants;
      
      // Notification duration should be reasonable (3 seconds)
      expect(UI_CONSTANTS.NOTIFICATION_DURATION).toBeGreaterThan(1000);
      expect(UI_CONSTANTS.NOTIFICATION_DURATION).toBeLessThan(10000);
      
      // Result display time should be reasonable (10 seconds)
      expect(UI_CONSTANTS.QUESTION_RESULT_DISPLAY_TIME).toBeGreaterThan(5000);
      expect(UI_CONSTANTS.QUESTION_RESULT_DISPLAY_TIME).toBeLessThan(30000);
      
      // Update intervals should be reasonable (1 second)
      expect(UI_CONSTANTS.LATENCY_UPDATE_INTERVAL).toBeGreaterThan(500);
      expect(UI_CONSTANTS.LATENCY_UPDATE_INTERVAL).toBeLessThan(5000);
    });
  });

  describe('CSS Classes Constants', () => {
    test('should define basic CSS classes', () => {
      const { CSS_CLASSES } = constants;
      
      expect(CSS_CLASSES.VISIBLE).toBe('visible');
      expect(CSS_CLASSES.PAGE).toBe('page');
      expect(CSS_CLASSES.PHASE).toBe('phase');
      expect(CSS_CLASSES.OPTION).toBe('option');
    });

    test('should define state CSS classes', () => {
      const { CSS_CLASSES } = constants;
      
      expect(CSS_CLASSES.SUCCESS).toBe('success');
      expect(CSS_CLASSES.ERROR).toBe('error');
      expect(CSS_CLASSES.INFO).toBe('info');
      expect(CSS_CLASSES.WARNING).toBe('warning');
    });

    test('should define answer CSS classes', () => {
      const { CSS_CLASSES } = constants;
      
      expect(CSS_CLASSES.CORRECT).toBe('correct');
      expect(CSS_CLASSES.SELECTED).toBe('selected');
    });

    test('should define panel CSS classes', () => {
      const { CSS_CLASSES } = constants;
      
      expect(CSS_CLASSES.PANEL_WAITING).toBe('panel-waiting');
      expect(CSS_CLASSES.PANEL_ACTIVE).toBe('panel-active');
      expect(CSS_CLASSES.PANEL_FINISHED).toBe('panel-finished');
    });

    test('should have consistent naming convention', () => {
      const { CSS_CLASSES } = constants;
      
      Object.values(CSS_CLASSES).forEach(className => {
        // Should be lowercase and may contain dashes
        expect(className).toMatch(/^[a-z-]+$/);
      });
    });
  });

  describe('Element IDs Constants', () => {
    test('should define common element IDs', () => {
      const { ELEMENT_IDS } = constants;
      
      expect(ELEMENT_IDS.MESSAGE_BOX).toBe('messageBox');
    });

    test('should define login page element IDs', () => {
      const { ELEMENT_IDS } = constants;
      
      expect(ELEMENT_IDS.JOIN_GAME_BTN).toBe('joinGameBtn');
      expect(ELEMENT_IDS.GAME_PIN_INPUT).toBe('gamePinInput');
    });

    test('should define game page element IDs', () => {
      const { ELEMENT_IDS } = constants;
      
      expect(ELEMENT_IDS.HEADER).toBe('header');
      expect(ELEMENT_IDS.GAME_CODE).toBe('gameCode');
      expect(ELEMENT_IDS.GAME_STATUS).toBe('gameStatus');
      expect(ELEMENT_IDS.QUESTION_TEXT).toBe('questionText');
      expect(ELEMENT_IDS.TIMER).toBe('timer');
      expect(ELEMENT_IDS.OPTIONS).toBe('options');
      expect(ELEMENT_IDS.PLAYGROUND).toBe('playground');
      expect(ELEMENT_IDS.RESULT).toBe('result');
    });

    test('should define panel page element IDs', () => {
      const { ELEMENT_IDS } = constants;
      
      expect(ELEMENT_IDS.PANEL_TITLE).toBe('panelTitle');
      expect(ELEMENT_IDS.PANEL_GAME_STATUS).toBe('panelGameStatus');
      expect(ELEMENT_IDS.PANEL_PLAYER_COUNT).toBe('panelPlayerCount');
      expect(ELEMENT_IDS.PANEL_QUESTION_NUMBER).toBe('panelQuestionNumber');
      expect(ELEMENT_IDS.PANEL_QUESTION_TEXT).toBe('panelQuestionText');
      expect(ELEMENT_IDS.PANEL_LEADERBOARD_LIST).toBe('panelLeaderboardList');
    });

    test('should use camelCase naming convention', () => {
      const { ELEMENT_IDS } = constants;
      
      Object.values(ELEMENT_IDS).forEach(id => {
        if (typeof id === 'string') {
          // Should start with lowercase letter
          expect(id).toMatch(/^[a-z]/);
          // Should not contain spaces or special characters except function parentheses
          expect(id).toMatch(/^[a-zA-Z0-9_]+$/);
        }
      });
    });
  });

  describe('Storage Keys Constants', () => {
    test('should define storage keys', () => {
      const { STORAGE_KEYS } = constants;
      
      expect(STORAGE_KEYS.PLAYER_TOKEN).toBe('playerToken');
      expect(STORAGE_KEYS.GAME_STATE).toBe('gameState');
    });

    test('should define storage key functions', () => {
      const { STORAGE_KEYS } = constants;
      
      expect(typeof STORAGE_KEYS.GAME_PLAYER_ID).toBe('function');
      expect(STORAGE_KEYS.GAME_PLAYER_ID('123456')).toBe('game_123456_id');
    });

    test('should generate consistent storage keys', () => {
      const { STORAGE_KEYS } = constants;
      
      const pin1 = '123456';
      const pin2 = '654321';
      
      expect(STORAGE_KEYS.GAME_PLAYER_ID(pin1)).toBe('game_123456_id');
      expect(STORAGE_KEYS.GAME_PLAYER_ID(pin2)).toBe('game_654321_id');
      expect(STORAGE_KEYS.GAME_PLAYER_ID(pin1)).toBe(STORAGE_KEYS.GAME_PLAYER_ID(pin1));
    });
  });

  describe('API Endpoints Constants', () => {
    test('should define API endpoints', () => {
      const { API_ENDPOINTS } = constants;
      
      expect(API_ENDPOINTS.GAMES).toBe('/api/games');
    });

    test('should define API endpoint functions', () => {
      const { API_ENDPOINTS } = constants;
      
      expect(typeof API_ENDPOINTS.GAME_BY_PIN).toBe('function');
      expect(API_ENDPOINTS.GAME_BY_PIN('123456')).toBe('/api/games/123456');
      
      expect(typeof API_ENDPOINTS.GAME_LEADERBOARD).toBe('function');
      expect(API_ENDPOINTS.GAME_LEADERBOARD('123456')).toBe('/api/games/123456/leaderboard');
      
      expect(typeof API_ENDPOINTS.GAME_QUESTIONS).toBe('function');
      expect(API_ENDPOINTS.GAME_QUESTIONS('123456')).toBe('/api/games/123456/questions');
    });

    test('should generate valid API paths', () => {
      const { API_ENDPOINTS } = constants;
      
      const testPin = '123456';
      
      expect(API_ENDPOINTS.GAME_BY_PIN(testPin)).toMatch(/^\/api\/games\/\d+$/);
      expect(API_ENDPOINTS.GAME_LEADERBOARD(testPin)).toMatch(/^\/api\/games\/\d+\/leaderboard$/);
      expect(API_ENDPOINTS.GAME_QUESTIONS(testPin)).toMatch(/^\/api\/games\/\d+\/questions$/);
    });
  });

  describe('Route Patterns Constants', () => {
    test('should define route patterns', () => {
      const { ROUTE_PATTERNS } = constants;
      
      expect(ROUTE_PATTERNS.APP_ROOT).toBe('/');
      expect(ROUTE_PATTERNS.APP_GAME).toBe('/game/:pin');
      expect(ROUTE_PATTERNS.APP_PANEL).toBe('/panel/:pin');
    });

    test('should use valid route pattern syntax', () => {
      const { ROUTE_PATTERNS } = constants;
      
      Object.values(ROUTE_PATTERNS).forEach(pattern => {
        // Should start with /
        expect(pattern).toMatch(/^\//);
        // Should be valid route pattern
        expect(pattern).toMatch(/^\/([a-z/:]+)?$/);
      });
    });
  });

  describe('Default Values Constants', () => {
    test('should define default values', () => {
      const { DEFAULTS } = constants;
      
      expect(DEFAULTS.QUESTION_TIME_LIMIT).toBe(30);
      expect(DEFAULTS.LEADERBOARD_DISPLAY_COUNT).toBe(10);
      expect(DEFAULTS.ANSWER_OPTION_COUNT).toBe(4);
    });

    test('should have reasonable default values', () => {
      const { DEFAULTS } = constants;
      
      // Question time limit should be reasonable (30 seconds)
      expect(DEFAULTS.QUESTION_TIME_LIMIT).toBeGreaterThan(10);
      expect(DEFAULTS.QUESTION_TIME_LIMIT).toBeLessThan(120);
      
      // Leaderboard display count should be reasonable
      expect(DEFAULTS.LEADERBOARD_DISPLAY_COUNT).toBeGreaterThan(5);
      expect(DEFAULTS.LEADERBOARD_DISPLAY_COUNT).toBeLessThan(100);
      
      // Answer option count should be 4 (A, B, C, D)
      expect(DEFAULTS.ANSWER_OPTION_COUNT).toBe(4);
    });
  });

  describe('Slovak Language Context', () => {
    test('should be consistent with Slovak game PIN length', () => {
      const { UI_CONSTANTS } = constants;
      
      // Slovak games typically use 6-digit PINs
      expect(UI_CONSTANTS.MIN_PIN_LENGTH).toBe(6);
    });

    test('should have timing appropriate for Slovak language', () => {
      const { UI_CONSTANTS, DEFAULTS } = constants;
      
      // Notification duration should be long enough for Slovak text
      expect(UI_CONSTANTS.NOTIFICATION_DURATION).toBeGreaterThanOrEqual(3000);
      
      // Question time limit should be reasonable for Slovak text
      expect(DEFAULTS.QUESTION_TIME_LIMIT).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Consistency Checks', () => {
    test('should have consistent answer option counts', () => {
      const { ANSWER_OPTIONS, ANSWER_OPTION_CLASSES, DEFAULTS } = constants;
      
      const optionCount = Object.keys(ANSWER_OPTIONS).length;
      const classCount = ANSWER_OPTION_CLASSES.length;
      const defaultCount = DEFAULTS.ANSWER_OPTION_COUNT;
      
      expect(optionCount).toBe(classCount);
      expect(optionCount).toBe(defaultCount);
      expect(classCount).toBe(defaultCount);
    });

    test('should have consistent timing constants', () => {
      const { UI_CONSTANTS } = constants;
      
      // Update intervals should be reasonable
      expect(UI_CONSTANTS.LATENCY_UPDATE_INTERVAL).toBe(UI_CONSTANTS.TIMER_UPDATE_INTERVAL);
    });

    test('should have consistent CSS class naming', () => {
      const { CSS_CLASSES } = constants;
      
      // Panel classes should follow consistent naming
      expect(CSS_CLASSES.PANEL_WAITING).toMatch(/^panel-/);
      expect(CSS_CLASSES.PANEL_ACTIVE).toMatch(/^panel-/);
      expect(CSS_CLASSES.PANEL_FINISHED).toMatch(/^panel-/);
    });
  });

  describe('Type Safety', () => {
    test('should have correct types for all constants', () => {
      const { SOCKET_EVENTS, GAME_STATES, ANSWER_OPTIONS, UI_CONSTANTS, CSS_CLASSES, ELEMENT_IDS, STORAGE_KEYS, API_ENDPOINTS, ROUTE_PATTERNS, DEFAULTS } = constants;
      
      // All socket events should be strings
      Object.values(SOCKET_EVENTS).forEach(event => {
        expect(typeof event).toBe('string');
      });
      
      // All game states should be strings
      Object.values(GAME_STATES).forEach(state => {
        expect(typeof state).toBe('string');
      });
      
      // All answer options should be numbers
      Object.values(ANSWER_OPTIONS).forEach(option => {
        expect(typeof option).toBe('number');
      });
      
      // All UI constants should be numbers
      Object.values(UI_CONSTANTS).forEach(constant => {
        expect(typeof constant).toBe('number');
      });
      
      // All CSS classes should be strings
      Object.values(CSS_CLASSES).forEach(className => {
        expect(typeof className).toBe('string');
      });
      
      // All defaults should be numbers
      Object.values(DEFAULTS).forEach(defaultValue => {
        expect(typeof defaultValue).toBe('number');
      });
    });

    test('should have no null or undefined values', () => {
      const { SOCKET_EVENTS, GAME_STATES, ANSWER_OPTIONS, UI_CONSTANTS, CSS_CLASSES, ELEMENT_IDS, STORAGE_KEYS, ROUTE_PATTERNS, DEFAULTS } = constants;
      
      const allConstants = {
        ...SOCKET_EVENTS,
        ...GAME_STATES,
        ...ANSWER_OPTIONS,
        ...UI_CONSTANTS,
        ...CSS_CLASSES,
        ...ELEMENT_IDS,
        ...STORAGE_KEYS,
        ...ROUTE_PATTERNS,
        ...DEFAULTS
      };
      
      Object.values(allConstants).forEach(value => {
        if (typeof value !== 'function') {
          expect(value).not.toBeNull();
          expect(value).not.toBeUndefined();
        }
      });
    });
  });
});