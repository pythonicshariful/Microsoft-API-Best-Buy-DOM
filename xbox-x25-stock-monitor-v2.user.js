// ==UserScript==
// @name         Xbox X25 Stock Monitor v2 (Microsoft API + Best Buy DOM)
// @namespace    https://pythonicshariful.tech/
// @version      2.0.0
// @description  Microsoft: polls the verified deliverycost API (isInventoryAvailable) with NO page reload. Best Buy: DOM monitor (no verified API). Alerts loudly on stock and attempts the first in-stock click only. No checkout submit, no payment entry. Verified Nov 18, 2026: Series S API=true, X25 API=false. In-stock buy chain still UNTESTED live.
// @author       pythonicshariful
// @match        https://www.microsoft.com/*/store/configure/*
// @match        https://www.microsoft.com/*/d/*xbox-series-x25*
// @match        https://www.microsoft.com/*/d/*XBOX-Series-X25*
// @match        https://www.microsoft.com/*/d/*xbox-series-s*
// @match        *://www.bestbuy.com/product/*6690019*
// @grant        GM_xmlhttpRequest
// @connect      dcc.mp.microsoft.com
// @connect      displaycatalog.mp.microsoft.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // v2 design (verified live Nov 18, 2026 by Playwright network capture):
  // MICROSOFT — POST https://dcc.mp.microsoft.com/v1.0/deliverycost/us?mode=continueOnError
  //   Anonymous: no Authorization, no Cookie. Body carries productId/skuId/
  //   availabilityId + ship-to ZIP. Signal: deliveryGroups[].lineItems[]
  //   .isInventoryAvailable (boolean). Verified: Series S 2JBX=true,
  //   X25 Q2BG=false, stable across ZIPs 95037/10001/90001. Do NOT use
  //   deliveryCosts presence/prices/dates as a signal (present even when OOS).
  //   DisplayCatalog is used ONLY to resolve productId -> skuId/availabilityId
  //   at start (its Actions list does NOT discriminate stock). Polls every
  //   8s by default, NO reload. On 2 consecutive true readings: alert, then
  //   confirm in the DOM (reload/navigate once if the page looks stale).
  // BEST BUY — no verified API (capture impossible from the checking VM).
  //   DOM monitor + 120s reload, same as v1.
  // Safety: NEVER clicks Place Order / checkout submit, NEVER fills payment
  // details, stops after its first in-stock attempt. The true->buyable chain
  // could not be tested live (X25 stayed OOS); treat the first restock as a
  // live test with a human watching the tab.
  // ---------------------------------------------------------------------------

  var SITE = window.location.hostname.indexOf('microsoft.com') !== -1 ? 'microsoft' : 'bestbuy';
  var DCC_URL = 'https://dcc.mp.microsoft.com/v1.0/deliverycost/us?mode=continueOnError';
  var DC_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products/';
  var CHECK_MS = 3000;          // Best Buy DOM checks
  var RELOAD_MS = 120000;       // Best Buy reload while unavailable
  var MAX_WAIT_MS = 25000;
  var STORE_KEY = 'x25_monitor_active_v2';
  var TRIGGER_KEY = 'x25_api_trigger_v2';

  var startTime = Date.now();
  var monitoring = false;
  var checks = 0;
  var attempted = false;
  var apiTimer = null;
  var domTimer = null;
  var reloadTimer = null;
  var verifyTimer = null;
  var titleTimer = null;
  var originalTitle = document.title;
  var audioCtx = null;

  // Microsoft API state
  var productId = null;
  var ids = null;               // { skuId, availabilityId }
  var apiInFlight = false;
  var apiErrors = 0;
  var consecutiveTrue = 0;
  var lastApi = null;           // { value, ms, at }
  var currentIntervalMs = 8000;
  var triggerReloadDone = false;
  var pendingDomVerify = false;

  var panel = null;
  var statusEl = null;
  var infoEl = null;
  var apiLineEl = null;
  var logEl = null;
  var startBtn = null;
  var stopBtn = null;
  var autoCheckbox = null;
  var zipInput = null;
  var regionInput = null;
  var intervalSelect = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function visible(el) { return !!(el && el.offsetParent !== null); }
  function btnText(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function now() { return new Date().toLocaleTimeString(); }
  function bodyText() {
    if (!document.body) return '';
    return document.body.innerText || document.body.textContent || '';
  }
  function onConfigurePage() { return /\/store\/configure\//i.test(window.location.pathname); }

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

  // --- HTTP helpers: in-page fetch first, GM_xmlhttpRequest fallback ---------
  function gmRequest(method, url, body) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === 'undefined') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }
      GM_xmlhttpRequest({
        method: method,
        url: url,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        data: body || undefined,
        timeout: 20000,
        onload: function (resp) {
          try {
            if (resp.status < 200 || resp.status >= 300) {
              var err = new Error('HTTP ' + resp.status);
              err.status = resp.status;
              reject(err);
              return;
            }
            resolve(JSON.parse(resp.responseText));
          } catch (e) { reject(e); }
        },
        onerror: function () { reject(new Error('GM request failed')); },
        ontimeout: function () { reject(new Error('GM request timeout')); }
      });
    });
  }

  function httpJson(method, url, obj) {
    var body = obj ? JSON.stringify(obj) : undefined;
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'omit'
    };
    if (body) opts.body = body;
    return fetch(url, opts).then(function (resp) {
      if (!resp.ok) {
        var err = new Error('HTTP ' + resp.status);
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    }).catch(function (e) {
      if (e && e.status) throw e; // real HTTP response: do not retry via GM
      return gmRequest(method, url, body);
    });
  }

  // --- Microsoft: resolve identifiers + poll deliverycost API ----------------
  function extractProductId() {
    var m = window.location.pathname.match(/\/([A-Za-z0-9]{12})\/?(?:[?#]|$)/);
    return m ? m[1] : null;
  }

  async function resolveIds() {
    var url = DC_URL + productId + '?market=US&languages=en-US';
    try {
      var data = await httpJson('GET', url);
      var root = (data && data.Product) || data;
      var list = (root && root.DisplaySkuAvailabilities) || [];
      for (var i = 0; i < list.length; i++) {
        var entry = list[i] || {};
        var sku = entry.Sku || entry;
        var skuId = sku.SkuId;
        var props = sku.Properties || {};
        var avails = sku.Availabilities || entry.Availabilities || [];
        if (!skuId || !avails.length || !avails[0].AvailabilityId) continue;
        if (props.IsPreOrder === true) continue;
        ids = { skuId: skuId, availabilityId: avails[0].AvailabilityId };
        log('Resolved via DisplayCatalog: skuId=' + ids.skuId + ', availabilityId=' + ids.availabilityId);
        return true;
      }
      log('DisplayCatalog returned no buyable SKU; trying fallback.');
    } catch (e) {
      log('DisplayCatalog resolve failed: ' + e.message);
    }
    if (productId && productId.toLowerCase() === '8wg5vqp0x4h3') {
      ids = { skuId: 'Q2BG', availabilityId: '8S856RCB2BDV' };
      log('Using known X25 identifiers (Q2BG / 8S856RCB2BDV) as fallback.');
      return true;
    }
    return false;
  }

  function buildDeliveryBody() {
    return {
      deliveryGroups: [{
        shipToInformation: {
          countryCode: 'US',
          postalCode: (zipInput && zipInput.value.trim()) || '95037',
          region: (regionInput && regionInput.value.trim()) || 'CA'
        },
        deliveryGroupId: 'sfwPdpDeliveryGroup',
        lineItems: [{
          availabilityId: ids.availabilityId,
          skuId: ids.skuId,
          isDeliveryRequired: true,
          productId: productId,
          quantity: 1,
          lineItemId: 'item0',
          catalogId: 1
        }]
      }],
      orderingExperience: 'Consumer'
    };
  }

  function updateApiPanel() {
    if (apiLineEl && lastApi) {
      apiLineEl.textContent = 'Last API: ' + (lastApi.value ? 'IN STOCK' : 'out of stock') +
        ' | ' + lastApi.ms + 'ms | ' + lastApi.at +
        ' | consecutive true: ' + consecutiveTrue +
        ' | every ' + (currentIntervalMs / 1000) + 's, no reload';
    }
  }

  function restartApiTimer() {
    if (apiTimer) window.clearInterval(apiTimer);
    apiTimer = window.setInterval(pollOnce, currentIntervalMs);
  }

  async function pollOnce() {
    if (!monitoring || attempted || apiInFlight || !ids) return;
    apiInFlight = true;
    var t0 = Date.now();
    try {
      var data = await httpJson('POST', DCC_URL, buildDeliveryBody());
      var groups = data && data.deliveryGroups;
      var item = groups && groups[0] && groups[0].lineItems && groups[0].lineItems[0];
      if (!item || typeof item.isInventoryAvailable !== 'boolean') {
        throw new Error('Unexpected API shape (no isInventoryAvailable)');
      }
      var ms = Date.now() - t0;
      checks++;
      apiErrors = 0;
      lastApi = { value: item.isInventoryAvailable, ms: ms, at: now() };
      if (item.isInventoryAvailable) {
        consecutiveTrue++;
        log('API check #' + checks + ': IN STOCK signal (' + ms + 'ms, consecutive=' + consecutiveTrue + ')');
        updateApiPanel();
        if (consecutiveTrue >= 2) {
          await handleApiHit();
        } else {
          setStatus('API: possible stock (1/2)...', '#fbbf24');
        }
      } else {
        consecutiveTrue = 0;
        log('API check #' + checks + ': OUT OF STOCK (' + ms + 'ms)');
        setStatus('API: OUT OF STOCK', '#f87171');
        updateApiPanel();
      }
    } catch (e) {
      apiErrors++;
      log('API check failed: ' + e.message + ' (errors in a row: ' + apiErrors + ')');
      if (e && e.status === 429 && currentIntervalMs < 60000) {
        currentIntervalMs = Math.min(currentIntervalMs * 2, 60000);
        restartApiTimer();
        log('Rate-limited (429). Backing off to every ' + (currentIntervalMs / 1000) + 's.');
      }
      setStatus('API: error, retrying...', '#fbbf24');
    } finally {
      apiInFlight = false;
    }
  }

  async function handleApiHit() {
    alertUser();
    log('API says IN STOCK twice. Confirming in the page DOM before any click.');
    if (!onConfigurePage()) {
      if (!triggerReloadDone) {
        triggerReloadDone = true;
        try { window.sessionStorage.setItem(TRIGGER_KEY, '1'); } catch (e) {}
        var target = window.location.origin + window.location.pathname.replace(/\/d\//i, '/store/configure/') + window.location.search;
        log('Not on the configure page. Navigating to: ' + target);
        window.location.href = target;
      } else {
        log('API true but still not on configure page after navigation. Resuming API polling.');
        consecutiveTrue = 0;
      }
      return;
    }
    var dom = checkMicrosoft();
    if (dom.state === 'instock') {
      var auto = autoCheckbox && autoCheckbox.checked;
      if (auto) attemptMicrosoft(dom);
      else {
        log('Auto-attempt is OFF. Alert only.');
        stopAll('POSSIBLE STOCK - CHECK THIS TAB NOW');
      }
      return;
    }
    if (!triggerReloadDone) {
      triggerReloadDone = true;
      try { window.sessionStorage.setItem(TRIGGER_KEY, '1'); } catch (e) {}
      log('API true but page DOM still shows unavailable (stale page). Reloading once to refresh the DOM.');
      window.location.reload();
      return;
    }
    log('API true but DOM still unavailable after reload. Resuming API polling (no more reloads for this episode).');
    consecutiveTrue = 0;
  }

  // After an API-hit reload/navigation: verify the DOM first, then resume API.
  function startDomVerifyLoop() {
    var waited = 0;
    log('Verifying the page DOM after API hit (up to 25s)...');
    verifyTimer = window.setInterval(function () {
      waited += 2000;
      var dom = checkMicrosoft();
      if (dom.state === 'instock') {
        window.clearInterval(verifyTimer);
        verifyTimer = null;
        alertUser();
        log('DOM confirms a selectable option.');
        var auto = autoCheckbox && autoCheckbox.checked;
        if (auto) attemptMicrosoft(dom);
        else stopAll('POSSIBLE STOCK - CHECK THIS TAB NOW');
        return;
      }
      if (waited >= MAX_WAIT_MS) {
        window.clearInterval(verifyTimer);
        verifyTimer = null;
        log('DOM still unavailable after reload. Resuming API polling.');
        consecutiveTrue = 0;
        startApiLoop();
      }
    }, 2000);
  }

  function startApiLoop() {
    restartApiTimer();
    pollOnce();
  }

  // --- DOM checks (Microsoft configure + Best Buy) ----------------------------
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
    log('IN-STOCK CONFIRMED. Attempting first clicks only (option + Continue).');
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

  // --- Best Buy DOM loop (no verified API) -------------------------------------
  function tickBestBuy() {
    if (!monitoring || attempted) return;
    checks++;
    var r = checkBestBuy();
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
    if (r.state === 'waiting') { log('Check #' + checks + ': waiting for page...'); return; }
    if (r.state === 'oos') { log('Check #' + checks + ': UNAVAILABLE (' + r.detail + ')'); return; }
    if (r.state === 'unknown') { log('Check #' + checks + ': UNKNOWN (' + r.detail + ')'); return; }
    log('Check #' + checks + ': ' + r.state.toUpperCase() + ' (' + r.detail + ')');
    alertUser();
    var auto = autoCheckbox && autoCheckbox.checked;
    if (r.state === 'instock' && auto) {
      attemptBestBuy(r);
    } else {
      if (r.state === 'changed') log('Changed state: no auto-click, manual check needed.');
      else log('Auto-attempt is OFF. Alert only.');
      stopAll('POSSIBLE STOCK - CHECK THIS TAB NOW');
    }
  }

  // --- Start / stop --------------------------------------------------------------
  async function start() {
    if (monitoring) return;
    monitoring = true;
    try { window.sessionStorage.setItem(STORE_KEY, '1'); } catch (e) {}
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    if (SITE === 'microsoft') {
      productId = extractProductId();
      if (!productId) {
        log('Could not find a product id in this page URL. Monitoring stopped.');
        stopAll('UNKNOWN - no product id in URL');
        return;
      }
      log('Microsoft API mode. Product id: ' + productId + '. No page reload while polling.');
      setStatus('Resolving SKU...', '#fbbf24');
      var ok = await resolveIds();
      if (!ok || !ids) {
        log('Could not resolve skuId/availabilityId. Monitoring stopped (no blind polling).');
        stopAll('UNKNOWN - could not resolve SKU');
        return;
      }
      if (pendingDomVerify) {
        pendingDomVerify = false;
        startDomVerifyLoop();
      } else {
        log('Polling deliverycost API every ' + (currentIntervalMs / 1000) + 's. Needs 2 true readings in a row, then DOM confirmation.');
        startApiLoop();
      }
    } else {
      log('Best Buy DOM mode (no verified API). Checks every ' + (CHECK_MS / 1000) + 's, reload every ' + (RELOAD_MS / 1000) + 's while unavailable.');
      domTimer = window.setInterval(tickBestBuy, CHECK_MS);
      reloadTimer = window.setTimeout(function () {
        if (monitoring && !attempted) {
          log('Reloading page to re-check stock...');
          window.location.reload();
        }
      }, RELOAD_MS);
      tickBestBuy();
    }
  }

  function stopAll(statusText) {
    monitoring = false;
    try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {}
    if (apiTimer) window.clearInterval(apiTimer);
    if (domTimer) window.clearInterval(domTimer);
    if (reloadTimer) window.clearTimeout(reloadTimer);
    if (verifyTimer) window.clearInterval(verifyTimer);
    apiTimer = null;
    domTimer = null;
    reloadTimer = null;
    verifyTimer = null;
    if (statusText) setStatus(statusText, '#fbbf24');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    log('Monitoring stopped. Sound/title alert stays until you press Stop or close the tab.');
  }

  function stopByUser() {
    stopTitleFlash();
    document.title = originalTitle;
    try { window.sessionStorage.removeItem(TRIGGER_KEY); } catch (e) {}
    stopAll('Stopped.');
    log('Stopped by user.');
  }

  // --- Panel -------------------------------------------------------------------
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'x25-monitor-panel';
    panel.setAttribute('style', 'position:fixed;right:12px;bottom:12px;z-index:999999;width:330px;background:#111827;color:#f9fafb;font:13px/1.45 system-ui,Arial,sans-serif;border:1px solid #374151;border-radius:10px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);');
    var modeLine = SITE === 'microsoft'
      ? 'Microsoft API mode &middot; no reload &middot; no checkout submit'
      : 'Best Buy DOM mode &middot; no verified API &middot; no checkout submit';
    var msRows = '';
    if (SITE === 'microsoft') {
      msRows =
        '<div style="margin:8px 0;font-size:12px;">ZIP <input id="x25-zip" value="95037" style="width:70px;"> ' +
        'Region <input id="x25-region" value="CA" style="width:44px;"> ' +
        'Every <select id="x25-interval"><option value="5000">5s</option><option value="8000" selected>8s</option><option value="15000">15s</option><option value="30000">30s</option></select></div>' +
        '<div id="x25-api" style="color:#9ca3af;font-size:12px;">API: not started.</div>';
    }
    panel.innerHTML =
      '<div style="font-weight:700;font-size:14px;">Xbox X25 Stock Monitor v2</div>' +
      '<div style="color:#9ca3af;font-size:12px;">' + modeLine + '</div>' +
      '<div id="x25-status" style="margin:8px 0;font-weight:700;">Not started</div>' +
      '<div id="x25-info" style="color:#9ca3af;font-size:12px;">Press Start.</div>' +
      msRows +
      '<label style="display:block;margin:8px 0;font-size:12px;"><input id="x25-auto" type="checkbox" checked> Auto-attempt first click when in stock</label>' +
      '<div><button id="x25-start" style="margin-right:6px;">Start</button><button id="x25-stop" disabled style="margin-right:6px;">Stop</button><button id="x25-sound">Test sound</button></div>' +
      '<div id="x25-log" style="margin-top:8px;max-height:140px;overflow-y:auto;background:#030712;border:1px solid #374151;border-radius:6px;padding:6px;font:11px/1.5 monospace;white-space:pre-wrap;"></div>' +
      '<div style="color:#9ca3af;font-size:11px;margin-top:6px;">Run one tab per site. Microsoft: no reload while polling. Best Buy: reloads every 120s.</div>';
    document.body.appendChild(panel);
    statusEl = $('#x25-status', panel);
    infoEl = $('#x25-info', panel);
    apiLineEl = $('#x25-api', panel);
    logEl = $('#x25-log', panel);
    autoCheckbox = $('#x25-auto', panel);
    startBtn = $('#x25-start', panel);
    stopBtn = $('#x25-stop', panel);
    zipInput = $('#x25-zip', panel);
    regionInput = $('#x25-region', panel);
    intervalSelect = $('#x25-interval', panel);
    startBtn.addEventListener('click', start);
    stopBtn.addEventListener('click', stopByUser);
    if (intervalSelect) {
      intervalSelect.addEventListener('change', function () {
        currentIntervalMs = parseInt(intervalSelect.value, 10) || 8000;
        if (monitoring && SITE === 'microsoft') restartApiTimer();
        log('Poll interval set to every ' + (currentIntervalMs / 1000) + 's.');
      });
    }
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
    log('Loaded v2 on ' + window.location.hostname + ' (' + SITE + ').');
    if (SITE === 'microsoft') {
      log('Microsoft: deliverycost API polling, no reload. Best Buy tab uses DOM mode.');
    } else {
      log('Best Buy: DOM mode. No verified API. No checkout submit, no payment entry.');
    }
    var resume = false;
    try {
      resume = window.sessionStorage.getItem(STORE_KEY) === '1';
      if (window.sessionStorage.getItem(TRIGGER_KEY) === '1') {
        window.sessionStorage.removeItem(TRIGGER_KEY);
        triggerReloadDone = true;
        pendingDomVerify = true;
      }
    } catch (e) {}
    if (resume) {
      log('Auto-resuming. Sound may need a click first; title flash still works.');
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
