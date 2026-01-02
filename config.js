/**
 * LinkedIn Auto Connect - Konfigurasi
 * dibuat oleh smalm
 */

'use strict';

const CONFIG = Object.freeze({
  version: '2.0.0',
  author: 'smalm',

  // === TIMING (FAST MODE) ===
  timing: Object.freeze({
    minTabDelay: 1200,          // Delay minimal antar tab (ms)
    maxTabDelay: 2500,          // Delay maksimal antar tab (ms)
    minClickDelay: 300,         // Delay minimal sebelum klik (ms)
    maxClickDelay: 800,         // Delay maksimal sebelum klik (ms)
    tabLoadTimeout: 12000,      // Timeout loading tab (ms)
    networkIdleTimeout: 500,    // Waktu tunggu network idle (ms)
    dwellTimeMin: 500,          // Waktu minimal di halaman (ms)
    dwellTimeMax: 1200,         // Waktu maksimal di halaman (ms)
  }),

  // === RATE LIMIT ===
  rateLimit: Object.freeze({
    maxPerSession: 100,
    maxPerHour: 100,
    windowSize: 3600000,
  }),

  // === RETRY ===
  retry: Object.freeze({
    maxAttempts: 2,
    baseDelay: 300,
    maxDelay: 3000,
    backoffMultiplier: 1.5,
  }),

  // === CIRCUIT BREAKER ===
  circuitBreaker: Object.freeze({
    failureThreshold: 15,       // Lebih toleran
    resetTimeout: 20000,        // Reset lebih cepat
    halfOpenAttempts: 2,
  }),

  // === SELECTOR ===
  selectors: Object.freeze({
    connectButton: Object.freeze([
      'button[aria-label*="connect" i]',
      'button[aria-label*="invite" i]',
    ]),
    connectButtonText: Object.freeze(['Connect', 'Hubungkan', 'Conectar']),
    sendButton: Object.freeze([
      'button[aria-label*="Send without" i]',
      'button[aria-label*="Send" i]',
    ]),
    sendButtonText: Object.freeze(['Send without a note', 'Send', 'Kirim']),
  }),
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
