/**
 * Router utilities for handling page navigation and URL management
 */

export class Router {
	constructor() {
		this.routes = new Map();
		this.currentPath = window.location.pathname;
		this.setupPopStateHandler();
	}

	/**
	 * Setup browser back/forward navigation handler
	 */
	setupPopStateHandler() {
		window.addEventListener('popstate', () => {
			this.handleRouteChange(window.location.pathname);
		});
	}

	/**
	 * Register a route handler
	 * @param {string} path - Route path
	 * @param {Function} handler - Route handler function
	 */
	addRoute(path, handler) {
		this.routes.set(path, handler);
	}

	/**
	 * Navigate to a path
	 * @param {string} path - Target path
	 */
	navigateTo(path = '/') {
		const normalizedCurrent = this.normalizePath(this.currentPath);
		const normalizedTarget = this.normalizePath(path);

		// Validate path for security
		if (!this.isValidPath(normalizedTarget)) {
			console.error('Invalid target path:', normalizedTarget);
			return;
		}

		if (normalizedCurrent !== normalizedTarget) {
			history.pushState(null, '', path);
		}

		this.handleRouteChange(normalizedTarget);
	}

	/**
	 * Handle route change
	 * @param {string} path - New path
	 */
	handleRouteChange(path) {
		this.currentPath = path;
		
		// Hide all pages
		this.hideAllPages();
		
		// Find and execute route handler
		const handler = this.routes.get(path);
		if (handler) {
			handler(path);
		} else {
			// Try to find a matching pattern
			this.handlePatternRoute(path);
		}
	}

	/**
	 * Handle pattern-based routes
	 * @param {string} path - Current path
	 */
	handlePatternRoute(path) {
		// Check for common patterns
		if (path.startsWith('/app/') && path.includes('/game')) {
			this.showPage('game');
			this.showPhase('playground');
		} else if (path.startsWith('/app/') && path.includes('/panel')) {
			this.showPage('panel');
		} else if (path.startsWith('/app/') || path === '/app') {
			this.showPage('login');
		} else {
			console.warn('Unknown route:', path);
			this.showPage('login');
		}
	}

	/**
	 * Hide all pages
	 */
	hideAllPages() {
		document.querySelectorAll('.page').forEach(el => {
			el.classList.remove('visible');
		});
		document.querySelectorAll('.phase').forEach(el => {
			el.classList.remove('visible');
		});
	}

	/**
	 * Show a specific page
	 * @param {string} pageId - Page ID to show
	 */
	showPage(pageId) {
		if (!pageId || typeof pageId !== 'string') {
			console.warn('Router: Invalid pageId provided to showPage:', pageId);
			return;
		}

		try {
			const page = document.querySelector(`#${pageId}.page`);
			if (page && page.classList) {
				page.classList.add('visible');
			} else {
				console.warn(`Router: Page element not found: #${pageId}.page`);
				// Fallback: try to show a default page or handle gracefully
				this.handleMissingPage(pageId);
			}
		} catch (error) {
			console.error(`Router: Error showing page ${pageId}:`, error);
		}
	}

	/**
	 * Show a specific phase
	 * @param {string} phaseId - Phase ID to show
	 */
	showPhase(phaseId) {
		if (!phaseId || typeof phaseId !== 'string') {
			console.warn('Router: Invalid phaseId provided to showPhase:', phaseId);
			return;
		}

		try {
			const phase = document.querySelector(`#${phaseId}.phase`);
			if (phase && phase.classList) {
				phase.classList.add('visible');
			} else {
				console.warn(`Router: Phase element not found: #${phaseId}.phase`);
				// Fallback: try to show a default phase or handle gracefully
				this.handleMissingPhase(phaseId);
			}
		} catch (error) {
			console.error(`Router: Error showing phase ${phaseId}:`, error);
		}
	}

	/**
	 * Handle missing page elements gracefully
	 * @param {string} pageId - The missing page ID
	 */
	handleMissingPage(pageId) {
		// Try to show a fallback page (login/default)
		const fallbackPage = document.querySelector('#login.page') || 
							 document.querySelector('.page:first-child');
		if (fallbackPage && fallbackPage.classList) {
			console.warn(`Router: Showing fallback page instead of missing ${pageId}`);
			fallbackPage.classList.add('visible');
		}
	}

	/**
	 * Handle missing phase elements gracefully
	 * @param {string} phaseId - The missing phase ID
	 */
	handleMissingPhase(phaseId) {
		// Try to show a fallback phase (playground/default)
		const fallbackPhase = document.querySelector('#playground.phase') || 
							  document.querySelector('.phase:first-child');
		if (fallbackPhase && fallbackPhase.classList) {
			console.warn(`Router: Showing fallback phase instead of missing ${phaseId}`);
			fallbackPhase.classList.add('visible');
		}
	}

