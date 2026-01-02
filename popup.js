/**
 * LinkedIn Auto Connect - Popup Script
 * UI, validasi, dan tampilan hasil
 * dibuat oleh smalm
 */

'use strict';

let isProcessing = false;
let messageTimeout = null;
let currentTab = 'main'; // 'main' atau 'results'

// === URL VALIDATOR ===
const URLValidator = {
  normalize(url) {
    if (!url || typeof url !== 'string') return null;
    let cleaned = url.replace(/[\u200B-\u200D\uFEFF\u2060\u00A0\u2028\u2029]/g, '').trim();
    cleaned = cleaned.replace(/^[\d\.\)\(\-\•\–\—\s\u2022\u2023\u25E6\u2043\u2219]+/, '').trim();
    cleaned = cleaned.replace(/[\s\r\n\t]+/g, '').replace(/[<>'"]/g, '');
    const match = cleaned.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i);
    if (!match || !match[1] || match[1].length < 2) return null;
    return `https://www.linkedin.com/in/${match[1]}`;
  },
  validate(url) {
    const n = this.normalize(url);
    return n ? { valid: true, url: n } : { valid: false };
  },
  validateBatch(urls) {
    const valid = [], seen = new Set();
    let dups = 0;
    for (const url of urls) {
      const r = this.validate(url);
      if (r.valid) {
        if (seen.has(r.url)) { dups++; continue; }
        seen.add(r.url);
        valid.push(r.url);
      }
    }
    return { valid, duplicatesRemoved: dups };
  }
};

// === DOM ELEMENTS ===
const el = {};
function initElements() {
  ['sessionCount', 'successCount', 'successRate', 'linksInput', 'inputCount',
   'networkStatus', 'networkStatusText', 'runButton', 'progressSection',
   'progressBar', 'progressPercentage', 'progressText', 'progressDetail',
   'resultsSection', 'resultSuccess', 'resultFailed', 'resultSkipped',
   'errorMessage', 'errorText', 'successMessage', 'successText',
   'statusDot', 'statusText', 'resumeBanner', 'resumeInfo', 'resumeBtn', 'clearSessionBtn',
   'mainContent', 'resultsContent', 'tabMain', 'tabResults',
   'resultsList', 'resultsFilter', 'exportBtn', 'clearResultsBtn', 'resultsEmpty',
   'resultsSummary', 'copySuccessBtn'
  ].forEach(id => el[id] = document.getElementById(id));
}

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  await checkState();
  await loadStats();
  await checkNetwork();
  await checkResume();
  setupEvents();
});

