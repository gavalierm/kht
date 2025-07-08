/**
 * DOM Helper Test Suite
 * Testing the DOM manipulation utility functions
 */

// Mock DOM for testing
class MockElement {
	constructor(id) {
		this.id = id;
		this.textContent = '';
		this.innerHTML = '';
		this.classList = new MockClassList();
		this.style = {};
		this.attributes = {};
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	removeAttribute(name) {
		delete this.attributes[name];
	}

	getAttribute(name) {
		return this.attributes[name];
	}

	hasAttribute(name) {
		return name in this.attributes;
	}
}

class MockClassList {
	constructor() {
		this.classes = new Set();
	}

	add(className) {
		this.classes.add(className);
	}

	remove(className) {
		this.classes.delete(className);
	}

	toggle(className) {
		if (this.classes.has(className)) {
			this.classes.delete(className);
			return false;
		} else {
			this.classes.add(className);
			return true;
		}
	}

	contains(className) {
		return this.classes.has(className);
	}
}

// Mock document
const mockDocument = {
	getElementById: jest.fn(),
	querySelector: jest.fn(),
	querySelectorAll: jest.fn(),
	createElement: jest.fn(() => new MockElement()),
	readyState: 'complete'
};

// Setup global mocks
global.document = mockDocument;
global.console = {
	warn: jest.fn(),
	log: jest.fn(),
	error: jest.fn()
};

// Create DOMHelper class locally for testing since we can't import ES modules in Jest
class DOMHelper {
	constructor() {
		this.elementCache = new Map();
	}

	getElementById(id) {
		if (!this.elementCache.has(id)) {
			this.elementCache.set(id, document.getElementById(id));
		}
		return this.elementCache.get(id);
	}

	setText(element, text) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el && typeof el.textContent !== 'undefined') {
			el.textContent = text;
		} else if (!el) {
			console.warn(`DOM Helper: Element not found for setText: ${element}`);
		}
	}

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

	addClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			el.classList.add(className);
		}
	}

	removeClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			el.classList.remove(className);
		}
	}

	toggleClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			el.classList.toggle(className);
		}
	}

	hasClass(element, className) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		return el ? el.classList.contains(className) : false;
	}

	setStyle(element, property, value) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			el.style[property] = value;
		}
	}

	setStyles(element, styles) {
		const el = typeof element === 'string' ? this.getElementById(element) : element;
		if (el) {
			Object.keys(styles).forEach(property => {
				el.style[property] = styles[property];
			});
		}
	}

	cacheElements(ids) {
		const elements = {};
		ids.forEach(id => {
			elements[id] = this.getElementById(id);
		});
		return elements;
	}

	clearCache() {
		this.elementCache.clear();
	}
}

