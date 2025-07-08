/**
 * Simple navigation utilities - no complex routing
 */

// Simple redirect function
export function redirectTo(path) {
  window.location.href = path;
}

// Game flow redirects
export function redirectToGameCreation() {
  redirectTo('/app/dashboard');
}

export function redirectToGameControl(pin) {
  redirectTo(`/app/${pin}/control`);
}

export function redirectToGame(pin) {
  redirectTo(`/app/${pin}/game`);
}

export function redirectToPanel(pin) {
  redirectTo(`/app/${pin}/panel`);
}

export function redirectToStage(pin) {
  redirectTo(`/app/${pin}/stage`);
}

// Extract PIN from current URL path
export function extractGamePin(path = window.location.pathname) {
  const match = path.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

// Get current path
export function getCurrentPath() {
  return window.location.pathname;
}