// === EVENTS ===
function setupEvents() {
  el.runButton?.addEventListener('click', handleClick);
  el.linksInput?.addEventListener('input', debounce(handleInput, 100));
  el.resumeBtn?.addEventListener('click', handleResume);
  el.clearSessionBtn?.addEventListener('click', handleClear);
  
  // Tab switching
  el.tabMain?.addEventListener('click', () => switchTab('main'));
  el.tabResults?.addEventListener('click', () => switchTab('results'));
  
  // Results actions
  el.resultsFilter?.addEventListener('change', loadResultsList);
  el.exportBtn?.addEventListener('click', handleExport);
  el.clearResultsBtn?.addEventListener('click', handleClearResults);
  el.copySuccessBtn?.addEventListener('click', handleCopySuccess);
  
  chrome.runtime.onMessage.addListener(handleMessage);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// === TAB SWITCHING ===
function switchTab(tab) {
  currentTab = tab;
  
  if (tab === 'main') {
    el.mainContent?.classList.add('active');
    el.resultsContent?.classList.remove('active');
    el.tabMain?.classList.add('active');
    el.tabResults?.classList.remove('active');
  } else {
    el.mainContent?.classList.remove('active');
    el.resultsContent?.classList.add('active');
    el.tabMain?.classList.remove('active');
    el.tabResults?.classList.add('active');
    loadResultsList();
  }
}

// === LOAD RESULTS LIST ===
async function loadResultsList() {
  chrome.runtime.sendMessage({ action: 'GET_RESULTS' }, (response) => {
    if (!response?.success) return;
    
    const results = response.results || [];
    const filter = el.resultsFilter?.value || 'all';
    
    // Update summary
    if (el.resultsSummary) {
      el.resultsSummary.innerHTML = `
        <span class="summary-item success">${response.summary.success} Terkirim</span>
        <span class="summary-item failed">${response.summary.failed} Gagal</span>
        <span class="summary-item skipped">${response.summary.skipped} Dilewati</span>
      `;
    }
    
    // Filter results
    let filtered = results;
    if (filter !== 'all') {
      filtered = results.filter(r => r.type === filter);
    }
    
    // Reverse to show newest first
    filtered = filtered.slice().reverse();
    
    // Render list
    if (!el.resultsList) return;
    
    if (filtered.length === 0) {
      el.resultsList.innerHTML = '';
      el.resultsEmpty?.classList.add('active');
      return;
    }
    
    el.resultsEmpty?.classList.remove('active');
    
    el.resultsList.innerHTML = filtered.map((r, i) => {
      const username = r.url.split('/in/')[1] || r.url;
      const time = new Date(r.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const typeClass = r.type === 'success' ? 'success' : r.type === 'failed' ? 'failed' : 'skipped';
      const typeIcon = r.type === 'success' ? '✓' : r.type === 'failed' ? '✗' : '⊘';
      
      return `
        <div class="result-row ${typeClass}">
          <span class="result-icon">${typeIcon}</span>
          <a href="${r.url}" target="_blank" class="result-url" title="${r.url}">${username}</a>
          <span class="result-status">${r.status}</span>
          <span class="result-time">${time}</span>
        </div>
      `;
    }).join('');
  });
}

// === EXPORT ===
function handleExport() {
  chrome.runtime.sendMessage({ action: 'EXPORT_RESULTS' }, (response) => {
    if (!response?.success) return;
    
    const { successList, failedList, skippedList, successCount, failedCount, skippedCount } = response.data;
    
    const text = `=== HASIL LINKEDIN AUTO CONNECT ===
Tanggal: ${new Date().toLocaleDateString('id-ID')}

--- BERHASIL TERKIRIM (${successCount}) ---
${successList || '(kosong)'}

--- GAGAL (${failedCount}) ---
${failedList || '(kosong)'}

--- DILEWATI (${skippedCount}) ---
${skippedList || '(kosong)'}
`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      showSuccess('Hasil disalin ke clipboard!');
    }).catch(() => {
      showError('Gagal menyalin');
    });
  });
}

// === COPY SUCCESS LIST ===
function handleCopySuccess() {
  chrome.runtime.sendMessage({ action: 'EXPORT_RESULTS' }, (response) => {
    if (!response?.success) return;
    
    const successList = response.data.successList || '';
    
    if (!successList) {
      showError('Tidak ada hasil yang berhasil');
      return;
    }
    
    navigator.clipboard.writeText(successList).then(() => {
      showSuccess(`${response.data.successCount} URL berhasil disalin!`);
    }).catch(() => {
      showError('Gagal menyalin');
    });
  });
}

// === CLEAR RESULTS ===
function handleClearResults() {
  if (!confirm('Hapus semua riwayat hasil?')) return;
  
  chrome.runtime.sendMessage({ action: 'CLEAR_RESULTS' }, () => {
    loadResultsList();
    showSuccess('Riwayat dihapus');
  });
}

// === INPUT HANDLER ===
function handleInput(e) {
  const links = parseLinks(e.target.value);
  updateCount(links.length);
  updateButton(links.length);
  if (el.sessionCount) el.sessionCount.textContent = links.length;
}

function parseLinks(input) {
  if (!input?.trim()) return [];
  const lines = input.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  return URLValidator.validateBatch(lines).valid;
}