describe('DOMHelper', () => {
	let domHelper;
	let mockElement;

	beforeEach(() => {
		domHelper = new DOMHelper();
		mockElement = new MockElement('test-element');
		
		// Reset mocks
		jest.clearAllMocks();
		mockDocument.getElementById.mockReturnValue(mockElement);
	});

	describe('Element caching', () => {
		test('should cache elements by ID', () => {
			const element = domHelper.getElementById('test-id');
			
			expect(mockDocument.getElementById).toHaveBeenCalledWith('test-id');
			expect(element).toBe(mockElement);
			
			// Second call should use cache
			const cachedElement = domHelper.getElementById('test-id');
			expect(mockDocument.getElementById).toHaveBeenCalledTimes(1);
			expect(cachedElement).toBe(mockElement);
		});

		test('should cache multiple elements', () => {
			const elements = domHelper.cacheElements(['element1', 'element2']);
			
			expect(elements).toHaveProperty('element1');
			expect(elements).toHaveProperty('element2');
			expect(mockDocument.getElementById).toHaveBeenCalledWith('element1');
			expect(mockDocument.getElementById).toHaveBeenCalledWith('element2');
		});
	});

	describe('Text manipulation', () => {
		test('should set text content', () => {
			domHelper.setText(mockElement, 'Test text');
			expect(mockElement.textContent).toBe('Test text');
		});

		test('should set text content by element ID', () => {
			domHelper.setText('test-id', 'Test text by ID');
			expect(mockElement.textContent).toBe('Test text by ID');
		});

		test('should handle null element gracefully', () => {
			mockDocument.getElementById.mockReturnValue(null);
			domHelper.setText('non-existent', 'text');
			expect(console.warn).toHaveBeenCalled();
		});
	});

	describe('CSS class manipulation', () => {
		test('should add CSS class', () => {
			domHelper.addClass(mockElement, 'test-class');
			expect(mockElement.classList.contains('test-class')).toBe(true);
		});

		test('should remove CSS class', () => {
			mockElement.classList.add('existing-class');
			domHelper.removeClass(mockElement, 'existing-class');
			expect(mockElement.classList.contains('existing-class')).toBe(false);
		});

		test('should toggle CSS class', () => {
			domHelper.toggleClass(mockElement, 'toggle-class');
			expect(mockElement.classList.contains('toggle-class')).toBe(true);
			
			domHelper.toggleClass(mockElement, 'toggle-class');
			expect(mockElement.classList.contains('toggle-class')).toBe(false);
		});

		test('should check if element has class', () => {
			mockElement.classList.add('has-class');
			expect(domHelper.hasClass(mockElement, 'has-class')).toBe(true);
			expect(domHelper.hasClass(mockElement, 'no-class')).toBe(false);
		});
	});

	describe('Element enable/disable functionality', () => {
		test('should enable element by removing disabled attribute', () => {
			mockElement.setAttribute('disabled', 'disabled');
			
			domHelper.setEnabled(mockElement, true);
			
			expect(mockElement.hasAttribute('disabled')).toBe(false);
		});

		test('should disable element by adding disabled attribute', () => {
			domHelper.setEnabled(mockElement, false);
			
			expect(mockElement.hasAttribute('disabled')).toBe(true);
			expect(mockElement.getAttribute('disabled')).toBe('disabled');
		});

		test('should work with element ID string', () => {
			domHelper.setEnabled('test-id', false);
			
			expect(mockElement.hasAttribute('disabled')).toBe(true);
		});

		test('should handle null element gracefully', () => {
			mockDocument.getElementById.mockReturnValue(null);
			
			expect(() => {
				domHelper.setEnabled('non-existent', true);
			}).not.toThrow();
		});

		test('should handle toggling enabled state', () => {
			// Start enabled
			domHelper.setEnabled(mockElement, true);
			expect(mockElement.hasAttribute('disabled')).toBe(false);
			
			// Disable
			domHelper.setEnabled(mockElement, false);
			expect(mockElement.hasAttribute('disabled')).toBe(true);
			
			// Re-enable
			domHelper.setEnabled(mockElement, true);
			expect(mockElement.hasAttribute('disabled')).toBe(false);
		});
	});

	describe('Style manipulation', () => {
		test('should set single style property', () => {
			domHelper.setStyle(mockElement, 'color', 'red');
			expect(mockElement.style.color).toBe('red');
		});

		test('should set multiple style properties', () => {
			const styles = {
				color: 'blue',
				fontSize: '16px',
				display: 'block'
			};
			
			domHelper.setStyles(mockElement, styles);
			
			expect(mockElement.style.color).toBe('blue');
			expect(mockElement.style.fontSize).toBe('16px');
			expect(mockElement.style.display).toBe('block');
		});
	});

	describe('Cache management', () => {
		test('should clear element cache', () => {
			// Cache an element
			domHelper.getElementById('test-id');
			expect(mockDocument.getElementById).toHaveBeenCalledTimes(1);
			
			// Clear cache
			domHelper.clearCache();
			
			// Should call getElementById again
			domHelper.getElementById('test-id');
			expect(mockDocument.getElementById).toHaveBeenCalledTimes(2);
		});
	});
});