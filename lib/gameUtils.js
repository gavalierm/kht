/**
 * Game utility functions extracted from server.js
 * Contains PIN generation, question loading, and other game helpers
 */

const path = require('path');
const fs = require('fs');

/**
 * Generate a unique game PIN
 * @param {string|null} customPin - Optional custom PIN to validate
 * @param {Map} activeGames - Map of currently active games to check against
 * @returns {string|null} - Generated PIN or null if custom PIN is taken
 */
function generateGamePin(customPin = null, activeGames = new Map()) {
  if (customPin) {
    // Check if custom PIN is already used
    if (activeGames.has(customPin)) {
      return null; // PIN already exists
    }
    return customPin;
  }
  
  // Generate random 6-digit PIN
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (activeGames.has(pin));
  return pin;
}

/**
 * Load questions from JSON file (async)
 * @param {string} category - Question category to load (default: 'general')
 * @returns {Promise<Object>} - Promise resolving to question data object
 */
async function loadQuestions(category = 'general') {
  try {
    const questionsPath = path.join(__dirname, '..', 'questions', `${category}.json`);
    const data = await fs.promises.readFile(questionsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading questions:', error);
    // Fallback questions
    return {
      quiz: {
        title: "Testovacé otázky",
        questions: [
          {
            id: 1,
            question: "Aké je hlavné mesto Slovenska?",
            options: ["Bratislava", "Košice", "Prešov", "Žilina"],
            correct: 0,
            timeLimit: 30
          },
          {
            id: 2,
            question: "Koľko kontinentov má Zem?",
            options: ["5", "6", "7", "8"],
            correct: 2,
            timeLimit: 25
          }
        ]
      }
    };
  }
}

module.exports = {
  generateGamePin,
  loadQuestions
};