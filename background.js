/**
 * LinkedIn Auto Connect - Background Service Worker
 * dibuat oleh smalm
 */

'use strict';

importScripts('config.js', 'utils.js');

// === INISIALISASI ===
const queue = new SmartQueue();
const behavior = new HumanBehaviorSimulator();
const session = new SessionManager();
const log = new Logger('BG');

// === STATE ===
let state = {
  isProcessing: false,
  isPaused: false,
  shouldStop: false,
  currentTabId: null,
  currentIndex: 0,
  links: [],
  processedUrls: new Set(), // Track duplikat
  results: { success: 0, failed: 0, skipped: 0 },
  startTime: null,
  resultList: []
};

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  switch (msg.action) {
    case 'START': handleStart(msg.config, respond); return true;
    case 'STOP': handleStop(respond); return true;
    case 'PAUSE': state.isPaused = !state.isPaused; respond({ isPaused: state.isPaused }); return true;
    case 'RESUME': handleResume(respond); return true;
    case 'STATUS': respond({ ...state }); return true;
    case 'GET_RESULTS': handleGetResults(respond); return true;
    case 'CLEAR_RESULTS': handleClearResults(respond); return true;
    case 'EXPORT_RESULTS': handleExportResults(respond); return true;
  }
});

// === START ===
async function handleStart(config, respond) {
  if (state.isProcessing) { 
    respond({ success: false, error: 'Sedang berjalan' }); 
    return; 
  }

  const validator = new URLValidator();
  const result = validator.validateBatch(config.links);
  
  if (result.valid.length === 0) { 
    respond({ success: false, error: 'Tidak ada URL valid' }); 
    return; 
  }

  state = {
    isProcessing: true,
    isPaused: false,
    shouldStop: false,
    currentTabId: null,
    currentIndex: 0,
    links: result.valid,
    processedUrls: new Set(),
    results: { success: 0, failed: 0, skipped: 0 },
    startTime: Date.now(),
    resultList: []
  };

  await chrome.storage.local.set({ isProcessing: true });
  log.log('Mulai ' + state.links.length + ' profil');
  respond({ success: true, count: result.valid.length, duplicates: result.duplicatesRemoved });

  processQueue();
}

// === STOP ===
async function handleStop(respond) {
  state.shouldStop = true;
  
  // Tutup tab jika ada
  if (state.currentTabId) {
    try { 
      await chrome.tabs.remove(state.currentTabId); 
    } catch (e) {}
    state.currentTabId = null;
  }
  
  await saveResultList();
  broadcast({ type: 'STOPPED', data: { ...state.results, processed: state.currentIndex } });
  
  state.isProcessing = false;
  await chrome.storage.local.set({ isProcessing: false });
  
  respond({ success: true });
}

// === RESUME ===
async function handleResume(respond) {
  const saved = await session.load();
  if (!saved) { 
    respond({ success: false, error: 'Tidak ada sesi' }); 
    return; 
  }

  state = {
    isProcessing: true,
    isPaused: false,
    shouldStop: false,
    currentTabId: null,
    currentIndex: saved.currentIndex,
    links: saved.links,
    processedUrls: new Set(saved.processedUrls || []),
    results: saved.results || { success: 0, failed: 0, skipped: 0 },
    startTime: Date.now(),
    resultList: saved.resultList || []
  };

  await chrome.storage.local.set({ isProcessing: true });
  respond({ success: true, total: state.links.length, remaining: state.links.length - state.currentIndex });
  processQueue();
}

// === RESULTS ===
async function handleGetResults(respond) {
  const { lac_results } = await chrome.storage.local.get('lac_results');
  const results = lac_results || [];
  respond({ 
    success: true, 
    results,
    summary: {
      success: results.filter(r => r.type === 'success').length,
      failed: results.filter(r => r.type === 'failed').length,
      skipped: results.filter(r => r.type === 'skipped').length,
    }
  });
}

async function handleClearResults(respond) {
  await chrome.storage.local.remove('lac_results');
  respond({ success: true });
}

async function handleExportResults(respond) {
  const { lac_results } = await chrome.storage.local.get('lac_results');
  const results = lac_results || [];
  respond({
    success: true,
    data: {
      successList: results.filter(r => r.type === 'success').map(r => r.url).join('\n'),
      failedList: results.filter(r => r.type === 'failed').map(r => r.url + ' (' + r.status + ')').join('\n'),
      skippedList: results.filter(r => r.type === 'skipped').map(r => r.url + ' (' + r.status + ')').join('\n'),
      successCount: results.filter(r => r.type === 'success').length,
      failedCount: results.filter(r => r.type === 'failed').length,
      skippedCount: results.filter(r => r.type === 'skipped').length,
    }
  });
}

