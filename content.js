/**
 * LinkedIn Auto Connect - Content Script
 * dibuat oleh smalm
 */

(function() {
  'use strict';

  // Cek apakah sudah di-load
  if (window.__lacLoaded) return;
  window.__lacLoaded = true;

  // === UTILITIES ===
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function safeQuery(selector, context) {
    try {
      return (context || document).querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function safeQueryAll(selector, context) {
    try {
      return Array.from((context || document).querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 &&
             style.visibility !== 'hidden' &&
             style.display !== 'none' &&
             !el.disabled;
    } catch (e) {
      return false;
    }
  }

  function normalizeText(text) {
    return (text || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  // === CEK STATUS KONEKSI ===
  function checkConnectionStatus() {
    // Cek 1st degree badge
    var badges = document.querySelectorAll('.distance-badge, [class*="dist-value"], span.dist-value');
    for (var i = 0; i < badges.length; i++) {
      var txt = badges[i].textContent || '';
      if (txt.indexOf('1st') !== -1 || txt.indexOf('1º') !== -1) {
        return { skip: true, status: 'CONNECTED' };
      }
    }

    // Cek tombol utama Message
    var actionContainers = document.querySelectorAll('.pvs-profile-actions, .pv-top-card-v2-ctas, .pv-top-card__cta-row');
    for (var j = 0; j < actionContainers.length; j++) {
      var firstBtn = actionContainers[j].querySelector('button');
      if (firstBtn && isVisible(firstBtn)) {
        var btnText = normalizeText(firstBtn.textContent);
        if (btnText === 'message' || btnText === 'pesan') {
          return { skip: true, status: 'CONNECTED' };
        }
      }
    }

    // Cek Pending
    var allButtons = document.querySelectorAll('button');
    for (var k = 0; k < allButtons.length; k++) {
      var btn = allButtons[k];
      if (!isVisible(btn)) continue;
      var text = normalizeText(btn.textContent);
      if (text === 'pending' || text.indexOf('pending') !== -1) {
        return { skip: true, status: 'PENDING' };
      }
    }

    return { skip: false, status: 'NOT_CONNECTED' };
  }

  // === CARI TOMBOL CONNECT ===
  function findConnectButton() {
    var excludeWords = ['follow', 'following', 'ikuti', 'message', 'pesan', 'pending', 'more', 'lainnya'];
    var connectWords = ['connect', 'hubungkan', 'conectar'];
    
    // Scan semua button
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!isVisible(btn)) continue;
      
      var text = normalizeText(btn.textContent);
      var aria = normalizeText(btn.getAttribute('aria-label') || '');
      
      // Cek apakah Connect
      var isConnect = false;
      for (var c = 0; c < connectWords.length; c++) {
        if (text === connectWords[c] || aria.indexOf('connect') !== -1 || aria.indexOf('invite') !== -1) {
          isConnect = true;
          break;
        }
      }
      
      if (!isConnect) continue;
      
      // Cek apakah excluded
      var isExcluded = false;
      for (var e = 0; e < excludeWords.length; e++) {
        if (text.indexOf(excludeWords[e]) !== -1 || aria.indexOf(excludeWords[e]) !== -1) {
          isExcluded = true;
          break;
        }
      }
      
      if (isExcluded) continue;
      
      // Cek bukan dropdown
      if (btn.getAttribute('aria-haspopup') === 'true') continue;
      if (btn.querySelector('[data-test-icon="caret-down"]')) continue;
      
      console.log('[LAC] Found Connect button:', text);
      return btn;
    }
    
    console.log('[LAC] No Connect button found');
    return null;
  }

  // === KLIK BUTTON ===
  function clickButton(element) {
    if (!element) return false;
    try {
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      element.focus();
      element.click();
      
      // Dispatch events
      var rect = element.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      
      return true;
    } catch (e) {
      console.error('[LAC] Click error:', e);
      return false;
    }
  }

  // === TUNGGU MODAL ===
  function waitForModal(timeout) {
    return new Promise(function(resolve) {
      var startTime = Date.now();
      
      function check() {
        var modal = document.querySelector('[role="dialog"]') ||
                   document.querySelector('.artdeco-modal') ||
                   document.querySelector('.send-invite');
        
        if (modal && isVisible(modal)) {
          resolve(modal);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          resolve(null);
          return;
        }
        
        setTimeout(check, 100);
      }
      
      check();
    });
  }

  // === HANDLE MODAL ===
  function handleModal(modal) {
    if (!modal) {
      return { success: true, status: 'DIRECT' };
    }
    
    // Cari tombol Send
    var buttons = modal.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!isVisible(btn)) continue;
      
      var text = normalizeText(btn.textContent);
      
      // Prioritas: "Send without a note"
      if (text.indexOf('send without') !== -1 || text.indexOf('kirim tanpa') !== -1) {
        clickButton(btn);
        return { success: true, status: 'SENT_NO_NOTE' };
      }
    }
    
    // Fallback: tombol Send biasa
    for (var j = 0; j < buttons.length; j++) {
      var b = buttons[j];
      if (!isVisible(b)) continue;
      
      var t = normalizeText(b.textContent);
      var isPrimary = b.classList.contains('artdeco-button--primary');
      
      if (isPrimary && (t === 'send' || t === 'kirim' || t.indexOf('send') === 0)) {
        clickButton(b);
        return { success: true, status: 'SENT' };
      }
    }
    
    // Close modal jika tidak ketemu
    var closeBtn = modal.querySelector('button[aria-label="Dismiss"]') ||
                   modal.querySelector('.artdeco-modal__dismiss');
    if (closeBtn) closeBtn.click();
    
    return { success: true, status: 'CLICKED' };
  }

  // === MAIN CONNECT ===
  async function performConnect() {
    console.log('[LAC] Starting connect...');
    
    try {
      // Tunggu page stabil
      await sleep(500);
      
      // Cek status
      var status = checkConnectionStatus();
      console.log('[LAC] Status:', JSON.stringify(status));
      
      if (status.skip) {
        return { success: false, skipped: true, status: status.status };
      }
      
      // Cari tombol Connect
      var connectBtn = findConnectButton();
      
      if (!connectBtn) {
        // Retry sekali
        await sleep(500);
        connectBtn = findConnectButton();
        
        if (!connectBtn) {
          return { success: false, skipped: true, status: 'NO_BUTTON' };
        }
      }
      
      // Klik Connect
      console.log('[LAC] Clicking Connect...');
      clickButton(connectBtn);
      
      // Tunggu modal
      await sleep(500);
      var modal = await waitForModal(2000);
      console.log('[LAC] Modal:', modal ? 'found' : 'not found');
      
      // Handle modal
      var result = handleModal(modal);
      console.log('[LAC] Result:', JSON.stringify(result));
      
      return result;
      
    } catch (e) {
      console.error('[LAC] Error:', e);
      return { success: false, skipped: false, error: e.message };
    }
  }

  // === MESSAGE LISTENER ===
  chrome.runtime.onMessage.addListener(function(msg, sender, respond) {
    if (msg.action === 'PERFORM_CONNECT') {
      performConnect().then(function(result) {
        respond(result);
      }).catch(function(e) {
        respond({ success: false, error: e.message });
      });
      return true;
    }
    
    if (msg.action === 'CHECK_STATUS') {
      var status = checkConnectionStatus();
      var btn = findConnectButton();
      respond({ skip: status.skip, status: status.status, hasButton: !!btn });
      return true;
    }
    
    if (msg.action === 'PING') {
      respond({ alive: true });
      return true;
    }
  });

  console.log('[LAC] Content script loaded');

})();