	/**
	 * Normalize path by removing trailing slashes and converting to lowercase
	 * @param {string} path - Path to normalize
	 * @returns {string} Normalized path
	 */
	normalizePath(path) {
		return path.replace(/\/+$/, '').toLowerCase();
	}

	/**
	 * Validate path for security
	 * @param {string} path - Path to validate
	 * @returns {boolean} Whether path is valid
	 */
	isValidPath(path) {
		// Allow only alphanumeric characters, hyphens, and slashes
		return /^\/[a-z0-9\/\-]*$/i.test(path);
	}

	/**
	 * Get current path
	 * @returns {string} Current path
	 */
	getCurrentPath() {
		return this.currentPath;
	}

	/**
	 * Extract parameter from URL path
	 * @param {string} path - URL path
	 * @param {number} index - Parameter index (0-based)
	 * @returns {string|null} Parameter value or null
	 */
	getPathParameter(path, index) {
		const parts = path.split('/').filter(part => part.length > 0);
		return parts[index] || null;
	}

	/**
	 * Extract game PIN from URL
	 * @param {string} path - URL path (optional, uses current path if not provided)
	 * @returns {string|null} Game PIN or null
	 */
	extractGamePin(path = this.currentPath) {
		// Pattern: /app/123456/game, /app/123456/panel, /app/123456/stage, /app/123456/dashboard
		const match = path.match(/\/app\/(\d+)\/(game|panel|stage|dashboard)/);
		if (match) {
			return match[1];
		}
		
		// Pattern: /app/123456
		const simpleMatch = path.match(/\/app\/(\d+)/);
		if (simpleMatch) {
			return simpleMatch[1];
		}
		
		return null;
	}

	/**
	 * Navigate to join screen
	 */
	navigateToJoin() {
		this.navigateTo('/app');
	}

	/**
	 * Navigate to game view
	 * @param {string} pin - Game PIN
	 */
	navigateToGame(pin) {
		this.navigateTo(`/app/${pin}/game`);
	}

	/**
	 * Redirect to game view (full page redirect)
	 * @param {string} pin - Game PIN
	 */
	redirectToGame(pin) {
		window.location.href = `/app/${pin}/game`;
	}

	/**
	 * Redirect to panel view (full page redirect)
	 * @param {string} pin - Game PIN
	 */
	redirectToPanel(pin) {
		window.location.href = `/app/${pin}/panel`;
	}

	/**
	 * Redirect to stage view (full page redirect)
	 * @param {string} pin - Game PIN
	 */
	redirectToStage(pin) {
		window.location.href = `/app/${pin}/stage`;
	}

	/**
	 * Redirect to dashboard view (full page redirect)
	 * @param {string} pin - Game PIN
	 */
	redirectToDashboard(pin) {
		window.location.href = `/app/${pin}/dashboard`;
	}

	/**
	 * Redirect to join screen (full page redirect)
	 */
	redirectToJoin() {
		window.location.href = '/app';
	}

	/**
	 * Navigate to panel view
	 * @param {string} pin - Game PIN
	 */
	navigateToPanel(pin) {
		this.navigateTo(`/app/${pin}/panel`);
	}

	/**
	 * Navigate to stage view (results)
	 * @param {string} pin - Game PIN
	 */
	navigateToStage(pin) {
		this.navigateTo(`/app/${pin}/stage`);
	}

	/**
	 * Navigate to dashboard view
	 * @param {string} pin - Game PIN
	 */
	navigateToDashboard(pin) {
		this.navigateTo(`/app/${pin}/dashboard`);
	}
}

// Create default instance
export const defaultRouter = new Router();

// Export convenience methods
export const navigateTo = defaultRouter.navigateTo.bind(defaultRouter);
export const addRoute = defaultRouter.addRoute.bind(defaultRouter);
export const getCurrentPath = defaultRouter.getCurrentPath.bind(defaultRouter);
export const extractGamePin = defaultRouter.extractGamePin.bind(defaultRouter);
export const getPathParameter = defaultRouter.getPathParameter.bind(defaultRouter);

// Export navigation methods
export const navigateToJoin = defaultRouter.navigateToJoin.bind(defaultRouter);
export const navigateToGame = defaultRouter.navigateToGame.bind(defaultRouter);
export const navigateToPanel = defaultRouter.navigateToPanel.bind(defaultRouter);
export const navigateToStage = defaultRouter.navigateToStage.bind(defaultRouter);
export const navigateToDashboard = defaultRouter.navigateToDashboard.bind(defaultRouter);

// Export redirect methods (full page redirects)
export const redirectToGame = defaultRouter.redirectToGame.bind(defaultRouter);
export const redirectToPanel = defaultRouter.redirectToPanel.bind(defaultRouter);
export const redirectToStage = defaultRouter.redirectToStage.bind(defaultRouter);
export const redirectToDashboard = defaultRouter.redirectToDashboard.bind(defaultRouter);
export const redirectToJoin = defaultRouter.redirectToJoin.bind(defaultRouter);