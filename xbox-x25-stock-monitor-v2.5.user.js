// ==UserScript==
// @name         Xbox X25 Stock Monitor v2.5 (Microsoft API + Best Buy DOM)
// @namespace    https://pythonicshariful.tech/
// @version      2.5.0
// @description  Microsoft: polls the verified deliverycost API (isInventoryAvailable) with NO page reload. Console option is found by its stable test id (configuratorV35-selection-group-option-button-*) with capacity read from its aria-labelledby card element-by-element (never on joined text), and its selection is VERIFIED (aria-pressed / card is-checked) before Continue is clicked; a pre-selected option is never toggled off. Continue is found by its test id (configuratorV35-BottomBar-next-button); after Step 2 Accessories loads, Review and checkout is clicked by its test id (configuratorV35-BottomBar-checkout-button) and the script polls up to 25s for the next state (navigation / sign-in prompt / review-cart heading), then stops for a human. Every click first scrolls the button into the middle of the viewport, then runs a fast human-like pointer sequence with random movement. Best Buy: DOM monitor (no verified API). No checkout submit, no sign-in, no payment entry. Verified live Nov 19, 2026: synthetic click sequence loads Step 2 Accessories on an in-stock refurbished Series S, and the Review and checkout click registers (button disables = processing).
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
  // v2.1 fix (Nov 19, 2026, live test on Xbox Series X Certified
  // Refurbished): v2 matched console options ONLY as <button> elements whose
  // textContent contains "1TB". On the refurbished page the 1TB option is a
  // button in the accessibility tree but v2 found no matching button, so it
  // clicked Continue with nothing selected and the page answered "Please
  // make a choice" (cart stayed 0). v2.1 matches capacity text
  // (512GB/1TB/2TB, spacing-tolerant) in textContent OR aria-label across
  // button / [role=button|radio|option] / radio input / label, prefers the
  // innermost match inside "Choose your console", and NEVER clicks
  // Continue unless the option is verified selected (aria-pressed /
  // aria-checked / checked / selected class / summary update). An enabled
  // Continue alone is NOT an in-stock signal any more. After Continue, v2.1
  // checks Step 2 loaded ("Add your accessories" / "Review and checkout");
  // on "Please make a choice" it retries the option+Continue once, then
  // stops for a human.
  // v2.2 fix (Nov 19, 2026, live test on Xbox Series S Certified
  // Refurbished, 512GB $399.99): v2.1 found NO option for 25s on this page
  // and never clicked. Live inspection showed why: (1) the 512 GB option is
  // a PRE-SELECTED toggle button (checked true on load) — clicking it once
  // DESELECTS it, so a blind option click breaks the flow; (2) the "512 GB"
  // text lives in the card heading, not in the button's own textContent, so
  // textContent/aria-label matching missed it. v2.2 matches capacity text
  // in the button's own text, aria-label, aria-labelledby targets, AND its
  // parent card text; it checks selection FIRST and skips the option click
  // entirely when already selected; and it clicks with humanClick() — a fast
  // (~100-370ms) random-waypoint pointer sequence (pointerover/move/down/up
  // + click) with a small visible cursor dot. NOTE: synthetic events are
  // still isTrusted=false — no userscript can produce trusted input; the
  // sequence only fires the same handlers a real click fires, with random
  // timing. On a DOM-confirm failure v2.2 logs one diagnostics line listing
  // capacity-text elements, so the next miss is debuggable from the log.
  // v2.3 fix (Nov 19, 2026, Shariful's retest: v2.2 still did not click /
  // the click did nothing): humanClick() now SCROLLS the target into the
  // middle of the viewport first (smooth scroll, ~700ms settle), and only
  // then computes the button's position and runs the pointer sequence.
  // Reason: a button below the fold may not be rendered/hydrated until it
  // is scrolled into view, so clicking it cold can silently do nothing;
  // a real human always scrolls to the button before clicking it. The
  // scroll applies to both click sites (console option and Continue).
  // If the button still has no size after scrolling, the old el.click()
  // fallback is kept.
  // v2.4 fix (Nov 19, 2026, Playwright live probe of the real page):
  // v2.3 STILL found no option, and the probe showed why — the real
  // structure is NOT a button with text. The console option is an empty
  // <button class="option-button" aria-labelledby="<li id>"
  // data-automation-test-id="configuratorV35-selection-group-option-button-*">
  // (no textContent, no aria-label) sitting inside an <li> card whose
  // <h4> says "512 GB". Two traps: (1) the li's joined textContent is
  // "Save $100.00512 GB..." — no space between the badge and the title —
  // so /\b512/ NEVER matches the joined text (no word boundary after a
  // digit); capacity must be checked element-by-element (the <h4>'s own
  // text is exactly "512 GB"). (2) The button IS visible (offsetParent
  // = the li, 527x95px) — visibility was never the problem. v2.4 finds
  // the option by its stable test-id prefix and reads capacity from its
  // aria-labelledby card element-by-element; selection is read from
  // aria-pressed on the button OR is-checked/aria-current on the card.
  // Continue is found by its verified test id
  // configuratorV35-BottomBar-next-button (exactly 1 on the page).
  // LIVE-PROVEN Nov 19, 2026 (headless Chromium on the real S refurb
  // page): the v2.3 pointer sequence DOES load Step 2 Accessories —
  // synthetic clicks work on this page; the failures were all in the
  // finder, never in the click.
  // v2.5 (Nov 19, 2026, Shariful's request after v2.4 worked: "when
  // this button click it" — the Review and checkout button,
  // data-automation-test-id="configuratorV35-BottomBar-checkout-button",
  // stpidx=1, on Step 2 Accessories): after Step 2 loads, the script
  // now ALSO clicks Review and checkout — a navigation step only, it
  // does NOT place an order or enter payment. Live-proven Nov 19: the
  // synthetic click REGISTERS on this button (it goes disabled=true,
  // its processing state), but the page had not navigated after 5s, so
  // v2.5 polls reviewState() every 1s for up to 25s for the next state:
  // URL navigation (e.g. login.live.com when signed out), a sign-in
  // prompt, or a review/cart heading — then it alerts and stops for a
  // human. If the button re-enables (click did not take), it retries
  // once. The heading check is scoped to h1/h2 and to phrases that do
  // NOT appear on Step 2 ("Review your order", "Your cart") — a bare
  // "Checkout" match would false-fire on the button's own text.
  // Safety unchanged: NEVER clicks Place Order / checkout submit,
  // NEVER signs in, NEVER fills payment. Sign-in and payment stay
  // manual, by the buyer on his own account.
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
  var step2Retried = false;

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
    logDomDiagnostics();
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
        logDomDiagnostics();
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

  // --- Microsoft console-option finder (v2.4) ----------------------------------
  // LIVE STRUCTURE (probed Nov 19, 2026 on the real S refurbished page):
  //   <li id="<sku>-0-0-0" class="selection-group-option-v35 [is-checked]"
  //       aria-current="true"
  //       data-automation-test-id="configuratorV35-selection-group-option-<sku>-0-0-0">
  //     <div class="option-badge">Save $100.00</div>
  //     <div class="option-body"><h4>512 GB</h4> ... $499.99 / $399.99 ...</div>
  //     <button class="option-button" tabindex="0" aria-labelledby="<li id>"
  //       aria-pressed="true|false"
  //       data-automation-test-id="configuratorV35-selection-group-option-button-<sku>-0-0-0"></button>
  //   </li>
  // The button is EMPTY (no textContent, no aria-label); its name comes
  // from aria-labelledby -> the li card. TRAP: the li's JOINED textContent
  // is "Save $100.00512 GB..." (no space between badge and title), so
  // /\b512/ never matches it. Capacity MUST be checked element-by-element
  // (the <h4>'s own text is exactly "512 GB"). The button is visible
  // (offsetParent = the li, ~527x95px) — visibility was never the problem.
  function ownLabel(el) {
    var t = '';
    try {
      t = (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '');
      var labelledby = el.getAttribute('aria-labelledby') || '';
      if (labelledby) {
        labelledby.split(/\s+/).forEach(function (id) {
          var ref = id && document.getElementById(id);
          if (ref) t += ' ' + (ref.textContent || '');
        });
      }
    } catch (e) { t = ''; }
    return t.replace(/\s+/g, ' ').trim();
  }

  // Display label: own text plus the parent card text (the capacity heading
  // often sits next to the button, not inside it).
  function optionLabel(el) {
    var t = ownLabel(el);
    try {
      if (el.parentElement) t += ' | ' + (el.parentElement.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (e) {}
    return t.slice(0, 160);
  }

  function hasCapacity(t) {
    return /\b(512\s*GB|1\s*TB|2\s*TB)\b/i.test(t || '');
  }

  // Capacity, checked element-by-element: the element itself and every
  // descendant, each on its OWN textContent. Never test a container's
  // joined textContent — adjacent child texts run together with no space
  // ("$100.00512 GB") and the \b anchor fails.
  function capacityInSubtree(el) {
    if (!el) return false;
    try {
      if (hasCapacity(el.textContent || '')) return true;
      var kids = el.querySelectorAll('*');
      for (var i = 0; i < kids.length; i++) {
        if (hasCapacity(kids[i].textContent || '')) return true;
      }
    } catch (e) {}
    return false;
  }

  // The li card a v35 option button labels (via aria-labelledby).
  function labelledCard(el) {
    try {
      var lb = el.getAttribute('aria-labelledby') || '';
      var ids = lb.split(/\s+/);
      for (var i = 0; i < ids.length; i++) {
        var ref = ids[i] && document.getElementById(ids[i]);
        if (ref) return ref;
      }
    } catch (e) {}
    return null;
  }

  function consoleSection() {
    var heads = $all('h1, h2, h3, h4, [role="heading"]').filter(function (h) {
      return /Choose your console/i.test(h.textContent || '');
    });
    if (!heads.length) return null;
    var node = heads[0];
    for (var i = 0; i < 4 && node.parentElement; i++) {
      node = node.parentElement;
      if (/^(SECTION|FIELDSET|DIV|MAIN|FORM)$/.test(node.tagName) &&
          node.querySelectorAll('button, [role="button"]').length > 0) return node;
    }
    return heads[0].parentElement;
  }

  function findOptionCandidates() {
    var cands = [];
    // PRIMARY (v2.4): the real v35 option buttons, by stable test id.
    // Capacity is read from the labelled card, element-by-element.
    // No visible() requirement here: the test id + labelled capacity is
    // already precise, and dispatch works on the element regardless.
    var optBtns = $all('button[data-automation-test-id^="configuratorV35-selection-group-option-button-"]');
    optBtns.forEach(function (b) {
      if (panel && panel.contains(b)) return;
      if (b.disabled) return;
      var card = labelledCard(b);
      if (!card) return;
      if (!capacityInSubtree(card)) return;
      cands.push(b);
    });
    if (cands.length) return cands;
    // FALLBACK (v2.1-v2.3): generic capacity matching, for configurator
    // variants without the v35 test ids.
    var els = $all('button, [role="button"], [role="radio"], [role="option"], input[type="radio"], label');
    var section = consoleSection();
    var fb = els.filter(function (el) {
      if (panel && panel.contains(el)) return false;
      if (el.disabled) return false;
      if (!visible(el)) return false;
      var own = ownLabel(el);
      if (/Continue to accessories|Review and checkout/i.test(own)) return false;
      if (/Out of stock|Sold out/i.test(own)) return false;
      if (hasCapacity(own)) return true;
      if (capacityInSubtree(el)) return true;
      // Capacity text may live in the card heading next to the button.
      // Only trust the parent text when the element itself looks like a
      // product card (it shows a price).
      if (/\$/.test(own)) {
        try {
          if (el.parentElement && capacityInSubtree(el.parentElement)) return true;
        } catch (e) {}
      }
      return false;
    });
    // Keep the innermost match when a card wraps its own button/label.
    fb = fb.filter(function (c) {
      return !fb.some(function (o) { return o !== c && c.contains(o); });
    });
    // Prefer candidates inside the "Choose your console" section.
    fb.sort(function (a, b) {
      var sa = (section && section.contains(a)) ? 0 : 1;
      var sb = (section && section.contains(b)) ? 0 : 1;
      return sa - sb;
    });
    return fb;
  }

  function isOptionSelected(el) {
    if (!el) return false;
    try {
      if (el.checked === true) return true;
      if (el.getAttribute('aria-pressed') === 'true') return true;
      if (el.getAttribute('aria-checked') === 'true') return true;
      if (el.getAttribute('aria-selected') === 'true') return true;
      if (el.getAttribute('data-selected') === 'true') return true;
      var cls = el.className;
      cls = (cls && cls.baseVal !== undefined) ? cls.baseVal : cls;
      if (/\b(selected|active|pressed|is-checked)\b/i.test(String(cls || ''))) return true;
      // v2.4: the v35 card itself carries the state.
      var card = labelledCard(el);
      if (card) {
        var ccls = card.className;
        ccls = (ccls && ccls.baseVal !== undefined) ? ccls.baseVal : ccls;
        if (/\bis-checked\b/.test(String(ccls || ''))) return true;
        if (card.getAttribute('aria-current') === 'true') return true;
      }
    } catch (e) {}
    return /has been added to summary/i.test(bodyText());
  }

  function findContinueBtn() {
    // v2.4: stable test id first (verified live: exactly 1 on the page).
    var byId = document.querySelector('[data-automation-test-id="configuratorV35-BottomBar-next-button"]');
    if (byId) return byId;
    return $all('button, [role="button"]').filter(function (b) {
      return /Continue to accessories/i.test(ownLabel(b));
    })[0] || null;
  }

  function findReviewBtn() {
    // v2.5: stable test id first (verified live Nov 19: exactly 1 on
    // Step 2, class "btn btn-primary btn-block mt-3", not disabled).
    var byId = document.querySelector('[data-automation-test-id="configuratorV35-BottomBar-checkout-button"]');
    if (byId) return byId;
    return $all('button, [role="button"]').filter(function (b) {
      return /^\s*Review and checkout\s*$/i.test(ownLabel(b));
    })[0] || null;
  }

  // What the page looks like AFTER the Review and checkout click.
  // Heading check is scoped to h1/h2 and to phrases that do NOT appear
  // on Step 2 — a bare "Checkout" match would false-fire on the
  // button's own text, and the page header always shows "Sign in", so
  // the sign-in test needs the "to continue" phrasing, the login host,
  // or a password field.
  function reviewState(beforeUrl) {
    var rc = findReviewBtn();
    var heads = $all('h1, h2').map(function (h) {
      return (h.textContent || '').trim();
    }).join(' | ');
    var t = bodyText();
    return {
      navigated: window.location.href !== beforeUrl,
      url: window.location.href,
      signIn: /Sign in to continue|Sign in with your Microsoft account|login\.live\.com/i.test(t) ||
        !!document.querySelector('input[type="password"]'),
      reviewHeading: /Review your order|Review and pay|Your cart/i.test(heads) ||
        /Review your order|Your cart/i.test(t),
      buttonPresent: !!rc,
      buttonDisabled: rc ? rc.disabled : null
    };
  }

  // --- Human-like click (v2.2) -------------------------------------------------
  // Fast (~100-370ms) random-waypoint pointer sequence with a small visible
  // cursor dot. This fires the same handlers a real click fires, with random
  // timing — but the events are still synthetic (isTrusted=false). No
  // userscript can produce trusted input; only browser-automation (CDP)
  // input is trusted.
  var cursorDot = null;
  var lastCursor = null;

  function showCursor(x, y) {
    try {
      if (!cursorDot) {
        cursorDot = document.createElement('div');
        cursorDot.setAttribute('style', 'position:fixed;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #2563eb;border-radius:50%;background:rgba(37,99,235,.25);z-index:1000000;pointer-events:none;');
        document.body.appendChild(cursorDot);
      }
      cursorDot.style.display = 'block';
      cursorDot.style.left = x + 'px';
      cursorDot.style.top = y + 'px';
    } catch (e) {}
  }

  function hideCursor() {
    try { if (cursorDot) cursorDot.style.display = 'none'; } catch (e) {}
  }

  function dispatchPointer(el, type, x, y) {
    var opts = {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0,
      buttons: (type === 'pointerdown' || type === 'mousedown') ? 1 : 0
    };
    try { el.dispatchEvent(new PointerEvent(type, opts)); } catch (e) {
      try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (e2) {}
    }
  }

  function humanClick(el, done) {
    // A human scrolls the button into view BEFORE clicking. A button below
    // the fold may not be rendered/hydrated until it is scrolled into
    // view, so clicking it cold can silently do nothing.
    log('Scrolling the button into view first, then clicking.');
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (e) {
      try { el.scrollIntoView(true); } catch (e2) {}
    }
    window.setTimeout(function () {
      var r = null;
      try { r = el.getBoundingClientRect(); } catch (e) { r = null; }
      if (!r || (r.width === 0 && r.height === 0)) {
        try { el.click(); } catch (e) {}
        if (done) done();
        return;
      }
      var tx = r.left + r.width * (0.35 + Math.random() * 0.3);
      var ty = r.top + r.height * (0.35 + Math.random() * 0.3);
      var sx = lastCursor ? lastCursor.x : window.innerWidth / 2;
      var sy = lastCursor ? lastCursor.y : window.innerHeight / 2;
      var points = [];
      var n = 2 + Math.floor(Math.random() * 2);
      for (var i = 1; i <= n; i++) {
        var f = i / (n + 1);
        points.push({
          x: sx + (tx - sx) * f + (Math.random() * 24 - 12),
          y: sy + (ty - sy) * f + (Math.random() * 24 - 12)
        });
      }
      points.push({ x: tx, y: ty });
      showCursor(sx, sy);
      dispatchPointer(el, 'pointerover', sx, sy);
      try { el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, cancelable: true, clientX: sx, clientY: sy, pointerType: 'mouse', isPrimary: true })); } catch (e) {}
      var i = 0;
      (function step() {
        if (i < points.length) {
          var p = points[i++];
          lastCursor = { x: p.x, y: p.y };
          showCursor(p.x, p.y);
          dispatchPointer(el, 'pointermove', p.x, p.y);
          window.setTimeout(step, 30 + Math.random() * 60);
        } else {
          dispatchPointer(el, 'pointerdown', tx, ty);
          dispatchPointer(el, 'mousedown', tx, ty);
          window.setTimeout(function () {
            dispatchPointer(el, 'pointerup', tx, ty);
            dispatchPointer(el, 'mouseup', tx, ty);
            try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: tx, clientY: ty, button: 0 })); } catch (e) { try { el.click(); } catch (e2) {} }
            hideCursor();
            if (done) done();
          }, 40 + Math.random() * 60);
        }
      })();
    }, 700);
  }

  function logDomDiagnostics() {
    try {
      var sec = consoleSection();
      var scope = sec || document.body;
      var all = Array.prototype.slice.call(scope.querySelectorAll('*'));
      var cap = all.filter(function (el) {
        return /\b(512\s*GB|1\s*TB|2\s*TB)\b/i.test((el.textContent || '').replace(/\s+/g, ' '));
      });
      log('DOM diagnostics: ' + cap.length + ' element(s) with capacity text in console section; ' +
        cap.slice(0, 3).map(function (el) {
          return el.tagName + '[' + (el.getAttribute('role') || '') + ']:"' +
            (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) + '"';
        }).join(' | '));
      var optBtns = $all('button[data-automation-test-id^="configuratorV35-selection-group-option-button-"]');
      log('DOM diagnostics: ' + optBtns.length + ' v35 option button(s): ' +
        optBtns.map(function (b) {
          return (b.getAttribute('data-automation-test-id') || '').replace('configuratorV35-selection-group-option-button-', '') +
            ' pressed=' + b.getAttribute('aria-pressed');
        }).join(', '));
    } catch (e) {
      log('DOM diagnostics unavailable: ' + e.message);
    }
  }

  // --- DOM checks (Microsoft configure + Best Buy) ----------------------------
  function checkMicrosoft() {
    var text = bodyText();
    var hasConsoleSection = /Choose your console/i.test(text);
    var continueBtn = findContinueBtn();
    var cands = findOptionCandidates();

    if (!hasConsoleSection && !continueBtn && cands.length === 0) {
      if (Date.now() - startTime < MAX_WAIT_MS) {
        return { state: 'waiting', detail: 'Page still loading, waiting for console options.' };
      }
      return { state: 'unknown', detail: 'Console options not found after waiting. Page layout may have changed.' };
    }

    // A selectable console option is REQUIRED. An enabled Continue alone is
    // NOT a stock signal: Continue can be enabled before any option is
    // chosen, and clicking it then only shows "Please make a choice".
    if (cands.length > 0) {
      return {
        state: 'instock',
        detail: 'Selectable console option found: ' + optionLabel(cands[0]).slice(0, 80),
        optionBtn: cands[0],
        continueBtn: continueBtn
      };
    }
    var anyCapacity = $all('button, [role="button"], [role="radio"], [role="option"], input[type="radio"], label').some(function (el) {
      if (panel && panel.contains(el)) return false;
      return hasCapacity(ownLabel(el));
    });
    if (anyCapacity || (continueBtn && continueBtn.disabled)) {
      return { state: 'oos', detail: 'Console option unavailable (marked Out of stock / Sold out) or Continue disabled.' };
    }
    return { state: 'unknown', detail: 'No selectable console option found. No alert sent.' };
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
    var opt = result.optionBtn;
    if (!opt) {
      log('No console option captured. NOT clicking Continue (it would only show "Please make a choice").');
      alertUser();
      stopAll('OPTION NOT FOUND - CHECK THIS TAB NOW');
      return;
    }
    // Toggle-aware: some options are PRE-SELECTED on load. Clicking one
    // would DESELECT it, so skip the option click when already selected.
    if (isOptionSelected(opt)) {
      log('Option already selected on load (pre-selected toggle). Skipping option click.');
      clickContinueVerified();
      return;
    }
    log('Clicking console option: ' + optionLabel(opt).slice(0, 100));
    humanClick(opt, function () {
      window.setTimeout(function () { afterOptionClick(0); }, 600);
    });
  }

  function clickContinueVerified() {
    var cont = findContinueBtn();
    if (cont && !cont.disabled) {
      log('Clicking Continue to accessories.');
      humanClick(cont, function () {
        window.setTimeout(verifyStep2, 2500);
      });
    } else {
      log('Continue button missing or disabled after selection. Stopping here for manual check.');
      alertUser();
      stopAll('CHECK THIS TAB NOW');
    }
  }

  function afterOptionClick(retriesUsed) {
    var opt = findOptionCandidates()[0] || null;
    if (opt && isOptionSelected(opt)) {
      log('Option verified selected.');
      clickContinueVerified();
      return;
    }
    if (retriesUsed < 1) {
      log('Option did not look selected after the click. Retrying the option click once.');
      var retryOpt = findOptionCandidates()[0] || null;
      if (retryOpt) {
        humanClick(retryOpt, function () {
          window.setTimeout(function () { afterOptionClick(retriesUsed + 1); }, 600);
        });
        return;
      }
    }
    log('Option still not selected. NOT clicking Continue.');
    alertUser();
    stopAll('OPTION NOT SELECTED - CHECK THIS TAB NOW');
  }

  function verifyStep2() {
    var t = bodyText();
    if (/Please make a choice/i.test(t)) {
      log('Validation appeared: "Please make a choice". The option selection did not stick.');
      if (!step2Retried) {
        step2Retried = true;
        log('Retrying once: re-selecting the option, then Continue.');
        var opt = findOptionCandidates()[0] || null;
        if (opt) {
          if (isOptionSelected(opt)) {
            clickContinueVerified();
          } else {
            humanClick(opt, function () {
              window.setTimeout(function () {
                if (isOptionSelected(findOptionCandidates()[0] || null)) {
                  clickContinueVerified();
                } else {
                  log('Retry did not reach Step 2. Stopping for manual check.');
                  alertUser();
                  stopAll('VALIDATION - CHECK THIS TAB NOW');
                }
              }, 600);
            });
          }
          return;
        }
      }
      alertUser();
      stopAll('VALIDATION - CHECK THIS TAB NOW');
      return;
    }
    if (/Add your accessories/i.test(t) || /Review and checkout/i.test(t)) {
      log('Step 2 Accessories loaded. Continuing to Review and checkout.');
      clickReviewAndCheckout();
      return;
    } else {
      log('Continue clicked; next step unclear. Stopping for manual check.');
      stopAll('ACTION TAKEN - CHECK THIS TAB NOW');
    }
  }

  // --- Review and checkout (v2.5, navigation only) ----------------------
  // Clicks Review and checkout, then polls up to 25s for the next
  // state. Never signs in, never clicks Place Order / submit.
  function clickReviewAndCheckout() {
    clickReviewButton(window.location.href, 0);
  }

  function clickReviewButton(beforeUrl, retriesUsed) {
    var rc = findReviewBtn();
    if (!rc || rc.disabled) {
      log('Review and checkout button missing or disabled. Stopping here for manual check.');
      alertUser();
      stopAll('REVIEW - CHECK THIS TAB NOW');
      return;
    }
    log('Clicking Review and checkout.');
    var startMs = Date.now();
    humanClick(rc, function () {
      window.setTimeout(function () {
        verifyReviewClick(beforeUrl, retriesUsed || 0, startMs);
      }, 1500);
    });
  }

  function verifyReviewClick(beforeUrl, retriesUsed, startMs) {
    var s = reviewState(beforeUrl);
    if (s.navigated || s.signIn || s.reviewHeading) {
      var where = s.navigated ? ('navigated to ' + s.url) :
        (s.signIn ? 'sign-in prompt shown' : 'review/cart page shown');
      log('Review and checkout clicked — ' + where + '. Stopping here: sign-in and payment are manual.');
      alertUser();
      stopAll('REVIEW - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonPresent) {
      log('Review and checkout button is gone and the page did not navigate. Stopping for manual check.');
      alertUser();
      stopAll('REVIEW - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonDisabled && retriesUsed < 1) {
      log('Review button is enabled again — the click may not have registered. Retrying once.');
      clickReviewButton(beforeUrl, retriesUsed + 1);
      return;
    }
    if (Date.now() - startMs > 25000) {
      log('Review and checkout clicked but the page did not move within 25s (button ' +
        (s.buttonDisabled ? 'still disabled/processing' : 'enabled') +
        '). Check the tab — a real mouse click may be needed.');
      alertUser();
      stopAll('REVIEW - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () {
      verifyReviewClick(beforeUrl, retriesUsed, startMs);
    }, 1000);
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
      '<div style="font-weight:700;font-size:14px;">Xbox X25 Stock Monitor v2.3</div>' +
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
    log('Loaded v2.3 on ' + window.location.hostname + ' (' + SITE + ').');
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
