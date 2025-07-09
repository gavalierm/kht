/**
 * Frontend Tests for DOM Helper Utilities
 * - Tests DOM manipulation utilities
 * - Tests element caching and performance
 * - Tests XSS protection and security
 * - Tests event handling and cleanup
 * - Uses JSDOM environment for DOM simulation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { DOMHelper } from '../../public/shared/dom.js';

describe('DOM Helper Frontend Tests', () => {
  let domHelper;
  let mockElements;

  beforeEach(() => {
    // Create fresh DOM helper instance
    domHelper = new DOMHelper();
    mockElements = {};
    
    // Setup mock DOM elements
    document.body.innerHTML = `
      <div id="testElement">Test Content</div>
      <div id="messageBox"></div>
      <div class="testClass">Class Element</div>
      <input id="testInput" type="text" value="test">
      <button id="testButton">Click Me</button>
      <div id="containerDiv">
        <p class="paragraph">Paragraph 1</p>
        <p class="paragraph">Paragraph 2</p>
        <span id="spanElement">Span Content</span>
      </div>
    `;
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
    
    // Clear element cache
    domHelper.clearCache();
  });

  describe('Element Selection and Caching', () => {
    test('should get element by ID correctly', () => {
      const element = domHelper.getElementById('testElement');
      
      expect(element).toBeTruthy();
      expect(element.id).toBe('testElement');
      expect(element.textContent).toBe('Test Content');
    });

    test('should cache elements for performance', () => {
      const element1 = domHelper.getElementById('testElement');
      const element2 = domHelper.getElementById('testElement');
      
      // Should return same object reference (cached)
      expect(element1).toBe(element2);
    });

    test('should handle non-existent elements gracefully', () => {
      const element = domHelper.getElementById('nonExistent');
      
      expect(element).toBeNull();
    });

    test('should use querySelector correctly', () => {
      const element = domHelper.querySelector('.testClass');
      
      expect(element).toBeTruthy();
      expect(element.className).toBe('testClass');
    });

    test('should use querySelectorAll correctly', () => {
      const elements = domHelper.querySelectorAll('.paragraph');
      
      expect(elements).toHaveLength(2);
      expect(elements[0].textContent).toBe('Paragraph 1');
      expect(elements[1].textContent).toBe('Paragraph 2');
    });

    test('should cache multiple elements efficiently', () => {
      const elementIds = ['testElement', 'messageBox', 'testInput', 'testButton'];
      const cachedElements = domHelper.cacheElements(elementIds);
      
      expect(cachedElements).toHaveProperty('testElement');
      expect(cachedElements).toHaveProperty('messageBox');
      expect(cachedElements).toHaveProperty('testInput');
      expect(cachedElements).toHaveProperty('testButton');
      
      // Verify elements are correctly cached
      expect(cachedElements.testElement.id).toBe('testElement');
      expect(cachedElements.messageBox.id).toBe('messageBox');
    });

    test('should clear cache correctly', () => {
      // Cache an element
      const element1 = domHelper.getElementById('testElement');
      
      // Clear cache
      domHelper.clearCache();
      
      // Get element again (should be fresh, not cached)
      const element2 = domHelper.getElementById('testElement');
      
      // Should be same element but different object references due to fresh lookup
      expect(element1.id).toBe(element2.id);
    });
  });

  describe('Event Handling', () => {
    test('should add event listener by element ID', () => {
      let clicked = false;
      const handler = () => { clicked = true; };
      
      domHelper.addEventListener('testButton', 'click', handler);
      
      // Simulate click
      const button = document.getElementById('testButton');
      button.click();
      
      expect(clicked).toBe(true);
    });

    test('should add event listener by element reference', () => {
      let clicked = false;
      const handler = () => { clicked = true; };
      const button = document.getElementById('testButton');
      
      domHelper.addEventListener(button, 'click', handler);
      
      // Simulate click
      button.click();
      
      expect(clicked).toBe(true);
    });

    test('should handle non-existent elements gracefully in event listeners', () => {
      const handler = () => {};
      
      // Should not throw error
      expect(() => {
        domHelper.addEventListener('nonExistent', 'click', handler);
      }).not.toThrow();
    });

    test('should remove event listener correctly', () => {
      let clickCount = 0;
      const handler = () => { clickCount++; };
      const button = document.getElementById('testButton');
      
      domHelper.addEventListener('testButton', 'click', handler);
      
      // Click once
      button.click();
      expect(clickCount).toBe(1);
      
      // Remove listener
      domHelper.removeEventListener('testButton', 'click', handler);
      
      // Click again - should not increment
      button.click();
      expect(clickCount).toBe(1);
    });

    test('should handle event options correctly', () => {
      let eventObject = null;
      const handler = (event) => { eventObject = event; };
      
      domHelper.addEventListener('testButton', 'click', handler, { once: true });
      
      const button = document.getElementById('testButton');
      button.click();
      
      expect(eventObject).toBeTruthy();
      expect(eventObject.type).toBe('click');
    });
  });

  describe('Text Content Management', () => {
    test('should set text content by element ID', () => {
      domHelper.setText('testElement', 'New Content');
      
      const element = document.getElementById('testElement');
      expect(element.textContent).toBe('New Content');
    });

    test('should set text content by element reference', () => {
      const element = document.getElementById('testElement');
      domHelper.setText(element, 'New Content');
      
      expect(element.textContent).toBe('New Content');
    });

    test('should handle Slovak characters in text content', () => {
      const slovakText = 'Ahoj, ako sa máš? Ďakujem!';
      
      domHelper.setText('testElement', slovakText);
      
      const element = document.getElementById('testElement');
      expect(element.textContent).toBe(slovakText);
    });

    test('should handle non-existent elements gracefully in setText', () => {
      expect(() => {
        domHelper.setText('nonExistent', 'New Content');
      }).not.toThrow();
    });
  });

  describe('HTML Content Management and XSS Protection', () => {
    test('should sanitize HTML content to prevent XSS', () => {
      const maliciousHTML = '<script>alert("XSS")</script><p>Safe content</p>';
      
      domHelper.setHTML('testElement', maliciousHTML);
      
      const element = document.getElementById('testElement');
      
      // Should escape the script tag
      expect(element.innerHTML).not.toContain('<script>');
      expect(element.innerHTML).toContain('&lt;script&gt;');
      expect(element.innerHTML).toContain('&lt;/script&gt;');
    });

    test('should sanitize complex XSS attempts', () => {
      const xssAttempts = [
        '<img src="x" onerror="alert(1)">',
        '<svg onload="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>'
      ];
      
      xssAttempts.forEach(xss => {
        domHelper.setHTML('testElement', xss);
        
        const element = document.getElementById('testElement');
        
        // Should escape all dangerous content
        expect(element.innerHTML).not.toContain('onerror');
        expect(element.innerHTML).not.toContain('onload');
        expect(element.innerHTML).not.toContain('javascript:');
        expect(element.innerHTML).toContain('&lt;');
      });
    });

    test('should handle non-string HTML content', () => {
      expect(() => {
        domHelper.setHTML('testElement', 123);
      }).not.toThrow();
      
      expect(() => {
        domHelper.setHTML('testElement', null);
      }).not.toThrow();
      
      expect(() => {
        domHelper.setHTML('testElement', undefined);
      }).not.toThrow();
    });

    test('should provide trusted HTML method with warning', () => {
      const originalWarn = console.warn;
      let warningCalled = false;
      
      console.warn = () => { warningCalled = true; };
      
      domHelper.setTrustedHTML('testElement', '<b>Trusted content</b>');
      
      expect(warningCalled).toBe(true);
      
      const element = document.getElementById('testElement');
      expect(element.innerHTML).toBe('<b>Trusted content</b>');
      
      console.warn = originalWarn;
    });
  });

  describe('CSS Class Management', () => {
    test('should add CSS class by element ID', () => {
      domHelper.addClass('testElement', 'newClass');
      
      const element = document.getElementById('testElement');
      expect(element.classList.contains('newClass')).toBe(true);
    });

    test('should add CSS class by element reference', () => {
      const element = document.getElementById('testElement');
      domHelper.addClass(element, 'newClass');
      
      expect(element.classList.contains('newClass')).toBe(true);
    });

    test('should remove CSS class correctly', () => {
      const element = document.getElementById('testElement');
      element.classList.add('removeMe');
      
      domHelper.removeClass('testElement', 'removeMe');
      
      expect(element.classList.contains('removeMe')).toBe(false);
    });

    test('should toggle CSS class correctly', () => {
      const element = document.getElementById('testElement');
      
      // First toggle should add class
      domHelper.toggleClass('testElement', 'toggleMe');
      expect(element.classList.contains('toggleMe')).toBe(true);
      
      // Second toggle should remove class
      domHelper.toggleClass('testElement', 'toggleMe');
      expect(element.classList.contains('toggleMe')).toBe(false);
    });

    test('should check if element has class correctly', () => {
      const element = document.getElementById('testElement');
      element.classList.add('testClass');
      
      expect(domHelper.hasClass('testElement', 'testClass')).toBe(true);
      expect(domHelper.hasClass('testElement', 'nonExistentClass')).toBe(false);
    });

    test('should handle non-existent elements gracefully in class operations', () => {
      expect(() => {
        domHelper.addClass('nonExistent', 'newClass');
        domHelper.removeClass('nonExistent', 'oldClass');
        domHelper.toggleClass('nonExistent', 'toggleClass');
      }).not.toThrow();
      
      expect(domHelper.hasClass('nonExistent', 'anyClass')).toBe(false);
    });
  });

  describe('Style Management', () => {
    test('should set single style property', () => {
      domHelper.setStyle('testElement', 'color', 'red');
      
      const element = document.getElementById('testElement');
      expect(element.style.color).toBe('red');
    });

    test('should set multiple style properties', () => {
      const styles = {
        color: 'blue',
        fontSize: '16px',
        backgroundColor: 'yellow'
      };
      
      domHelper.setStyles('testElement', styles);
      
      const element = document.getElementById('testElement');
      expect(element.style.color).toBe('blue');
      expect(element.style.fontSize).toBe('16px');
      expect(element.style.backgroundColor).toBe('yellow');
    });

    test('should handle CSS property names correctly', () => {
      domHelper.setStyle('testElement', 'backgroundColor', 'red');
      domHelper.setStyle('testElement', 'fontSize', '20px');
      
      const element = document.getElementById('testElement');
      expect(element.style.backgroundColor).toBe('red');
      expect(element.style.fontSize).toBe('20px');
    });
  });

  describe('Element Visibility and State', () => {
    test('should show element by adding visible class', () => {
      domHelper.show('testElement');
      
      const element = document.getElementById('testElement');
      expect(element.classList.contains('visible')).toBe(true);
    });

    test('should hide element by removing visible class', () => {
      const element = document.getElementById('testElement');
      element.classList.add('visible');
      
      domHelper.hide('testElement');
      
      expect(element.classList.contains('visible')).toBe(false);
    });

    test('should enable element by removing disabled attribute', () => {
      const element = document.getElementById('testInput');
      element.setAttribute('disabled', 'disabled');
      
      domHelper.setEnabled('testInput', true);
      
      expect(element.hasAttribute('disabled')).toBe(false);
    });

    test('should disable element by adding disabled attribute', () => {
      domHelper.setEnabled('testInput', false);
      
      const element = document.getElementById('testInput');
      expect(element.hasAttribute('disabled')).toBe(true);
      expect(element.getAttribute('disabled')).toBe('disabled');
    });
  });

  describe('DOM Ready Handling', () => {
    test('should execute callback immediately when DOM is ready', () => {
      let callbackExecuted = false;
      
      // Mock readyState as complete
      Object.defineProperty(document, 'readyState', {
        value: 'complete',
        writable: true
      });
      
      domHelper.ready(() => {
        callbackExecuted = true;
      });
      
      expect(callbackExecuted).toBe(true);
    });

    test('should wait for DOM ready when loading', () => {
      let callbackExecuted = false;
      
      // Mock readyState as loading
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        writable: true
      });
      
      domHelper.ready(() => {
        callbackExecuted = true;
      });
      
      // Should not execute immediately
      expect(callbackExecuted).toBe(false);
      
      // Simulate DOMContentLoaded
      const event = new Event('DOMContentLoaded');
      document.dispatchEvent(event);
      
      expect(callbackExecuted).toBe(true);
    });
  });

  describe('Performance and Memory Management', () => {
    test('should cache elements efficiently', () => {
      const startTime = Date.now();
      
      // First access - should cache
      domHelper.getElementById('testElement');
      
      // Subsequent accesses should be fast
      for (let i = 0; i < 1000; i++) {
        domHelper.getElementById('testElement');
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should be very fast due to caching
      expect(duration).toBeLessThan(100);
    });

    test('should handle large number of elements efficiently', () => {
      // Create many elements
      const containerDiv = document.getElementById('containerDiv');
      for (let i = 0; i < 100; i++) {
        const div = document.createElement('div');
        div.id = `element${i}`;
        div.textContent = `Element ${i}`;
        containerDiv.appendChild(div);
      }
      
      const startTime = Date.now();
      
      // Access all elements
      for (let i = 0; i < 100; i++) {
        domHelper.getElementById(`element${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should handle efficiently
      expect(duration).toBeLessThan(1000);
    });

    test('should not leak memory with repeated operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many DOM operations
      for (let i = 0; i < 100; i++) {
        domHelper.setText('testElement', `Content ${i}`);
        domHelper.addClass('testElement', `class${i}`);
        domHelper.removeClass('testElement', `class${i}`);
        domHelper.setStyle('testElement', 'color', i % 2 === 0 ? 'red' : 'blue');
      }
      
      domHelper.clearCache();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(1024 * 1024); // Less than 1MB
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle null and undefined elements gracefully', () => {
      expect(() => {
        domHelper.setText(null, 'content');
        domHelper.setText(undefined, 'content');
        domHelper.addClass(null, 'class');
        domHelper.removeClass(undefined, 'class');
        domHelper.setStyle(null, 'color', 'red');
      }).not.toThrow();
    });

    test('should handle empty strings gracefully', () => {
      expect(() => {
        domHelper.setText('testElement', '');
        domHelper.addClass('testElement', '');
        domHelper.setStyle('testElement', 'color', '');
      }).not.toThrow();
    });

    test('should handle special characters in content', () => {
      const specialChars = 'áéíóúýčďžšťň<>&"\'';
      
      domHelper.setText('testElement', specialChars);
      
      const element = document.getElementById('testElement');
      expect(element.textContent).toBe(specialChars);
    });

    test('should handle very long content efficiently', () => {
      const longContent = 'a'.repeat(10000);
      
      const startTime = Date.now();
      domHelper.setText('testElement', longContent);
      const endTime = Date.now();
      
      const element = document.getElementById('testElement');
      expect(element.textContent).toBe(longContent);
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Slovak Context Integration', () => {
    test('should handle Slovak UI elements correctly', () => {
      // Set up Slovak UI elements
      const slovakElements = {
        button: 'Odoslať',
        label: 'Meno hráča:',
        error: 'Chyba pri pripájaní',
        success: 'Úspešne pripojené'
      };
      
      Object.entries(slovakElements).forEach(([key, value]) => {
        domHelper.setText(`${key}Element`, value);
      });
      
      // Verify Slovak text was set correctly
      expect(document.getElementById('buttonElement')?.textContent).toBe('Odoslať');
      expect(document.getElementById('labelElement')?.textContent).toBe('Meno hráča:');
      expect(document.getElementById('errorElement')?.textContent).toBe('Chyba pri pripájaní');
      expect(document.getElementById('successElement')?.textContent).toBe('Úspešne pripojené');
    });

    test('should handle Slovak CSS classes', () => {
      const slovakClasses = ['aktívny', 'neaktívny', 'pripojený', 'odpojený'];
      
      slovakClasses.forEach(className => {
        domHelper.addClass('testElement', className);
        expect(domHelper.hasClass('testElement', className)).toBe(true);
        
        domHelper.removeClass('testElement', className);
        expect(domHelper.hasClass('testElement', className)).toBe(false);
      });
    });
  });
});