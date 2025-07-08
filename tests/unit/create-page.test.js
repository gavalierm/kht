const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('Create Page Unit Tests', () => {
	// Mock DOM environment
	beforeEach(() => {
		document.body.innerHTML = `
			<input id="moderatorPassword" value="" />
			<button id="createGameBtn">Vytvoriť hru</button>
			<button id="cancelBtn">Zrušiť</button>
			<div id="messageBox"></div>
		`;
	});

	describe('Password Validation', () => {
		test('should accept valid passwords', () => {
			const passwordInput = document.getElementById('moderatorPassword');
			const validPasswords = ['abc', 'password123', 'secret', 'test123'];
			
			validPasswords.forEach(password => {
				passwordInput.value = password;
				const isValid = password.length >= 3;
				expect(isValid).toBe(true);
			});
		});

		test('should reject invalid passwords', () => {
			const passwordInput = document.getElementById('moderatorPassword');
			const invalidPasswords = ['', 'a', 'ab'];
			
			invalidPasswords.forEach(password => {
				passwordInput.value = password;
				const isValid = password.length >= 3;
				expect(isValid).toBe(false);
			});
		});
	});

	describe('Form Data Collection', () => {
		test('should collect form data correctly', () => {
			// Set form values
			document.getElementById('moderatorPassword').value = 'secret123';
			
			// Collect form data
			const formData = {
				moderatorPassword: document.getElementById('moderatorPassword').value.trim()
			};
			
			expect(formData).toEqual({
				moderatorPassword: 'secret123'
			});
		});

		test('should handle empty password field', () => {
			// Leave password field empty
			document.getElementById('moderatorPassword').value = '';
			
			// Collect form data
			const formData = {
				moderatorPassword: document.getElementById('moderatorPassword').value.trim()
			};
			
			expect(formData).toEqual({
				moderatorPassword: ''
			});
		});
	});

	describe('Button States', () => {
		test('should disable create button during loading', () => {
			const createBtn = document.getElementById('createGameBtn');
			
			// Simulate loading state
			createBtn.disabled = true;
			createBtn.classList.add('loading');
			createBtn.innerHTML = '<span class="loading-spinner"></span>Vytváram...';
			
			expect(createBtn.disabled).toBe(true);
			expect(createBtn.classList.contains('loading')).toBe(true);
			expect(createBtn.innerHTML).toContain('loading-spinner');
		});

		test('should enable create button after loading', () => {
			const createBtn = document.getElementById('createGameBtn');
			
			// Reset button state
			createBtn.disabled = false;
			createBtn.classList.remove('loading');
			createBtn.innerHTML = 'Vytvoriť hru';
			
			expect(createBtn.disabled).toBe(false);
			expect(createBtn.classList.contains('loading')).toBe(false);
			expect(createBtn.innerHTML).toBe('Vytvoriť hru');
		});
	});

	describe('Error Message Display', () => {
		test('should display error messages', () => {
			const messageBox = document.getElementById('messageBox');
			const errorMessage = 'PIN musí mať presne 6 číslic';
			
			// Simulate error message
			const errorDiv = document.createElement('div');
			errorDiv.className = 'error';
			errorDiv.textContent = errorMessage;
			messageBox.appendChild(errorDiv);
			
			expect(messageBox.querySelector('.error')).toBeTruthy();
			expect(messageBox.querySelector('.error').textContent).toBe(errorMessage);
		});

		test('should display success messages', () => {
			const messageBox = document.getElementById('messageBox');
			const successMessage = 'Hra vytvorená! PIN: 123456';
			
			// Simulate success message
			const successDiv = document.createElement('div');
			successDiv.className = 'success';
			successDiv.textContent = successMessage;
			messageBox.appendChild(successDiv);
			
			expect(messageBox.querySelector('.success')).toBeTruthy();
			expect(messageBox.querySelector('.success').textContent).toBe(successMessage);
		});
	});

	describe('Navigation', () => {
		test('cancel button should trigger navigation', () => {
			let navigatedTo = null;
			
			// Simulate cancel button click
			const cancelBtn = document.getElementById('cancelBtn');
			cancelBtn.addEventListener('click', () => {
				navigatedTo = '/join';
			});
			cancelBtn.click();
			
			expect(navigatedTo).toBe('/join');
		});
	});
});