function updateCount(count) {
  if (!el.inputCount) return;
  el.inputCount.textContent = `${count} URL`;
  el.inputCount.className = count > 0 && count <= 100 ? 'input-count valid' : count > 100 ? 'input-count invalid' : 'input-count';
}

function updateButton(count) {
  if (el.runButton) el.runButton.disabled = count === 0 || count > 100 || isProcessing;
}

// === BUTTON CLICK ===
async function handleClick(e) {
  if (isProcessing) {
    chrome.runtime.sendMessage({ action: 'STOP' });
  } else {
    await handleExecute();
  }
}

async function handleExecute() {
  hideMessages();
  const input = el.linksInput?.value.trim() || '';
  if (!input) { showError('Masukkan URL profil LinkedIn'); return; }

  const links = parseLinks(input);
  if (links.length === 0) { showError('Tidak ada URL valid'); return; }
  if (links.length > 100) { showError('Maksimal 100 profil'); return; }

  setProcessing(true, links.length);

  chrome.runtime.sendMessage({ action: 'START', config: { links, timestamp: Date.now() } }, (res) => {
    if (chrome.runtime.lastError) { setProcessing(false); showError(chrome.runtime.lastError.message); return; }
    if (res?.success) console.log('Mulai', res.count, 'profil');
    else if (res?.error) { setProcessing(false); showError(res.error); }
  });
}

// === STATE MANAGEMENT ===
function setProcessing(processing, total = 0) {
  isProcessing = processing;
  if (!el.runButton) return;

  if (processing) {
    el.runButton.classList.add('stop');
    el.runButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg> Berhenti';
    el.progressSection?.classList.add('active');
    el.resultsSection?.classList.remove('active');
    updateProgress(0, total);
    updateStatus('processing', 'Berjalan...');
    el.resumeBanner?.classList.remove('active');
  } else {
    el.runButton.classList.remove('stop');
    el.runButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Jalankan';
    const links = parseLinks(el.linksInput?.value || '');
    updateButton(links.length);
  }
}

async function checkState() {
  const { isProcessing: bg } = await chrome.storage.local.get('isProcessing');
  if (bg) {
    const { currentProgress } = await chrome.storage.local.get('currentProgress');
    if (currentProgress) {
      setProcessing(true, currentProgress.total);
      updateProgress(currentProgress.current, currentProgress.total);
    }
  }
}

// === PROGRESS ===
function updateProgress(current, total, action = '') {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  if (el.progressBar) el.progressBar.style.width = pct + '%';
  if (el.progressPercentage) el.progressPercentage.textContent = pct + '%';
  if (el.progressText) el.progressText.textContent = `${current} dari ${total} profil`;
  if (action && el.progressDetail) el.progressDetail.innerHTML = `<span class="spinner"></span> ${escapeHtml(action)}`;
}

// === MESSAGE HANDLER ===
function handleMessage(msg, sender, respond) {
  switch (msg.type) {
    case 'PROGRESS':
      updateProgress(msg.data.current, msg.data.total, msg.data.action);
      
      // Update semua stats realtime
      if (el.sessionCount) el.sessionCount.textContent = msg.data.remaining || (msg.data.total - msg.data.current);
      if (el.successCount) el.successCount.textContent = msg.data.success || 0;
      if (el.successRate) el.successRate.textContent = (msg.data.rate || 0) + '%';
      
      // Update hasil langsung juga
      if (el.resultSuccess) el.resultSuccess.textContent = msg.data.success || 0;
      if (el.resultFailed) el.resultFailed.textContent = msg.data.failed || 0;
      if (el.resultSkipped) el.resultSkipped.textContent = msg.data.skipped || 0;
      break;
      
    case 'COMPLETE':
      setProcessing(false);
      el.progressSection?.classList.remove('active');
      el.resultsSection?.classList.add('active');
      
      // Final stats
      if (el.sessionCount) el.sessionCount.textContent = '0';
      if (el.resultSuccess) el.resultSuccess.textContent = msg.data.success || 0;
      if (el.resultFailed) el.resultFailed.textContent = msg.data.failed || 0;
      if (el.resultSkipped) el.resultSkipped.textContent = msg.data.skipped || 0;
      
      updateStatus('ready', 'Selesai');
      loadStats();
      showSuccess(`Selesai! ${msg.data.success} terkirim, ${msg.data.failed} gagal, ${msg.data.skipped} dilewati.`);
      break;
      
    case 'STOPPED':
      setProcessing(false);
      if (msg.data.processed > 0) {
        el.progressSection?.classList.remove('active');
        el.resultsSection?.classList.add('active');
        if (el.resultSuccess) el.resultSuccess.textContent = msg.data.success || 0;
        if (el.resultFailed) el.resultFailed.textContent = msg.data.failed || 0;
        if (el.resultSkipped) el.resultSkipped.textContent = msg.data.skipped || 0;
      }
      updateStatus('ready', 'Dihentikan');
      loadStats();
      break;
  }
  respond?.({ ok: true });
  return true;
}

