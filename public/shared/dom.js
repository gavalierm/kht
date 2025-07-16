/**
 * DOM manipulation utilities
 */

export class DOMHelper {
	constructor() {
		this.elementCache = new Map();
	}

	/**
	 * Get element by ID with caching
	 * @param {string} id - Element ID
	 * @returns {HTMLElement|null} Element or null if not found
	 */
	getElementById(id) {
		if (!this.elementCache.has(id)) {
			this.elementCache.set(id, document.getElementById(id));
		}
		return this.elementCache.get(id);
	}

	/**
	 * Get element by selector
	 * @param {string} selector - CSS selector
	 * @returns {HTMLElement|null} Element or null if not found
	 */
	querySelector(selector) {
		return document.querySelector(selector);
	}

	/**
	 * Get all elements by selector
	 * @param {string} selector - CSS selector
	 * @returns {NodeList} List of elements
	 */
	querySelectorAll(selector) {
		return document.querySelectorAll(selector);
	}

	/**
	 * Cache multiple elements by their IDs
	 * @param {string[]} ids - Array of element IDs
	 * @returns {Object} Object with element references
	 */
	cacheElements(ids) {
		const elements = {};
		ids.forEach(id => {
			elements[id] = this.getElementById(id);
		});
		return elements;
	}

	/**
	 * Add event listener to element
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} event - Event type
	 * @param {Function} handler - Event handler
	 * @param {Object} options - Event options
	 */
	addEventListener(element, event, handler, options = {}) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && typeof el.addEventListener === 'function') {
			el.addEventListener(event, handler, options);
		} else if (!el) {
			console.warn(`DOM Helper: Element not found for addEventListener: ${element}`);
		}
	}

	/**
	 * Remove event listener from element
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} event - Event type
	 * @param {Function} handler - Event handler
	 */
	removeEventListener(element, event, handler) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && typeof el.removeEventListener === 'function') {
			el.removeEventListener(event, handler);
		} else if (!el) {
			console.warn(`DOM Helper: Element not found for removeEventListener: ${element}`);
		}
	}

	/**
	 * Set element text content
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} text - Text content
	 */
	setText(element, text) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && typeof el.textContent !== 'undefined') {
			el.textContent = text;
		} else if (!el) {
			console.warn(`DOM Helper: Element not found for setText: ${element}`);
		}
	}

	/**
	 * Set element HTML content (with XSS protection)
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} html - HTML content
	 */
	setHTML(element, html) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && typeof el.innerHTML !== 'undefined') {
			// Sanitize HTML to prevent XSS attacks
			const sanitizedHTML = this.sanitizeHTML(html);
			el.innerHTML = sanitizedHTML;
		} else if (!el) {
			console.warn(`DOM Helper: Element not found for setHTML: ${element}`);
		}
	}

	/**
	 * Basic HTML sanitization to prevent XSS attacks
	 * @param {string} html - HTML string to sanitize
	 * @returns {string} Sanitized HTML
	 */
	sanitizeHTML(html) {
		if (typeof html !== 'string') {
			console.warn('DOM Helper: HTML content must be a string');
			return '';
		}

		// Create a temporary element to parse HTML
		const temp = document.createElement('div');
		temp.textContent = html; // This escapes all HTML tags
		
		// For cases where we need to allow some safe HTML, we can expand this
		// For now, we escape everything to prevent XSS
		return temp.innerHTML;
	}

	/**
	 * Set element HTML content with explicit trust (use with caution)
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} html - Trusted HTML content
	 */
	setTrustedHTML(element, html) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && typeof el.innerHTML !== 'undefined') {
			console.warn('DOM Helper: Using setTrustedHTML - ensure content is safe!');
			el.innerHTML = html;
		} else if (!el) {
			console.warn(`DOM Helper: Element not found for setTrustedHTML: ${element}`);
		}
	}

	/**
	 * Add CSS class to element
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} className - CSS class name
	 */
	addClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && className && className.trim()) {
			el.classList.add(className);
		}
	}

	/**
	 * Remove CSS class from element
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} className - CSS class name
	 */
	removeClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			el.classList.remove(className);
		}
	}

	/**
	 * Toggle CSS class on element
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} className - CSS class name
	 */
	toggleClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			el.classList.toggle(className);
		}
	}

	/**
	 * Check if element has CSS class
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} className - CSS class name
	 * @returns {boolean} Whether element has class
	 */
	hasClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		return el ? el.classList.contains(className) : false;
	}

	/**
	 * Set element style property
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {string} property - CSS property name
	 * @param {string} value - CSS property value
	 */
	setStyle(element, property, value) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && property && value !== undefined) {
			el.style[property] = value;
		}
	}

	/**
	 * Set multiple style properties
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {Object} styles - Object with CSS properties and values
	 */
	setStyles(element, styles) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			Object.keys(styles).forEach(property => {
				el.style[property] = styles[property];
			});
		}
	}

	/**
	 * Show element
	 * @param {string|HTMLElement} element - Element ID or element
	 */
	show(element) {
		this.addClass(element, 'visible');
	}

	/**
	 * Hide element
	 * @param {string|HTMLElement} element - Element ID or element
	 */
	hide(element) {
		this.removeClass(element, 'visible');
	}

	/**
	 * Enable or disable element
	 * @param {string|HTMLElement} element - Element ID or element
	 * @param {boolean} enabled - Whether element should be enabled
	 */
	setEnabled(element, enabled) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			if (enabled) {
				el.removeAttribute('disabled');
			} else {
				el.setAttribute('disabled', 'disabled');
			}
		}
	}

	/**
	 * Clear element cache
	 */
	clearCache() {
		this.elementCache.clear();
	}

	/**
	 * Wait for DOM to be ready
	 * @param {Function} callback - Callback to execute when DOM is ready
	 */
	ready(callback) {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', callback);
		} else {
			callback();
		}
	}
}

// Create default instance
export const defaultDOMHelper = new DOMHelper();

// Export convenience methods
export const getElementById = defaultDOMHelper.getElementById.bind(defaultDOMHelper);
export const querySelector = defaultDOMHelper.querySelector.bind(defaultDOMHelper);
export const querySelectorAll = defaultDOMHelper.querySelectorAll.bind(defaultDOMHelper);
export const cacheElements = defaultDOMHelper.cacheElements.bind(defaultDOMHelper);
export const addEventListener = defaultDOMHelper.addEventListener.bind(defaultDOMHelper);
export const removeEventListener = defaultDOMHelper.removeEventListener.bind(defaultDOMHelper);
export const setText = defaultDOMHelper.setText.bind(defaultDOMHelper);
export const setHTML = defaultDOMHelper.setHTML.bind(defaultDOMHelper);
export const addClass = defaultDOMHelper.addClass.bind(defaultDOMHelper);
export const removeClass = defaultDOMHelper.removeClass.bind(defaultDOMHelper);
export const toggleClass = defaultDOMHelper.toggleClass.bind(defaultDOMHelper);
export const hasClass = defaultDOMHelper.hasClass.bind(defaultDOMHelper);
export const setStyle = defaultDOMHelper.setStyle.bind(defaultDOMHelper);
export const setStyles = defaultDOMHelper.setStyles.bind(defaultDOMHelper);
export const show = defaultDOMHelper.show.bind(defaultDOMHelper);
export const hide = defaultDOMHelper.hide.bind(defaultDOMHelper);
export const setEnabled = defaultDOMHelper.setEnabled.bind(defaultDOMHelper);
export const domReady = defaultDOMHelper.ready.bind(defaultDOMHelper);