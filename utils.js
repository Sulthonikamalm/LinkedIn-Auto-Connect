/**
 * LinkedIn Auto Connect - Utility Classes
 * Sistem queue, simulasi perilaku manusia, anti-deteksi
 * dibuat oleh smalm
 */

'use strict';

// === KONSTANTA ===
const CONSTANTS = {
  MAX_QUEUE_SIZE: 500,
  MAX_TIMELINE_ENTRIES: 500,
  SESSION_EXPIRY: 3600000,
  RATE_LIMIT_WINDOW: 3600000,
};

// === URL VALIDATOR ===
class URLValidator {
  constructor() {
    this.maxUrlLength = 2048;
  }

  // Normalisasi URL ke format standar
  normalize(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Hapus karakter Unicode tersembunyi
    let cleaned = url
      .replace(/[\u200B-\u200D\uFEFF\u2060\u00A0\u2028\u2029]/g, '')
      .trim();
    
    // Hapus nomor, titik, kurung di awal
    cleaned = cleaned.replace(/^[\d\.\)\(\-\•\–\—\s\u2022\u2023\u25E6\u2043\u2219]+/, '').trim();
    cleaned = cleaned.replace(/[\s\r\n\t]+/g, '');
    cleaned = cleaned.replace(/[<>'"]/g, '');
    
    // Ekstrak username LinkedIn
    const match = cleaned.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i);
    if (!match || !match[1] || match[1].length < 2) return null;
    
    return `https://www.linkedin.com/in/${match[1]}`;
  }

  validate(url) {
    const normalized = this.normalize(url);
    if (!normalized) return { valid: false, error: 'INVALID' };
    if (normalized.length > this.maxUrlLength) return { valid: false, error: 'TOO_LONG' };
    return { valid: true, url: normalized };
  }

  validateBatch(urls) {
    const valid = [], invalid = [], seen = new Set();
    let duplicatesRemoved = 0;

    for (const url of urls) {
      const result = this.validate(url);
      if (result.valid) {
        if (seen.has(result.url)) { duplicatesRemoved++; continue; }
        seen.add(result.url);
        valid.push(result.url);
      } else {
        invalid.push({ url, error: result.error });
      }
    }
    return { valid, invalid, duplicatesRemoved };
  }
}

// === SMART QUEUE ===
class SmartQueue {
  constructor() {
    this.queue = [];
    this.rateLimit = { window: 3600000, maxRequests: 100, requests: [] };
    this.circuitBreaker = { failures: 0, threshold: 10, state: 'CLOSED', resetTimeout: null };
    this._cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    clearTimeout(this.circuitBreaker.resetTimeout);
  }

  _cleanup() {
    const now = Date.now();
    this.rateLimit.requests = this.rateLimit.requests.filter(t => now - t < this.rateLimit.window);
  }

  enqueue(item, priority = 0) {
    if (this.queue.length >= CONSTANTS.MAX_QUEUE_SIZE) throw new Error('Queue penuh');
    this.queue.push({ item, priority, timestamp: Date.now() });
    this.queue.sort((a, b) => b.priority - a.priority);
    return this.queue.length;
  }

  dequeue() { return this.queue.shift(); }
  size() { return this.queue.length; }
  clear() { this.queue = []; }

  checkRateLimit() {
    this._cleanup();
    return this.rateLimit.requests.length < this.rateLimit.maxRequests;
  }

  recordRequest() { this.rateLimit.requests.push(Date.now()); }
  getRemainingRequests() { this._cleanup(); return Math.max(0, this.rateLimit.maxRequests - this.rateLimit.requests.length); }
  getTimeUntilReset() {
    if (this.rateLimit.requests.length === 0) return 0;
    return Math.max(0, this.rateLimit.window - (Date.now() - Math.min(...this.rateLimit.requests)));
  }

  recordFailure() {
    this.circuitBreaker.failures++;
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) this._openCircuit();
  }

  recordSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') this._closeCircuit();
    this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
  }

  _openCircuit() {
    this.circuitBreaker.state = 'OPEN';
    clearTimeout(this.circuitBreaker.resetTimeout);
    this.circuitBreaker.resetTimeout = setTimeout(() => {
      this.circuitBreaker.state = 'HALF_OPEN';
    }, 30000);
  }

  _closeCircuit() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failures = 0;
    clearTimeout(this.circuitBreaker.resetTimeout);
  }

  isCircuitOpen() { return this.circuitBreaker.state === 'OPEN'; }
  getCircuitState() { return this.circuitBreaker.state; }
}

// === HUMAN BEHAVIOR SIMULATOR ===
class HumanBehaviorSimulator {
  constructor() {
    this.actionCount = 0;
  }

  // Delay dengan distribusi Gaussian (Box-Muller)
  getGaussianDelay(base = 2000, variance = 500) {
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2.0 * Math.PI * u2);
    return Math.round(Math.max(base + z * variance, base * 0.3));
  }

  getRandomDelay(min, max) {
    return Math.round(min + Math.random() * (max - min));
  }

  // Tambah entropy ke timing
  addEntropy(baseDelay) {
    const jitter = (Math.random() - 0.5) * 400;
    this.actionCount++;
    const burstPause = this.actionCount % 10 === 0 ? 1000 : 0;
    return Math.round(Math.max(baseDelay + jitter + burstPause, baseDelay * 0.5));
  }

  getDwellTime() { return 1000 + Math.random() * 1500; }
  resetSession() { this.actionCount = 0; }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// === FINGERPRINT EVASION ===
