const GLOBAL_PIN = (window.location.pathname.split('/')[2]?.trim() || undefined);

console.log('PIN:', GLOBAL_PIN);