// === MAIN LOOP ===
async function processQueue() {
  while (state.currentIndex < state.links.length && !state.shouldStop) {
    // Pause check
    while (state.isPaused && !state.shouldStop) {
      await sleep(500);
    }
    if (state.shouldStop) break;

    // Rate limit
    if (!queue.checkRateLimit()) {
      const wait = Math.min(queue.getTimeUntilReset(), 30000);
      broadcastProgress('Rate limit ' + Math.ceil(wait/1000) + 's');
      await sleep(wait);
      continue;
    }

    const url = state.links[state.currentIndex];
    
    // Skip jika sudah diproses (duplikat)
    if (state.processedUrls.has(url)) {
      log.log('Skip duplikat: ' + url);
      state.currentIndex++;
      continue;
    }
    
    state.processedUrls.add(url);
    broadcastProgress((state.currentIndex + 1) + '/' + state.links.length);

    try {
      const result = await processProfile(url);
      
      // Record result (HANYA SEKALI)
      recordResult(url, result);
      queue.recordRequest();
      state.currentIndex++;

      // Delay
      if (state.currentIndex < state.links.length && !state.shouldStop) {
        const delay = result.skipped ? 400 : (1000 + Math.random() * 1500);
        await sleep(delay);
      }

    } catch (e) {
      log.error('Error: ' + e.message);
      recordResult(url, { success: false, skipped: false, error: e.message });
      state.currentIndex++;
    }

    // Save progress
    if (state.currentIndex % 5 === 0) {
      await saveProgress();
    }
  }

  await handleComplete();
}

// === RECORD RESULT ===
function recordResult(url, result) {
  const entry = {
    url: url,
    type: result.success ? 'success' : (result.skipped ? 'skipped' : 'failed'),
    status: result.status || result.error || 'UNKNOWN',
    timestamp: Date.now()
  };
  
  state.resultList.push(entry);

  if (result.success) {
    state.results.success++;
    queue.recordSuccess();
    broadcastProgress('✓ ' + (result.status || 'Terkirim'));
  } else if (result.skipped) {
    state.results.skipped++;
    broadcastProgress('⊘ ' + result.status);
  } else {
    state.results.failed++;
    queue.recordFailure();
    broadcastProgress('✗ ' + (result.error || result.status));
  }
}

// === PROCESS PROFILE ===
async function processProfile(url) {
  let tabId = null;
  
  try {
    // Buat tab
    const tab = await chrome.tabs.create({ url: url, active: false });
    tabId = tab.id;
    state.currentTabId = tabId;

    // Tunggu loading (max 25 detik)
    const loaded = await waitForTabLoad(tabId, 25000);
    if (!loaded) {
      await closeTab(tabId);
      return { success: false, skipped: false, error: 'TIMEOUT' };
    }

    // Tunggu konten render
    await sleep(1500);

    // Inject dan execute content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (e) {
      await closeTab(tabId);
      return { success: false, skipped: false, error: 'INJECT_FAILED' };
    }

    await sleep(300);

    // Kirim perintah connect
    const result = await sendMessageWithTimeout(tabId, { action: 'PERFORM_CONNECT' }, 10000);
    
    await closeTab(tabId);
    
    if (result) {
      return result;
    } else {
      return { success: false, skipped: false, error: 'NO_RESPONSE' };
    }

  } catch (e) {
    if (tabId) await closeTab(tabId);
    return { success: false, skipped: false, error: e.message };
  }
}

// === WAIT FOR TAB LOAD ===
function waitForTabLoad(tabId, timeout) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    function check() {
      if (Date.now() - startTime > timeout) {
        resolve(false);
        return;
      }
      
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        
        if (tab && tab.status === 'complete') {
          resolve(true);
        } else {
          setTimeout(check, 500);
        }
      });
    }
    
    check();
  });
}

// === SEND MESSAGE WITH TIMEOUT ===
function sendMessageWithTimeout(tabId, message, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeout);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// === CLOSE TAB ===
async function closeTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (e) {}
  if (state.currentTabId === tabId) {
    state.currentTabId = null;
  }
}

// === COMPLETE ===
async function handleComplete() {
  state.isProcessing = false;
  await saveResultList();
  await chrome.storage.local.set({ isProcessing: false });
  await session.clear();

  broadcast({ 
    type: 'COMPLETE', 
    data: { 
      ...state.results, 
      total: state.links.length, 
      duration: Date.now() - state.startTime
    } 
  });
  
  log.log('Selesai: ' + JSON.stringify(state.results));
}

// === SAVE ===
async function saveResultList() {
  const { lac_results } = await chrome.storage.local.get('lac_results');
  const existing = lac_results || [];
  const combined = existing.concat(state.resultList).slice(-500);
  await chrome.storage.local.set({ lac_results: combined });
}

async function saveProgress() {
  await session.save({
    links: state.links,
    currentIndex: state.currentIndex,
    results: state.results,
    processedUrls: Array.from(state.processedUrls),
    resultList: state.resultList
  });
}

// === BROADCAST ===
function broadcastProgress(action) {
  const total = state.links.length;
  const current = state.currentIndex;
  const remaining = total - current;
  const processed = state.results.success + state.results.failed;
  const rate = processed === 0 ? 0 : Math.round((state.results.success / processed) * 100);
  
  broadcast({ 
    type: 'PROGRESS', 
    data: { current, total, remaining, success: state.results.success, failed: state.results.failed, skipped: state.results.skipped, rate, action } 
  });
}

function broadcast(msg) { 
  chrome.runtime.sendMessage(msg).catch(() => {}); 
}

function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

// === EVENTS ===
chrome.tabs.onRemoved.addListener((tabId) => { 
  if (tabId === state.currentTabId) {
    state.currentTabId = null;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isProcessing: false });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ isProcessing: false });
});

log.log('Service worker aktif - smalm');
