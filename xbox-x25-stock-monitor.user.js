// ==UserScript==
// @name         Xbox X25 Stock Monitor (Microsoft + Best Buy)
// @namespace    https://pythonicshariful.tech/
// @version      1.0.0
// @description  DOM-based stock monitor for Xbox Series X25 Limited Edition on Microsoft Store and Best Buy. Alerts loudly when the page stops showing Out of stock / Coming Soon and attempts the first in-stock click only. No API polling: no verified stock API was found for either page (Nov 18, 2026). Does not complete checkout or enter payment details. In-stock click path is UNTESTED because both listings were unavailable when built.
// @author       pythonicshariful
// @match        https://www.microsoft.com/*/store/configure/xbox-series-x25-limited-edition/*
// @match        *://www.bestbuy.com/product/*6690019*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Design notes (from live checks on Nov 18, 2026, signed out, no CAPTCHA):
  // - Microsoft configure page: only option reads "Out of stock 1TB $899.99",
  //   "Continue to accessories" is disabled. Availability is visible signed out.
  //   The public DisplayCatalog endpoint returns product JSON but has NO stock
  //   boolean and still lists "Purchase" while the page says Out of stock, so
  //   this script does NOT poll it. DOM text is the only signal used here.
  // - Best Buy PDP (SKU 6690019): button "Coming Soon" (disabled),
  //   "Pickup not available for this item", "Shipping not available for this
  //   item", "Account required", 25,000 numbered consoles. No verified
  //   inventory API was found, so this script reads the DOM only.
  // - Safety: this script NEVER clicks a Place Order / checkout submit button,
  //   NEVER fills payment details, and stops after its first in-stock attempt
  //   so a human checks the tab. The in-stock click path could not be tested
  //   live because both listings were unavailable when this was built.
  // ---------------------------------------------------------------------------

  var SITE = window.location.hostname.indexOf('microsoft.com') !== -1 ? 'microsoft' : 'bestbuy';
  var CHECK_MS = 3000;
  var RELOAD_MS = 120000;
  var MAX_WAIT_MS = 25000;
  var STORE_KEY = 'x25_monitor_active_v1';

  var startTime = Date.now();
  var monitoring = false;
  var checks = 0;
  var attempted = false;
  var checkTimer = null;
  var reloadTimer = null;
  var titleTimer = null;
  var originalTitle = document.title;
  var audioCtx = null;

  var panel = null;
  var statusEl = null;
  var infoEl = null;
  var logEl = null;
  var startBtn = null;
  var stopBtn = null;
  var autoCheckbox = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function visible(el) { return !!(el && el.offsetParent !== null); }
  function btnText(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function now() { return new Date().toLocaleTimeString(); }
  function bodyText() {
    if (!document.body) return '';
    return document.body.innerText || document.body.textContent || '';
  }

  function log(msg) {
    try { console.log('[X25] ' + msg); } catch (e) {}
    if (!logEl) return;
    var div = document.createElement('div');
    div.textContent = '[' + now() + '] ' + msg;
    logEl.appendChild(div);
    while (logEl.children.length > 40) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(text, color) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = color || '#f9fafb';
    }
  }

  function updatePanel(r) {
    var map = {
      waiting: ['Waiting for page...', '#fbbf24'],
      oos: ['UNAVAILABLE', '#f87171'],
      unknown: ['UNKNOWN - see log', '#fbbf24'],
      instock: ['POSSIBLE IN STOCK!', '#4ade80'],
      changed: ['PAGE CHANGED - CHECK NOW', '#4ade80']
    };
    var m = map[r.state] || map.unknown;
    setStatus(m[0], m[1]);
    if (infoEl) infoEl.textContent = 'Last check: ' + now() + ' | Checks: ' + checks + ' | ' + r.detail;
  }

  function beep(times) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime + 0.05;
      for (var i = 0; i < times; i++) {
        (function (t) {
          var osc = audioCtx.createOscillator();
          var gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(t);
          osc.stop(t + 0.2);
        })(t0 + i * 0.3);
      }
    } catch (e) { /* Sound unavailable; title flash still works. */ }
  }

  function startTitleFlash() {
    if (titleTimer) return;
    var on = false;
    titleTimer = window.setInterval(function () {
      on = !on;
      document.title = on ? '[!!! CHECK TAB !!!] ' + originalTitle : originalTitle;
    }, 800);
  }

  function stopTitleFlash() {
    if (titleTimer) {
      window.clearInterval(titleTimer);
      titleTimer = null;
    }
  }

  function alertUser() {
    beep(4);
    startTitleFlash();
  }

  // --- Microsoft Store -------------------------------------------------------
  function checkMicrosoft() {
    var text = bodyText();
    var hasConsoleSection = /Choose your console/i.test(text);
    var continueBtn = $all('button').filter(function (b) {
      return /Continue to accessories/i.test(btnText(b));
    })[0] || null;
    var optionBtns = $all('button').filter(function (b) {
      return /1TB/i.test(btnText(b));
    });

    if (!hasConsoleSection && !continueBtn && optionBtns.length === 0) {
      if (Date.now() - startTime < MAX_WAIT_MS) {
        return { state: 'waiting', detail: 'Page still loading, waiting for console options.' };
      }
      return { state: 'unknown', detail: 'Console options not found after waiting. Page layout may have changed.' };
    }

    var oosBtn = optionBtns.filter(function (b) {
      return /Out of stock/i.test(btnText(b));
    })[0] || null;
    var selectable = optionBtns.filter(function (b) {
      var t = btnText(b);
      return visible(b) && !b.disabled && !/Out of stock/i.test(t) && !/Sold out/i.test(t);
    });
    var continueEnabled = !!(continueBtn && visible(continueBtn) && !continueBtn.disabled);

    if (selectable.length > 0 || continueEnabled) {
      return {
        state: 'instock',
        detail: 'Selectable option or enabled Continue found.',
        optionBtn: selectable[0] || null,
        continueBtn: continueBtn
      };
    }
    if (oosBtn || (continueBtn && continueBtn.disabled)) {
      return { state: 'oos', detail: 'Out of stock, Continue disabled.' };
    }
    return { state: 'unknown', detail: 'Option buttons found but state unclear. No alert sent.' };
  }

  // --- Best Buy --------------------------------------------------------------
  function checkBestBuy() {
    var text = bodyText();
    var buttons = $all('button').filter(visible);
    var addBtn = buttons.filter(function (b) {
      return /Add to Cart/i.test(btnText(b));
    })[0] || null;
    var comingBtn = buttons.filter(function (b) {
      return /Coming Soon/i.test(btnText(b));
    })[0] || null;
    var soldOutBtn = buttons.filter(function (b) {
      return /Sold Out/i.test(btnText(b));
    })[0] || null;
    var shipNA = /Shipping not available for this item/i.test(text);
    var pickupNA = /Pickup not available for this item/i.test(text);
    var hasSignals = !!(addBtn || comingBtn || soldOutBtn || shipNA || pickupNA);

    if (!hasSignals) {
      if (Date.now() - startTime < MAX_WAIT_MS) {
        return { state: 'waiting', detail: 'Page still loading, waiting for buy box.' };
      }
      return { state: 'unknown', detail: 'Buy box signals not found after waiting. Page layout may have changed.' };
    }
    if (addBtn && !addBtn.disabled) {
      return { state: 'instock', detail: 'Enabled Add to Cart button found.', addBtn: addBtn };
    }
    if (comingBtn && !comingBtn.disabled) {
      return { state: 'changed', detail: 'Coming Soon button is now ENABLED (text unchanged). Check manually.' };
    }
    if (comingBtn || soldOutBtn || (shipNA && pickupNA)) {
      return { state: 'oos', detail: 'Coming Soon / Sold Out / both delivery options unavailable.' };
    }
    if (!shipNA && !pickupNA && /Shipping/i.test(text)) {
      return { state: 'changed', detail: 'Not-available lines are gone. Check manually.' };
    }
    return { state: 'unknown', detail: 'Signals present but state unclear. No alert sent.' };
  }

  // --- First-click attempts (only) -------------------------------------------
  function attemptMicrosoft(result) {
    attempted = true;
    log('IN-STOCK SIGNAL. Attempting first clicks only (option + Continue).');
    try {
      if (result.optionBtn) {
        log('Clicking console option: ' + btnText(result.optionBtn));
        result.optionBtn.click();
      } else {
        log('No selectable option button captured; trying Continue directly.');
      }
    } catch (e) {
      log('Option click failed: ' + e.message);
    }
    window.setTimeout(function () {
      var cont = $all('button').filter(function (b) {
        return /Continue to accessories/i.test(btnText(b));
      })[0] || null;
      if (cont && !cont.disabled) {
        log('Clicking Continue to accessories.');
        try { cont.click(); } catch (e) { log('Continue click failed: ' + e.message); }
      } else {
        log('Continue button still disabled or missing. Stopping here for manual check.');
      }
      stopAll('ACTION TAKEN - CHECK THIS TAB NOW');
    }, 1500);
  }

  function attemptBestBuy(result) {
    attempted = true;
    log('IN-STOCK SIGNAL. Attempting Add to Cart click only.');
    try {
      log('Clicking: ' + btnText(result.addBtn));
      result.addBtn.click();
    } catch (e) {
      log('Add to Cart click failed: ' + e.message);
    }
    window.setTimeout(function () {
      stopAll('ACTION TAKEN - CHECK THIS TAB NOW');
    }, 1500);
  }

  // --- Main loop ---------------------------------------------------------------
  function tick() {
    if (!monitoring || attempted) return;
    checks++;
    var r = (SITE === 'microsoft') ? checkMicrosoft() : checkBestBuy();
    updatePanel(r);
    if (r.state === 'waiting') {
      log('Check #' + checks + ': waiting for page...');
      return;
    }
    if (r.state === 'oos') {
      log('Check #' + checks + ': UNAVAILABLE (' + r.detail + ')');
      return;
    }
    if (r.state === 'unknown') {
      log('Check #' + checks + ': UNKNOWN (' + r.detail + ')');
      return;
    }
    log('Check #' + checks + ': ' + r.state.toUpperCase() + ' (' + r.detail + ')');
    alertUser();
    var auto = autoCheckbox && autoCheckbox.checked;
    if (r.state === 'instock' && auto) {
      if (SITE === 'microsoft') attemptMicrosoft(r);
      else attemptBestBuy(r);
    } else {
      if (r.state === 'changed') log('Changed state: no auto-click, manual check needed.');
      else log('Auto-attempt is OFF. Alert only.');
      stopAll('POSSIBLE STOCK - CHECK THIS TAB NOW');
    }
  }

  function start() {
    if (monitoring) return;
    monitoring = true;
    try { window.sessionStorage.setItem(STORE_KEY, '1'); } catch (e) {}
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
    log('Monitoring started on ' + SITE + '. Checks every ' + (CHECK_MS / 1000) + 's, reload every ' + (RELOAD_MS / 1000) + 's while unavailable.');
    checkTimer = window.setInterval(tick, CHECK_MS);
    reloadTimer = window.setTimeout(function () {
      if (monitoring && !attempted) {
        log('Reloading page to re-check stock...');
        window.location.reload();
      }
    }, RELOAD_MS);
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    tick();
  }

  function stopAll(statusText) {
    monitoring = false;
    try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {}
    if (checkTimer) window.clearInterval(checkTimer);
    if (reloadTimer) window.clearTimeout(reloadTimer);
    checkTimer = null;
    reloadTimer = null;
    if (statusText) setStatus(statusText, '#fbbf24');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    log('Monitoring stopped. Sound/title alert stays until you press Stop or close the tab.');
  }

  function stopByUser() {
    stopTitleFlash();
    document.title = originalTitle;
    stopAll('Stopped.');
    log('Stopped by user.');
  }

  // --- Panel -------------------------------------------------------------------
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'x25-monitor-panel';
    panel.setAttribute('style', 'position:fixed;right:12px;bottom:12px;z-index:999999;width:320px;background:#111827;color:#f9fafb;font:13px/1.45 system-ui,Arial,sans-serif;border:1px solid #374151;border-radius:10px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);');
    panel.innerHTML =
      '<div style="font-weight:700;font-size:14px;">Xbox X25 Stock Monitor v1</div>' +
      '<div style="color:#9ca3af;font-size:12px;">' + SITE + ' &middot; DOM-only &middot; no checkout submit</div>' +
      '<div id="x25-status" style="margin:8px 0;font-weight:700;">Not started</div>' +
      '<div id="x25-info" style="color:#9ca3af;font-size:12px;">Press Start.</div>' +
      '<label style="display:block;margin:8px 0;font-size:12px;"><input id="x25-auto" type="checkbox" checked> Auto-attempt first click when in stock</label>' +
      '<div><button id="x25-start" style="margin-right:6px;">Start</button><button id="x25-stop" disabled style="margin-right:6px;">Stop</button><button id="x25-sound">Test sound</button></div>' +
      '<div id="x25-log" style="margin-top:8px;max-height:140px;overflow-y:auto;background:#030712;border:1px solid #374151;border-radius:6px;padding:6px;font:11px/1.5 monospace;white-space:pre-wrap;"></div>' +
      '<div style="color:#9ca3af;font-size:11px;margin-top:6px;">Reloads every 120s while unavailable. Run one tab per site.</div>';
    document.body.appendChild(panel);
    statusEl = $('#x25-status', panel);
    infoEl = $('#x25-info', panel);
    logEl = $('#x25-log', panel);
    autoCheckbox = $('#x25-auto', panel);
    startBtn = $('#x25-start', panel);
    stopBtn = $('#x25-stop', panel);
    startBtn.addEventListener('click', start);
    stopBtn.addEventListener('click', stopByUser);
    $('#x25-sound', panel).addEventListener('click', function () {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (e) {}
      beep(2);
      log('Test sound played.');
    });
  }

  function init() {
    if (!document.body) return;
    buildPanel();
    log('Loaded on ' + window.location.hostname + ' (' + SITE + ').');
    log('DOM-only v1. No API polling. No checkout submit, no payment entry.');
    var resume = false;
    try { resume = window.sessionStorage.getItem(STORE_KEY) === '1'; } catch (e) {}
    if (resume) {
      log('Auto-resuming after reload. Sound may need a click first; title flash still works.');
      start();
    } else {
      log('Press Start to begin monitoring this tab.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
