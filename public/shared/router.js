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
		} else if (path.startsWith('/app/')) {
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
		const page = document.querySelector(`#${pageId}.page`);
		if (page) {
			page.classList.add('visible');
		}
	}

	/**
	 * Show a specific phase
	 * @param {string} phaseId - Phase ID to show
	 */
	showPhase(phaseId) {
		const phase = document.querySelector(`#${phaseId}.phase`);
		if (phase) {
			phase.classList.add('visible');
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
		// Pattern: /app/123456/game or /app/123456/panel
		const match = path.match(/\/app\/(\d+)\/(game|panel)/);
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
}

// Create default instance
export const defaultRouter = new Router();

// Export convenience methods
export const navigateTo = defaultRouter.navigateTo.bind(defaultRouter);
export const addRoute = defaultRouter.addRoute.bind(defaultRouter);
export const getCurrentPath = defaultRouter.getCurrentPath.bind(defaultRouter);
export const extractGamePin = defaultRouter.extractGamePin.bind(defaultRouter);
export const getPathParameter = defaultRouter.getPathParameter.bind(defaultRouter);