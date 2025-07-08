/**
 * DOM Helper Test Suite
 * Testing the DOM manipulation utility functions
 * @jest-environment jsdom
 */

import { DOMHelper } from '../../public/shared/dom.js';

describe('DOMHelper', () => {
	let domHelper;

	beforeEach(() => {
		// Create a clean DOM environment for each test
		document.body.innerHTML = '';
		domHelper = new DOMHelper();
	});

	describe('Element caching', () => {
		test('should cache elements by ID', () => {
			// Create a test element
			const testElement = document.createElement('div');
			testElement.id = 'test-element';
			document.body.appendChild(testElement);

			// First call should fetch and cache
			const element1 = domHelper.getElementById('test-element');
			expect(element1).toBe(testElement);

			// Second call should return cached element
			const element2 = domHelper.getElementById('test-element');
			expect(element2).toBe(element1);
			expect(element2).toBe(testElement);
		});

		test('should cache multiple elements', () => {
			// Create multiple test elements
			const element1 = document.createElement('div');
			element1.id = 'element1';
			const element2 = document.createElement('span');
			element2.id = 'element2';
			
			document.body.appendChild(element1);
			document.body.appendChild(element2);

			// Cache both elements
			const cached1 = domHelper.getElementById('element1');
			const cached2 = domHelper.getElementById('element2');

			expect(cached1).toBe(element1);
			expect(cached2).toBe(element2);
		});
	});

	describe('Text manipulation', () => {
		test('should set text content', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-text';
			document.body.appendChild(testElement);

			domHelper.setText(testElement, 'Hello World');
			expect(testElement.textContent).toBe('Hello World');
		});

		test('should set text content by element ID', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-text-id';
			document.body.appendChild(testElement);

			domHelper.setText('test-text-id', 'Hello by ID');
			expect(testElement.textContent).toBe('Hello by ID');
		});

		test('should handle null element gracefully', () => {
			expect(() => domHelper.setText(null, 'test')).not.toThrow();
			expect(() => domHelper.setText('non-existent-id', 'test')).not.toThrow();
		});
	});

	describe('CSS class manipulation', () => {
		test('should add CSS class', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-class';
			document.body.appendChild(testElement);

			domHelper.addClass(testElement, 'new-class');
			expect(testElement.classList.contains('new-class')).toBe(true);
		});

		test('should remove CSS class', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-class-remove';
			testElement.className = 'existing-class';
			document.body.appendChild(testElement);

			domHelper.removeClass(testElement, 'existing-class');
			expect(testElement.classList.contains('existing-class')).toBe(false);
		});

		test('should toggle CSS class', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-toggle';
			document.body.appendChild(testElement);

			// Toggle on
			domHelper.toggleClass(testElement, 'toggle-class');
			expect(testElement.classList.contains('toggle-class')).toBe(true);

			// Toggle off
			domHelper.toggleClass(testElement, 'toggle-class');
			expect(testElement.classList.contains('toggle-class')).toBe(false);
		});

		test('should check if element has class', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-has-class';
			testElement.className = 'existing-class';
			document.body.appendChild(testElement);

			expect(domHelper.hasClass(testElement, 'existing-class')).toBe(true);
			expect(domHelper.hasClass(testElement, 'non-existing-class')).toBe(false);
		});
	});

	describe('Element enable/disable functionality', () => {
		test('should enable element by removing disabled attribute', () => {
			const testElement = document.createElement('button');
			testElement.id = 'test-enable';
			testElement.disabled = true;
			document.body.appendChild(testElement);

			domHelper.enable(testElement);
			expect(testElement.disabled).toBe(false);
		});

		test('should disable element by adding disabled attribute', () => {
			const testElement = document.createElement('button');
			testElement.id = 'test-disable';
			document.body.appendChild(testElement);

			domHelper.disable(testElement);
			expect(testElement.disabled).toBe(true);
		});

		test('should work with element ID string', () => {
			const testElement = document.createElement('input');
			testElement.id = 'test-enable-id';
			document.body.appendChild(testElement);

			domHelper.disable('test-enable-id');
			expect(testElement.disabled).toBe(true);

			domHelper.enable('test-enable-id');
			expect(testElement.disabled).toBe(false);
		});

		test('should handle null element gracefully', () => {
			expect(() => domHelper.enable(null)).not.toThrow();
			expect(() => domHelper.disable(null)).not.toThrow();
		});

		test('should handle toggling enabled state', () => {
			const testElement = document.createElement('button');
			testElement.id = 'test-toggle-enabled';
			document.body.appendChild(testElement);

			// Initially enabled
			expect(testElement.disabled).toBe(false);

			domHelper.disable(testElement);
			expect(testElement.disabled).toBe(true);

			domHelper.enable(testElement);
			expect(testElement.disabled).toBe(false);
		});
	});

	describe('Style manipulation', () => {
		test('should set single style property', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-style';
			document.body.appendChild(testElement);

			domHelper.setStyle(testElement, 'color', 'red');
			expect(testElement.style.color).toBe('red');
		});

		test('should set multiple style properties', () => {
			const testElement = document.createElement('div');
			testElement.id = 'test-styles';
			document.body.appendChild(testElement);

			const styles = {
				color: 'blue',
				fontSize: '16px',
				display: 'block'
			};

			domHelper.setStyles(testElement, styles);
			expect(testElement.style.color).toBe('blue');
			expect(testElement.style.fontSize).toBe('16px');
			expect(testElement.style.display).toBe('block');
		});
	});

	describe('Cache management', () => {
		test('should clear element cache', () => {
			// Create and cache an element
			const testElement = document.createElement('div');
			testElement.id = 'test-cache-clear';
			document.body.appendChild(testElement);

			const cached = domHelper.getElementById('test-cache-clear');
			expect(cached).toBe(testElement);

			// Clear cache
			domHelper.clearCache();

			// Remove element from DOM
			testElement.remove();

			// Should return null after cache clear and element removal
			const afterClear = domHelper.getElementById('test-cache-clear');
			expect(afterClear).toBeNull();
		});
	});
});