// === STATS ===
async function loadStats() {
  const { analytics } = await chrome.storage.local.get('analytics');
  if (analytics) {
    if (el.successCount) el.successCount.textContent = analytics.success || 0;
    const total = analytics.total || 0;
    const rate = total > 0 ? Math.round((analytics.success / total) * 100) : 0;
    if (el.successRate) el.successRate.textContent = rate + '%';
  }
}

// === NETWORK ===
async function checkNetwork() {
  try {
    const start = performance.now();
    await fetch('https://www.linkedin.com/favicon.ico', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
    const lat = Math.round(performance.now() - start);
    let status = 'Optimal', cls = 'optimal';
    if (lat > 3000) { status = 'Lambat'; cls = 'critical'; }
    else if (lat > 1500) { status = 'Sedang'; cls = 'degraded'; }
    if (el.networkStatusText) el.networkStatusText.textContent = status;
    if (el.networkStatus) el.networkStatus.className = 'config-value ' + cls;
  } catch (e) {
    if (el.networkStatusText) el.networkStatusText.textContent = 'Offline';
    if (el.networkStatus) el.networkStatus.className = 'config-value critical';
  }
}

// === RESUME ===
async function checkResume() {
  const { lac_session: s } = await chrome.storage.local.get('lac_session');
  if (s && s.currentIndex < s.links.length) {
    if (el.resumeInfo) el.resumeInfo.textContent = `${s.links.length - s.currentIndex} dari ${s.links.length}`;
    el.resumeBanner?.classList.add('active');
  } else {
    el.resumeBanner?.classList.remove('active');
  }
}

function handleResume() {
  el.resumeBanner?.classList.remove('active');
  chrome.runtime.sendMessage({ action: 'RESUME' }, (res) => {
    if (res?.success) {
      setProcessing(true, res.total);
      updateProgress(res.total - res.remaining, res.total, 'Melanjutkan...');
    } else if (res?.error) showError(res.error);
  });
}

function handleClear() {
  chrome.storage.local.remove('lac_session');
  el.resumeBanner?.classList.remove('active');
}

// === STATUS ===
function updateStatus(state, text) {
  if (el.statusDot) {
    el.statusDot.className = 'status-dot' + (state === 'processing' ? ' processing' : state === 'error' ? ' error' : '');
  }
  if (el.statusText) el.statusText.textContent = text;
}

// === MESSAGES ===
function showError(msg) {
  el.errorMessage?.classList.add('active');
  if (el.errorText) el.errorText.textContent = msg;
  el.successMessage?.classList.remove('active');
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => el.errorMessage?.classList.remove('active'), 8000);
}

function showSuccess(msg) {
  el.successMessage?.classList.add('active');
  if (el.successText) el.successText.textContent = msg;
  el.errorMessage?.classList.remove('active');
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => el.successMessage?.classList.remove('active'), 10000);
}

function hideMessages() {
  el.errorMessage?.classList.remove('active');
  el.successMessage?.classList.remove('active');
  clearTimeout(messageTimeout);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
