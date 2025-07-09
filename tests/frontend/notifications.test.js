/**
 * Frontend Tests for Notification System
 * - Tests UI notification management
 * - Tests different notification types
 * - Tests Slovak language messages
 * - Tests timing and cleanup
 * - Uses JSDOM environment for DOM simulation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NotificationManager } from '../../public/shared/notifications.js';

describe('Notification System Frontend Tests', () => {
  let notificationManager;
  let messageBox;

  beforeEach(() => {
    // Setup DOM with message box
    document.body.innerHTML = `
      <div id="messageBox"></div>
      <div id="customMessageBox"></div>
    `;
    
    messageBox = document.getElementById('messageBox');
    notificationManager = new NotificationManager('messageBox');
    
    // Mock console.warn to avoid noise in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
    
    // Clear any timers
    jest.clearAllTimers();
    
    // Restore console.warn
    console.warn.mockRestore();
  });

  describe('Initialization and Setup', () => {
    test('should initialize with default message box ID', () => {
      const manager = new NotificationManager();
      expect(manager.messageBoxId).toBe('messageBox');
    });

    test('should initialize with custom message box ID', () => {
      const manager = new NotificationManager('customMessageBox');
      expect(manager.messageBoxId).toBe('customMessageBox');
    });

    test('should find message box element correctly', () => {
      const foundBox = notificationManager.getMessageBox();
      expect(foundBox).toBe(messageBox);
    });

    test('should handle missing message box gracefully', () => {
      const manager = new NotificationManager('nonExistentBox');
      const foundBox = manager.getMessageBox();
      
      expect(foundBox).toBeNull();
      expect(console.warn).toHaveBeenCalledWith("Message box with ID 'nonExistentBox' not found");
    });
  });

  describe('Basic Notification Display', () => {
    test('should display info notification correctly', () => {
      const message = 'This is an info message';
      
      notificationManager.showNotification(message, 'info');
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should display error notification correctly', () => {
      const message = 'This is an error message';
      
      notificationManager.showNotification(message, 'error');
      
      const notification = messageBox.querySelector('.error');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should display success notification correctly', () => {
      const message = 'This is a success message';
      
      notificationManager.showNotification(message, 'success');
      
      const notification = messageBox.querySelector('.success');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should display warning notification correctly', () => {
      const message = 'This is a warning message';
      
      notificationManager.showNotification(message, 'warning');
      
      const notification = messageBox.querySelector('.warning');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should default to info type when no type specified', () => {
      const message = 'Default message';
      
      notificationManager.showNotification(message);
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });
  });

  describe('Convenience Methods', () => {
    test('should show error using convenience method', () => {
      const message = 'Error message';
      
      notificationManager.showError(message);
      
      const notification = messageBox.querySelector('.error');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should show info using convenience method', () => {
      const message = 'Info message';
      
      notificationManager.showInfo(message);
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should show success using convenience method', () => {
      const message = 'Success message';
      
      notificationManager.showSuccess(message);
      
      const notification = messageBox.querySelector('.success');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });

    test('should show warning using convenience method', () => {
      const message = 'Warning message';
      
      notificationManager.showWarning(message);
      
      const notification = messageBox.querySelector('.warning');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(message);
    });
  });

  describe('Slovak Language Support', () => {
    test('should display Slovak error messages correctly', () => {
      const slovakErrors = [
        'Chyba pri pripájaní do hry',
        'Hra s týmto PIN kódom neexistuje',
        'Neplatné prihlásenie moderátora',
        'Nastala chyba pri pripájaní'
      ];
      
      slovakErrors.forEach(message => {
        notificationManager.showError(message);
        
        const notification = messageBox.querySelector('.error');
        expect(notification).toBeTruthy();
        expect(notification.textContent).toBe(message);
        
        // Clear for next test
        notificationManager.clearAll();
      });
    });

    test('should display Slovak success messages correctly', () => {
      const slovakSuccess = [
        'Úspešne ste sa pripojili do hry',
        'Hra bola úspešne vytvorená',
        'Správne! Získali ste 1500 bodov',
        'Pripojenie obnovené'
      ];
      
      slovakSuccess.forEach(message => {
        notificationManager.showSuccess(message);
        
        const notification = messageBox.querySelector('.success');
        expect(notification).toBeTruthy();
        expect(notification.textContent).toBe(message);
        
        // Clear for next test
        notificationManager.clearAll();
      });
    });

    test('should handle Slovak special characters correctly', () => {
      const messageWithSpecialChars = 'Hráč č. 1 má najvyšší skóre!';
      
      notificationManager.showInfo(messageWithSpecialChars);
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(messageWithSpecialChars);
    });

    test('should handle Slovak diacritics correctly', () => {
      const diacriticMessage = 'Ďakujeme za účasť v súťaži!';
      
      notificationManager.showInfo(diacriticMessage);
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(diacriticMessage);
    });
  });

  describe('Timing and Auto-removal', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should auto-remove notification after default duration', () => {
      const message = 'Auto-remove test';
      
      notificationManager.showNotification(message);
      
      // Should be present initially
      expect(messageBox.querySelector('.info')).toBeTruthy();
      
      // Fast-forward time
      jest.advanceTimersByTime(3000);
      
      // Should be removed
      expect(messageBox.querySelector('.info')).toBeNull();
    });

    test('should auto-remove notification after custom duration', () => {
      const message = 'Custom duration test';
      
      notificationManager.showNotification(message, 'info', 5000);
      
      // Should be present initially
      expect(messageBox.querySelector('.info')).toBeTruthy();
      
      // Fast-forward time (less than custom duration)
      jest.advanceTimersByTime(3000);
      
      // Should still be present
      expect(messageBox.querySelector('.info')).toBeTruthy();
      
      // Fast-forward more time
      jest.advanceTimersByTime(2000);
      
      // Should be removed
      expect(messageBox.querySelector('.info')).toBeNull();
    });

    test('should handle multiple notifications with different durations', () => {
      notificationManager.showNotification('Short message', 'info', 1000);
      notificationManager.showNotification('Long message', 'warning', 5000);
      
      // Both should be present initially
      expect(messageBox.querySelectorAll('.info')).toHaveLength(1);
      expect(messageBox.querySelectorAll('.warning')).toHaveLength(1);
      
      // Fast-forward 1 second
      jest.advanceTimersByTime(1000);
      
      // Short message should be removed
      expect(messageBox.querySelectorAll('.info')).toHaveLength(0);
      expect(messageBox.querySelectorAll('.warning')).toHaveLength(1);
      
      // Fast-forward 4 more seconds
      jest.advanceTimersByTime(4000);
      
      // Long message should also be removed
      expect(messageBox.querySelectorAll('.warning')).toHaveLength(0);
    });
  });

  describe('Multiple Notifications', () => {
    test('should display multiple notifications simultaneously', () => {
      notificationManager.showError('Error 1');
      notificationManager.showError('Error 2');
      notificationManager.showInfo('Info 1');
      
      expect(messageBox.querySelectorAll('.error')).toHaveLength(2);
      expect(messageBox.querySelectorAll('.info')).toHaveLength(1);
      expect(messageBox.children).toHaveLength(3);
    });

    test('should maintain order of notifications', () => {
      notificationManager.showError('First');
      notificationManager.showInfo('Second');
      notificationManager.showSuccess('Third');
      
      const notifications = messageBox.children;
      expect(notifications[0].textContent).toBe('First');
      expect(notifications[1].textContent).toBe('Second');
      expect(notifications[2].textContent).toBe('Third');
    });

    test('should handle rapid succession of notifications', () => {
      const messages = [];
      for (let i = 0; i < 10; i++) {
        const message = `Message ${i}`;
        messages.push(message);
        notificationManager.showInfo(message);
      }
      
      expect(messageBox.children).toHaveLength(10);
      
      // Verify all messages are present
      messages.forEach((message, index) => {
        expect(messageBox.children[index].textContent).toBe(message);
      });
    });
  });

  describe('Clear All Functionality', () => {
    test('should clear all notifications', () => {
      notificationManager.showError('Error');
      notificationManager.showInfo('Info');
      notificationManager.showSuccess('Success');
      
      expect(messageBox.children).toHaveLength(3);
      
      notificationManager.clearAll();
      
      expect(messageBox.children).toHaveLength(0);
      expect(messageBox.innerHTML).toBe('');
    });

    test('should handle clearing empty message box', () => {
      expect(() => {
        notificationManager.clearAll();
      }).not.toThrow();
      
      expect(messageBox.innerHTML).toBe('');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing message box gracefully', () => {
      const manager = new NotificationManager('nonExistentBox');
      
      expect(() => {
        manager.showError('Test error');
        manager.showInfo('Test info');
        manager.clearAll();
      }).not.toThrow();
    });

    test('should handle null and undefined messages', () => {
      expect(() => {
        notificationManager.showNotification(null);
        notificationManager.showNotification(undefined);
      }).not.toThrow();
    });

    test('should handle empty messages', () => {
      notificationManager.showNotification('');
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe('');
    });

    test('should handle very long messages', () => {
      const longMessage = 'a'.repeat(1000);
      
      notificationManager.showInfo(longMessage);
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(longMessage);
    });

    test('should handle special HTML characters safely', () => {
      const messageWithHTML = '<script>alert("xss")</script>Safe message';
      
      notificationManager.showInfo(messageWithHTML);
      
      const notification = messageBox.querySelector('.info');
      expect(notification).toBeTruthy();
      expect(notification.textContent).toBe(messageWithHTML);
      expect(notification.innerHTML).not.toContain('<script>');
    });
  });

  describe('Performance and Memory Management', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should handle many notifications efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        notificationManager.showInfo(`Message ${i}`);
      }
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000);
      
      expect(messageBox.children).toHaveLength(100);
    });

    test('should clean up timers properly', () => {
      // Show notifications
      for (let i = 0; i < 10; i++) {
        notificationManager.showInfo(`Message ${i}`, 'info', 1000);
      }
      
      expect(messageBox.children).toHaveLength(10);
      
      // Clear all notifications
      notificationManager.clearAll();
      
      // Fast-forward time
      jest.advanceTimersByTime(2000);
      
      // Should remain empty (no stale timers)
      expect(messageBox.children).toHaveLength(0);
    });

    test('should handle memory cleanup with auto-removal', () => {
      // Show many notifications with short duration
      for (let i = 0; i < 50; i++) {
        notificationManager.showInfo(`Message ${i}`, 'info', 100);
      }
      
      expect(messageBox.children).toHaveLength(50);
      
      // Wait for auto-removal
      jest.advanceTimersByTime(200);
      
      // All should be removed
      expect(messageBox.children).toHaveLength(0);
    });
  });

  describe('Real-world Usage Scenarios', () => {
    test('should handle game connection errors', () => {
      const connectionErrors = [
        'Chyba pri pripájaní do hry',
        'Spojenie bolo prerušené',
        'Server neodpovedá',
        'Neplatný PIN kód'
      ];
      
      connectionErrors.forEach(error => {
        notificationManager.showError(error);
      });
      
      expect(messageBox.querySelectorAll('.error')).toHaveLength(4);
      
      // Clear all errors
      notificationManager.clearAll();
      
      // Show success after reconnection
      notificationManager.showSuccess('Pripojenie obnovené');
      
      expect(messageBox.querySelectorAll('.success')).toHaveLength(1);
      expect(messageBox.querySelectorAll('.error')).toHaveLength(0);
    });

    test('should handle game progress notifications', () => {
      // Game start
      notificationManager.showInfo('Hra sa začína...');
      
      // Question notifications
      notificationManager.showInfo('Otázka č. 1');
      notificationManager.showSuccess('Správne!');
      
      // Clear previous notifications
      notificationManager.clearAll();
      
      // Next question
      notificationManager.showInfo('Otázka č. 2');
      
      expect(messageBox.children).toHaveLength(1);
      expect(messageBox.children[0].textContent).toBe('Otázka č. 2');
    });

    test('should handle validation errors', () => {
      const validationErrors = [
        'PIN kód musí obsahovať presne 6 čísel',
        'Heslo moderátora musí mať minimálne 6 znakov',
        'Neplatné dáta',
        'Pole nemôže byť prázdne'
      ];
      
      validationErrors.forEach(error => {
        notificationManager.showError(error);
      });
      
      expect(messageBox.querySelectorAll('.error')).toHaveLength(4);
      
      // Verify Slovak error messages are displayed correctly
      const errorElements = messageBox.querySelectorAll('.error');
      validationErrors.forEach((error, index) => {
        expect(errorElements[index].textContent).toBe(error);
      });
    });
  });

  describe('Integration with Default Instance', () => {
    test('should work with default export functions', async () => {
      // Import default functions
      const { showError, showInfo, showSuccess, showWarning } = await import('../../public/shared/notifications.js');
      
      // Test default functions
      showError('Default error');
      showInfo('Default info');
      showSuccess('Default success');
      showWarning('Default warning');
      
      // Should all appear in the default message box
      expect(messageBox.querySelectorAll('.error')).toHaveLength(1);
      expect(messageBox.querySelectorAll('.info')).toHaveLength(1);
      expect(messageBox.querySelectorAll('.success')).toHaveLength(1);
      expect(messageBox.querySelectorAll('.warning')).toHaveLength(1);
    });
  });
});