class FingerprintEvasion {
  constructor() {
    this.sessionId = this._generateUUID();
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  getSessionId() { return this.sessionId; }
  rotate() { this.sessionId = this._generateUUID(); return this.sessionId; }
}

// === SMART RETRY ===
class SmartRetry {
  constructor(config = {}) {
    this.maxRetries = config.maxAttempts || 2;
    this.baseDelay = config.baseDelay || 500;
    this.maxDelay = config.maxDelay || 5000;
    this.multiplier = config.backoffMultiplier || 1.5;
  }

  async execute(operation) {
    let lastError;
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return { success: true, result: await operation(), attempts: i + 1 };
      } catch (e) {
        lastError = e;
        if (i < this.maxRetries - 1) {
          await new Promise(r => setTimeout(r, Math.min(this.baseDelay * Math.pow(this.multiplier, i), this.maxDelay)));
        }
      }
    }
    return { success: false, error: lastError?.message, attempts: this.maxRetries };
  }
}

// === NETWORK HEALTH MONITOR ===
class NetworkHealthMonitor {
  constructor() {
    this.metrics = { latency: [], successCount: 0, errorCount: 0 };
  }

  recordLatency(ms) { this.metrics.latency.push(ms); if (this.metrics.latency.length > 30) this.metrics.latency.shift(); }
  recordSuccess() { this.metrics.successCount++; }
  recordError() { this.metrics.errorCount++; }
  
  getAvgLatency() {
    if (this.metrics.latency.length === 0) return 0;
    return this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length;
  }

  getErrorRate() {
    const total = this.metrics.successCount + this.metrics.errorCount;
    return total === 0 ? 0 : this.metrics.errorCount / total;
  }

  getRecommendedDelay() {
    const avgLat = this.getAvgLatency();
    if (avgLat > 3000 || this.getErrorRate() > 0.2) return 5000;
    if (avgLat > 1500) return 3000;
    return 1500;
  }

  getHealthStatus() {
    const err = this.getErrorRate();
    if (err > 0.3) return 'CRITICAL';
    if (err > 0.1) return 'DEGRADED';
    return 'HEALTHY';
  }

  reset() { this.metrics = { latency: [], successCount: 0, errorCount: 0 }; }
}

// === SESSION MANAGER ===
class SessionManager {
  constructor() {
    this.key = 'lac_session';
  }

  async save(data) {
    const session = { ...data, timestamp: Date.now(), version: '2.0' };
    await chrome.storage.local.set({ [this.key]: session });
    return true;
  }

  async load() {
    const result = await chrome.storage.local.get(this.key);
    const session = result[this.key];
    if (!session) return null;
    if (Date.now() - session.timestamp > CONSTANTS.SESSION_EXPIRY) {
      await this.clear();
      return null;
    }
    return session;
  }

  async clear() { await chrome.storage.local.remove(this.key); }
  async canResume() { const s = await this.load(); return s && s.currentIndex < s.links.length; }
}

// === ANALYTICS ENGINE ===
class AnalyticsEngine {
  constructor() { this._init(); }
  
  _init() {
    this.metrics = {
      total: 0, success: 0, failed: 0, skipped: 0,
      avgTime: 0, startTime: null, timeline: []
    };
  }

  startSession() { this.metrics.startTime = Date.now(); }
  
  record(success, duration, meta = {}) {
    this.metrics.total++;
    if (success) this.metrics.success++;
    else if (meta.skipped) this.metrics.skipped++;
    else this.metrics.failed++;

    this.metrics.timeline.push({ ts: Date.now(), success, duration });
    if (this.metrics.timeline.length > CONSTANTS.MAX_TIMELINE_ENTRIES) this.metrics.timeline.shift();

    // Update rata-rata
    this.metrics.avgTime = this.metrics.total === 1 ? duration :
      (this.metrics.avgTime * (this.metrics.total - 1) + duration) / this.metrics.total;
  }

  getSuccessRate() {
    return this.metrics.total === 0 ? 0 : (this.metrics.success / this.metrics.total) * 100;
  }

  getReport() {
    const dur = this.metrics.startTime ? Date.now() - this.metrics.startTime : 0;
    return {
      total: this.metrics.total,
      success: this.metrics.success,
      failed: this.metrics.failed,
      skipped: this.metrics.skipped,
      successRate: this.getSuccessRate().toFixed(1) + '%',
      avgTime: Math.round(this.metrics.avgTime) + 'ms',
      duration: Math.round(dur / 1000) + 's'
    };
  }

  reset() { this._init(); }
  
  toJSON() { return { ...this.metrics }; }
  fromJSON(data) { if (data) Object.assign(this.metrics, data); }
}

// === LOGGER ===
class Logger {
  constructor(prefix = 'LAC') { this.prefix = prefix; }
  log(msg, data) { console.log(`[${this.prefix}] ${msg}`, data || ''); }
  warn(msg, data) { console.warn(`[${this.prefix}] ${msg}`, data || ''); }
  error(msg, data) { console.error(`[${this.prefix}] ${msg}`, data || ''); }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONSTANTS, URLValidator, SmartQueue, HumanBehaviorSimulator,
    FingerprintEvasion, SmartRetry, NetworkHealthMonitor,
    SessionManager, AnalyticsEngine, Logger
  };
}
