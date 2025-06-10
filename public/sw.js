// Service Worker for Quiz App PWA
const CACHE_NAME = 'quiz-app-v2'; // Updated version
const urlsToCache = [
  '/',
  '/dashboard',
  '/panel',
  '/style.css',
  '/app.js',
  '/dashboard.js',
  '/panel.js',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Force activation of new SW
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip caching for socket.io and API requests
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('/api/')) {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all clients
});