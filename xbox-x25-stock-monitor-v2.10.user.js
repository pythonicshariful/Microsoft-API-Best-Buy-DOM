// ==UserScript==
// @name         Xbox X25 Stock Monitor v2.10 (Microsoft API + Best Buy DOM)
// @namespace    https://pythonicshariful.tech/
// @version      2.10.0
// @description  Microsoft: polls the verified deliverycost API (isInventoryAvailable) with NO page reload, at a RANDOM delay between each check (min/max seconds from the panel, default 4-12s) so the traffic does not look like a fixed metronome. Console option is found by its stable test id (configuratorV35-selection-group-option-button-*) with capacity read from its aria-labelledby card element-by-element (never on joined text), and its selection is VERIFIED (aria-pressed / card is-checked) before Continue is clicked; a pre-selected option is never toggled off. Continue is found by its test id (configuratorV35-BottomBar-next-button); after Step 2 Accessories loads, Review and checkout is clicked by its test id (configuratorV35-BottomBar-checkout-button) and the script polls up to 25s for the next state. On the cart page (/store/cart*) it sets the quantity human-like (native-setter value + input/change events, verified) and clicks Checkout (navigation only). On the checkout page (/store/checkout*) it clicks Place order — ONLY when the "Auto place order" panel checkbox is checked (ARMED, default OFF); it logs the order total first, then polls up to 25s for the order confirmation or an error, and stops. The cart/checkout UI lives inside the same-origin #purchase-frame iframe, so the script searches the top document AND the frame. Every click first scrolls the button into the middle of the viewport, then runs a fast human-like pointer sequence with random movement. Auto sign-in: on the Microsoft login page (login.live.com/oauth20_authorize.srf, this store's client id) it types the saved account password character by character like a human and clicks Next — ONLY if a password was saved in the panel (Tampermonkey storage, never in the script file). All panel settings (quantity, ZIP/region, check delay, auto-attempt, Auto place order, password) are saved in Tampermonkey storage and restored on every page — nothing resets when the page changes. Best Buy: DOM monitor (no verified API), also at a random delay. No payment entry — the Place order click charges the saved payment method, so it never runs unless armed.
// @author       pythonicshariful
// @match        https://www.microsoft.com/*/store/configure/*
// @match        https://www.microsoft.com/*/store/cart*
// @match        https://www.microsoft.com/*/store/checkout*
// @match        https://www.microsoft.com/*/d/*xbox-series-x25*
// @match        https://www.microsoft.com/*/d/*XBOX-Series-X25*
// @match        https://www.microsoft.com/*/d/*xbox-series-s*
// @match        *://www.bestbuy.com/product/*6690019*
// @match        https://login.live.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
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
  // v2.6 (Nov 19, 2026, Shariful's request: on the cart page
  // /store/cart*, select the quantity like a real human and click
  // Checkout): the cart flow. Live probes Nov 19 (headless Chromium,
  // real S refurb page, 4 runs): the Review click DOES land on the
  // cart URL (+4-6s, so v2.5's 25s poll catches it) — BUT the cart UI
  // never renders in this environment: the cart page's purchase UI is
  // served from purchaseui.production.store-web.dynamics.com, which
  // answers 403 Access Denied to this VM's egress (Akamai), so no
  // quantity select and no Checkout button ever appear here, even
  // after 60s. Two things WERE proven: (1) the cart UI lives inside
  // <iframe id="purchase-frame"> with an EMPTY src — its document is
  // same-origin and READABLE from the top document (contentDocument
  // works, no SecurityError), so a microsoft.com userscript CAN reach
  // the quantity select and Checkout button inside it; v2.6 therefore
  // searches the top document AND the frame. (2) The quantity select
  // (from Shariful's own browser paste) is
  // <select id="QuantityPicker---<PRODUCTID>"> with options 1/2/3,
  // and Checkout is <button type="button" class="btn btn-primary
  // btn-block">Checkout</button> (no test id — matched by exact text,
  // btn-primary preferred). Quantity is a PANEL setting, default 1
  // (the buyer ordered one console); change it in the panel before
  // Start if the buyer wants 2 or 3. humanSelect() scrolls the select
  // into view, focuses it, fires pointer events, then sets the value
  // through the native HTMLSelectElement setter (so React-controlled
  // selects notice it) + input/change events, and verifies the value
  // stuck (re-querying by id in case the page re-rendered the node).
  // If the frame shows "Access Denied", the script says so plainly
  // and stops — that is the store backend blocking the browser, not a
  // script failure. The quantity/Checkout clicks are harness-proven
  // on a mock of the pasted HTML but could NOT be live-proven from
  // this VM; the real browser retest is the proof.
  // Also fixed in v2.6: the panel header and load line still said
  // "v2.3" (leftover from v2.3) — they now show the real version.
  // v2.7 (Nov 19, 2026, Shariful's request: on the checkout page
  // /store/checkout, click Place order
  // <button type="button" class="btn btn-primary btn-block"
  // data-bi-dnt="true">Place order</button>): the final step — this
  // click PLACES A REAL ORDER and charges the saved payment method.
  // So it is gated: the panel has an "Auto place order" checkbox,
  // default OFF. The flow runs ONLY when BOTH session flags are set:
  // CHECKOUT_KEY (the bot's own flow reached the checkout page from
  // the cart) AND PLACE_KEY (the user checked the box = armed). If
  // either is missing, the script logs that Place order is NOT armed
  // and stops for a human. Before clicking it logs the order total
  // read from the page (Total / Order total / Total due + $ amount),
  // then polls up to 25s for the confirmation ("Thank you" /
  // "Order placed" / "Order number") or an error (payment declined /
  // something went wrong), alerts, and stops. The button is matched
  // by exact text "Place order" (btn-primary preferred, no test id);
  // the search covers the top document AND every same-origin iframe
  // (the checkout UI may live in #purchase-frame like the cart's).
  // Could NOT be live-proven from this VM: the cart UI already 403s
  // here, and the checkout page needs a signed-in session with an
  // item in the cart — the first armed run on a real browser WILL
  // place a real order, so arm it only when the buyer is ready to
  // buy. Harness-proven on a mock of the pasted HTML.
  // v2.10 (Nov 19, 2026, Shariful's report: "quantity and password
  // and other info should not reset on page change", and "I clicked
  // Start on the checkout page but nothing happened"): PERSISTENCE.
  // Every panel setting is now saved in Tampermonkey storage
  // (GM_setValue, browser-local, shared across pages/tabs) the moment
  // it changes and restored when the panel is built — quantity,
  // ZIP/region, check-delay min/max, auto-attempt, Auto place order,
  // and the password. Nothing resets on a page change or reload. The
  // password is NO LONGER deleted after a successful sign-in (v2.9
  // cleared it) — it stays saved until the user presses Clear, so a
  // later session expiry signs in again without re-typing. The Auto
  // place order box ALSO persists now (v2.9 kept it in sessionStorage,
  // so it vanished in a new tab) — it stays checked until the user
  // unchecks it or an order completes; uncheck it after every order.
  // START BUTTON FIX: on the checkout page, pressing Start while the
  // flow was already running returned SILENTLY (monitoring === true),
  // so it looked dead — now it logs "Already running — waiting for
  // the Place order button..." and updates the status instead. Same
  // loud guard on the cart page and on the monitoring branch. The
  // per-tab flow markers (STORE/CART/CHECKOUT/TRIGGER keys) stay in
  // sessionStorage — only the settings moved to Tampermonkey storage.
  // ---------------------------------------------------------------------------
  // v2.9 (Nov 19, 2026, Shariful's request: on the login page
  // https://login.live.com/oauth20_authorize.srf?client_id=
  // 10fa57ef-4895-4ab2* type the password like a human and click
  // Next): AUTO SIGN-IN for the test account. The password is NEVER
  // in the script file or the repo — the operator types it once into
  // the panel's password box, it is saved in Tampermonkey storage
  // (GM_setValue, browser-local, NOT visible to web pages, NOT in
  // the script), and the panel input is cleared right after saving
  // so the password does not sit in the page DOM. On the login page
  // the script waits up to 60s for the password field, types the
  // saved password character by character (60-180ms apart, native
  // setter + keyboard/input events, like a human), clicks Next
  // (button[data-testid="primaryButton"]), then polls up to 25s:
  // navigation away / "Stay signed in?" = signed in (the saved
  // password is then DELETED from storage); an error message =
  // stop and wait for a human (password kept for a retry). With NO
  // saved password the script does NOTHING on the login page — it
  // only logs that a password is needed. Use the TEST account only,
  // never a main Microsoft account: Microsoft may still ask for
  // extra verification (code / "verify it's you") that the script
  // cannot pass, and automated sign-ins can get an account flagged.
  // The email step (if shown) stays manual. "Stay signed in?"
  // stays manual. Harness-proven on a mock of the pasted HTML
  // (password input #passwordEntry + Next button); end-to-end live
  // proof needs a real browser + the test account, still open.
  // ---------------------------------------------------------------------------
  // v2.8 (Nov 19, 2026, Shariful's request: the panel was too basic;
  // check at a RANDOM time instead of a fixed time, delay mixed, max
  // delay from the UI; UI redesigned with the ui-ux-pro-max skill):
  // the fixed poll interval is gone. Every stock check now waits a
  // RANDOM delay between a min and a max (panel inputs, default
  // 4-12s, clamped to 1-120s, max always >= min) — Microsoft API
  // polls and Best Buy DOM checks both use the same range, and the
  // Best Buy page reload is jittered too (100-140s instead of
  // exactly 120s). The 429 backoff doubles the whole range (max
  // capped at 60s). A "Next check in ~Ns" line counts down to the
  // next poll so the randomness is visible. Panel redesigned per the
  // ui-ux-pro-max design system (Real-Time/Operations pattern,
  // Glassmorphism style): frosted-glass dark panel, slate + status
  // green tokens (#0F172A / #1E293B / #22C55E / #F8FAFC / #94A3B8),
  // gradient header with a live status dot, grouped sections with
  // labels, 38px buttons with hover transitions, visible focus
  // rings, reduced-motion respected, collapsible body. Same controls
  // and element ids as before (Start/Stop, Test sound, auto-attempt,
  // Cart Qty, ZIP/Region, Auto place order checkbox) plus the new
  // min/max delay inputs. randDelay() is harness-tested (T19).
  // ---------------------------------------------------------------------------

  var SITE = window.location.hostname.indexOf('microsoft.com') !== -1 ? 'microsoft' : 'bestbuy';
  var DCC_URL = 'https://dcc.mp.microsoft.com/v1.0/deliverycost/us?mode=continueOnError';
  var DC_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products/';
  var MAX_WAIT_MS = 25000;
  var STORE_KEY = 'x25_monitor_active_v2';
  var TRIGGER_KEY = 'x25_api_trigger_v2';
  var CART_KEY = 'x25_cart_flow_v2';
  var CHECKOUT_KEY = 'x25_checkout_flow_v2';
  var PLACE_KEY = 'x25_place_order_v2';
  var PASS_KEY = 'x25_ms_passwd_v2';
  var QTY_KEY = 'x25_qty_v2';
  var ZIP_KEY = 'x25_zip_v2';
  var REGION_KEY = 'x25_region_v2';
  var DMIN_KEY = 'x25_delay_min_v2';
  var DMAX_KEY = 'x25_delay_max_v2';
  var AUTO_KEY = 'x25_auto_v2';
  var VERSION = '2.10.0';
  var desiredQty = '1';         // cart quantity, panel setting, default 1
  var placeOrderArmed = false;  // set only by the panel checkbox
  // Fallback store when the GM storage APIs are unavailable (harness /
  // restricted environments). In-memory only — does NOT survive a page
  // navigation, so on the real login page the GM APIs are required.
  var __memStore = {};
  // Random check delay (v2.8): each stock check waits a random time
  // between pollMinMs and pollMaxMs (panel inputs, seconds).
  var pollMinMs = 4000;
  var pollMaxMs = 12000;

  var startTime = Date.now();
  var monitoring = false;
  var checks = 0;
  var attempted = false;
  var apiTimer = null;
  var domTimer = null;
  var reloadTimer = null;
  var verifyTimer = null;
  var titleTimer = null;
  var nextTimer = null;         // 1s countdown ticker for "Next check in"
  var nextAt = 0;                // timestamp of the next scheduled check
  var originalTitle = document.title;
  var audioCtx = null;

  // Microsoft API state
  var productId = null;
  var ids = null;               // { skuId, availabilityId }
  var apiInFlight = false;
  var apiErrors = 0;
  var consecutiveTrue = 0;
  var lastApi = null;           // { value, ms, at }
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
  var delayMinInput = null;
  var delayMaxInput = null;
  var nextEl = null;
  var statusDotEl = null;
  var panelBodyEl = null;
  var qtySelect = null;
  var placeOrderCheckbox = null;

  // Random delay between checks (v2.8): uniform in [minMs, maxMs].
  function randDelay(minMs, maxMs) {
    var lo = Math.min(minMs, maxMs);
    var hi = Math.max(minMs, maxMs);
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  }

  // "Next check in ~Ns" countdown (v2.8): a 1s ticker that counts
  // down to nextAt while monitoring. Started by scheduleNextPoll /
  // scheduleNextBbTick, stopped by stopAll.
  function updateNextCheck() {
    if (!nextEl) return;
    if (!monitoring || !nextAt) { nextEl.textContent = ''; return; }
    var left = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
    nextEl.textContent = left > 0 ? ('Next check in ~' + left + 's') : 'Checking…';
  }
  function startNextTicker() {
    if (nextTimer) window.clearInterval(nextTimer);
    updateNextCheck();
    nextTimer = window.setInterval(updateNextCheck, 1000);
  }

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
  function onCartPage() { return /\/store\/cart/i.test(window.location.pathname); }
  function onCheckoutPage() { return /\/store\/checkout/i.test(window.location.pathname); }
  // The Place order gate: BOTH flags must be set — the bot's flow
  // reached checkout (CHECKOUT_KEY, per-tab sessionStorage) AND the
  // user armed it in the panel (PLACE_KEY, Tampermonkey storage, so
  // the arming survives page changes and new tabs).
  function shouldPlaceOrder() {
    try {
      return window.sessionStorage.getItem(CHECKOUT_KEY) === '1' &&
        storeGet(PLACE_KEY) === '1';
    } catch (e) { return false; }
  }

  // --- Password storage (v2.9) ----------------------------------------------
  // Tampermonkey storage first (survives navigation, shared across
  // microsoft.com and login.live.com inside this script, invisible to
  // web pages); in-memory fallback when the GM APIs are unavailable.
  // The password is NEVER written to the script file, the repo, the
  // panel log, or a page URL.
  function storeGet(k) {
    try { if (typeof GM_getValue === 'function') return GM_getValue(k); } catch (e) {}
    return __memStore[k];
  }
  function storeSet(k, v) {
    try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return; } } catch (e) {}
    __memStore[k] = v;
  }
  function storeDelete(k) {
    try { if (typeof GM_deleteValue === 'function') { GM_deleteValue(k); } } catch (e) {}
    try { delete __memStore[k]; } catch (e) {}
  }
  function gmStorageAvailable() {
    try { return typeof GM_setValue === 'function' && typeof GM_getValue === 'function'; }
    catch (e) { return false; }
  }

  // --- Microsoft login page (v2.9, auto sign-in) -----------------------------
  // Only this exact OAuth authorize page for this store's app id.
  // `loc` is injectable so the harness can pass a fake location.
  function onLoginAuthorizePage(loc) {
    loc = loc || window.location;
    if (loc.hostname !== 'login.live.com') return false;
    if (loc.pathname.toLowerCase().indexOf('/oauth20_authorize.srf') === -1) return false;
    return /client_id=10fa57ef-4895-4ab2/i.test(loc.search || '');
  }
  function onLoginPage() { return window.location.hostname === 'login.live.com'; }

  function findPasswdInput() {
    var el = document.getElementById('passwordEntry');
    if (el && el.tagName === 'INPUT' && el.type === 'password') return el;
    var byName = document.querySelector('input[name="passwd"][type="password"]');
    if (byName) return byName;
    var any = document.querySelector('input[type="password"]');
    return any || null;
  }

  function findLoginNextBtn() {
    var btns = Array.prototype.slice.call(document.querySelectorAll('button[data-testid="primaryButton"]'));
    for (var i = 0; i < btns.length; i++) {
      if (/^\s*Next\s*$/i.test(btns[i].textContent || '')) return btns[i];
    }
    if (btns.length) return btns[0];
    var subs = Array.prototype.slice.call(document.querySelectorAll('button[type="submit"]'));
    for (var j = 0; j < subs.length; j++) {
      if (/^\s*Next\s*$/i.test(subs[j].textContent || '')) return subs[j];
    }
    return null;
  }

  // Type like a human: one character at a time, 60-180ms apart, with
  // real keyboard/input events through the native value setter (the
  // Fluent input is controlled — plain .value assignment would not
  // register). Verifies the final value before calling done.
  function humanType(input, text, done) {
    if (!input) { if (done) done(false); return; }
    try { input.focus(); } catch (e) {}
    var i = 0;
    var setter = null;
    try {
      var vw = (input.ownerDocument && input.ownerDocument.defaultView) || window;
      setter = Object.getOwnPropertyDescriptor(vw.HTMLInputElement.prototype, 'value').set;
    } catch (e) {}
    // Start from empty (the operator may have typed something already).
    try {
      if (setter) setter.call(input, '');
      else input.value = '';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    } catch (e) {}
    function typeOne() {
      if (i >= text.length) {
        var ok = false;
        try { ok = input.value === text; } catch (e) {}
        if (done) done(ok);
        return;
      }
      var ch = text.charAt(i);
      i++;
      try {
        var cur = input.value || '';
        if (setter) setter.call(input, cur + ch);
        else input.value = cur + ch;
        var opts = { bubbles: true, cancelable: true };
        input.dispatchEvent(new window.KeyboardEvent('keydown', Object.assign({ key: ch }, opts)));
        input.dispatchEvent(new window.KeyboardEvent('keypress', Object.assign({ key: ch }, opts)));
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        input.dispatchEvent(new window.KeyboardEvent('keyup', Object.assign({ key: ch }, opts)));
      } catch (e) {}
      window.setTimeout(typeOne, 60 + Math.random() * 120);
    }
    typeOne();
  }

  // What the login page looks like AFTER the Next click.
  function loginState(beforeUrl) {
    var t = '';
    try { t = document.body ? (document.body.innerText || document.body.textContent || '') : ''; } catch (e) {}
    var next = findLoginNextBtn();
    return {
      navigated: window.location.href !== beforeUrl,
      url: window.location.href,
      kmsi: /Stay signed in/i.test(t),
      error: /password is incorrect|incorrect.*password|try again|verify.*(your identity|your account)|doesn.t match|something went wrong/i.test(t),
      buttonPresent: !!next,
      buttonDisabled: next ? next.disabled : null
    };
  }

  function runLoginFlow() {
    if (monitoring) return;
    monitoring = true;
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    setStatus('Sign-in page — waiting for the password field...', '#fbbf24');
    if (!gmStorageAvailable()) {
      log('WARNING: Tampermonkey storage (GM_setValue) is not available here, so a saved password cannot survive the page navigation. Enter the password in the panel on this page to sign in this once.');
    }
    waitForPasswd(0);
  }

  function waitForPasswd(pollsUsed) {
    var input = findPasswdInput();
    if (input) {
      var saved = storeGet(PASS_KEY);
      if (!saved) {
        log('Password field found, but NO password is saved. Type it in the panel password box above (it is saved in this browser only) and press Start — or type it here yourself.');
        setStatus('Password needed — check the panel', '#fbbf24');
        alertUser();
        stopAll('PASSWORD NEEDED - CHECK THIS TAB NOW');
        return;
      }
      log('Password field found. Typing the saved password like a human...');
      setStatus('Typing password...', '#fbbf24');
      humanType(input, saved, function (ok) {
        if (!ok) {
          log('Typing did not stick (the field value does not match). Stopping — type the password yourself on this page.');
          alertUser();
          stopAll('TYPING FAILED - CHECK THIS TAB NOW');
          return;
        }
        clickLoginNext(0);
      });
      return;
    }
    if (pollsUsed >= 60) {
      log('No password field appeared within 60s (this may be the email step — enter the email yourself, then the password step follows). Stopping for manual sign-in.');
      alertUser();
      stopAll('NO PASSWORD FIELD - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () { waitForPasswd(pollsUsed + 1); }, 1000);
  }

  function clickLoginNext(retriesUsed) {
    var btn = findLoginNextBtn();
    if (!btn || btn.disabled) {
      log('Next button missing or disabled. Stopping here for manual sign-in.');
      alertUser();
      stopAll('SIGN-IN - CHECK THIS TAB NOW');
      return;
    }
    log('Clicking Next to sign in.');
    var beforeUrl = window.location.href;
    var startMs = Date.now();
    humanClick(btn, function () {
      window.setTimeout(function () {
        verifyLoginClick(beforeUrl, retriesUsed || 0, startMs);
      }, 2000);
    });
  }

  function verifyLoginClick(beforeUrl, retriesUsed, startMs) {
    var s = loginState(beforeUrl);
    if (s.navigated || s.kmsi) {
      var where = s.kmsi ? '"Stay signed in?" shown — click Yes yourself' : ('navigated to ' + s.url);
      log('Signed in — ' + where + '. The saved password STAYS saved in this browser until you press Clear (v2.10 — it is no longer deleted after sign-in).');
      alertUser();
      stopAll('SIGNED IN - CHECK THIS TAB NOW');
      return;
    }
    if (s.error) {
      log('The login page shows an error (wrong password or extra verification needed). The saved password is KEPT so you can fix it in the panel and retry. Stopping for manual sign-in.');
      alertUser();
      stopAll('SIGN-IN ERROR - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonPresent) {
      log('Next button is gone and the page did not move. Stopping for manual check.');
      alertUser();
      stopAll('SIGN-IN - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonDisabled && retriesUsed < 1) {
      log('Next button is enabled again — the click may not have registered. Retrying once.');
      clickLoginNext(retriesUsed + 1);
      return;
    }
    if (Date.now() - startMs > 25000) {
      log('Next clicked but the page did not move within 25s. Check the tab — Microsoft may be asking for extra verification.');
      alertUser();
      stopAll('SIGN-IN - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () {
      verifyLoginClick(beforeUrl, retriesUsed, startMs);
    }, 1000);
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
    if (statusDotEl) statusDotEl.style.background = color || '#64748b';
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
        ' | random ' + (pollMinMs / 1000) + '–' + (pollMaxMs / 1000) + 's, no reload';
    }
  }

  // v2.8: the fixed setInterval is gone. Each check is scheduled with
  // a fresh random delay, so the traffic has no fixed rhythm.
  function scheduleNextPoll() {
    if (apiTimer) window.clearTimeout(apiTimer);
    var d = randDelay(pollMinMs, pollMaxMs);
    nextAt = Date.now() + d;
    startNextTicker();
    apiTimer = window.setTimeout(function () {
      apiTimer = null;
      pollOnce();
      if (monitoring && !attempted) scheduleNextPoll();
    }, d);
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
      if (e && e.status === 429 && pollMaxMs < 60000) {
        pollMinMs = Math.min(pollMinMs * 2, 30000);
        pollMaxMs = Math.min(pollMaxMs * 2, 60000);
        scheduleNextPoll();
        log('Rate-limited (429). Backing off to a random ' + (pollMinMs / 1000) + '–' + (pollMaxMs / 1000) + 's delay.');
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
    scheduleNextPoll();
    pollOnce();
  }

  // Best Buy: same random delay between DOM checks (v2.8).
  function scheduleNextBbTick() {
    if (domTimer) window.clearTimeout(domTimer);
    var d = randDelay(pollMinMs, pollMaxMs);
    nextAt = Date.now() + d;
    startNextTicker();
    domTimer = window.setTimeout(function () {
      domTimer = null;
      tickBestBuy();
      if (monitoring && !attempted) scheduleNextBbTick();
    }, d);
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
      // Carry the flow onto the cart page: stopAll() clears the
      // monitor flag, so leave a separate cart flag for init().
      try { window.sessionStorage.setItem(CART_KEY, '1'); } catch (e) {}
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

  // --- Cart page (v2.6, quantity + Checkout, navigation only) ----------
  // The cart UI lives inside <iframe id="purchase-frame"> (empty src,
  // same-origin, contentDocument readable) — so search the top document
  // AND the frame. Never clicks Place Order / submit, never signs in.
  function cartRoots() {
    var roots = [document];
    try {
      var f = document.getElementById('purchase-frame');
      if (f && f.contentDocument) roots.push(f.contentDocument);
    } catch (e) {}
    return roots;
  }

  function cartRootsText() {
    return cartRoots().map(function (d) {
      try { return (d.body ? (d.body.innerText || d.body.textContent || '') : ''); }
      catch (e) { return ''; }
    }).join('\n');
  }

  function cartUiBlocked() {
    return /Access Denied/i.test(cartRootsText()) &&
      /purchaseui\.production\.store-web\.dynamics\.com/i.test(cartRootsText());
  }

  function findQtySelects() {
    var out = [];
    cartRoots().forEach(function (d) {
      try {
        Array.prototype.slice.call(d.querySelectorAll('select[id^="QuantityPicker"]'))
          .forEach(function (s) { out.push(s); });
      } catch (e) {}
    });
    return out;
  }

  function findCheckoutBtn() {
    var found = null;
    cartRoots().forEach(function (d) {
      try {
        Array.prototype.slice.call(d.querySelectorAll('button')).forEach(function (b) {
          if (/^\s*Checkout\s*$/i.test((b.textContent || ''))) {
            if (!found) found = b;
            else if (/btn-primary/.test(b.className || '') && !/btn-primary/.test(found.className || '')) found = b;
          }
        });
      } catch (e) {}
    });
    return found;
  }

  // What the page looks like AFTER the Checkout click. Text is gathered
  // from the top document and the frame; the heading check avoids the
  // cart page's own "Checkout" button text by looking for checkout
  // PAGE markers (payment / review-your-order / sign-in).
  function checkoutState(beforeUrl) {
    var t = cartRootsText();
    var co = findCheckoutBtn();
    return {
      navigated: window.location.href !== beforeUrl,
      url: window.location.href,
      signIn: /Sign in to continue|Sign in with your Microsoft account|login\.live\.com/i.test(t) ||
        !!document.querySelector('input[type="password"]'),
      checkoutHeading: /Payment method|Review your order|Complete your purchase|Choose a payment/i.test(t),
      buttonPresent: !!co,
      buttonDisabled: co ? co.disabled : null
    };
  }

  // Human-like select change: scroll into view, focus, pointer taps
  // (a real human opens the dropdown), then the native value setter
  // (React-controlled selects only notice that) + input/change events,
  // then verify the value stuck — re-querying by id in case the page
  // re-rendered the node.
  function humanSelect(sel, value, done) {
    log('Setting quantity to ' + value + ' (human-like select).');
    try { sel.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (e) {
      try { sel.scrollIntoView(true); } catch (e2) {}
    }
    window.setTimeout(function () {
      var id = sel.id || '';
      try { sel.focus(); } catch (e) {}
      try { sel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 })); } catch (e) {}
      try { sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); } catch (e) {}
      try { sel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); } catch (e) {}
      window.setTimeout(function () {
        try {
          // Use the select's OWN window (it may live in the iframe).
          var vw = (sel.ownerDocument && sel.ownerDocument.defaultView) || window;
          var setter = Object.getOwnPropertyDescriptor(vw.HTMLSelectElement.prototype, 'value').set;
          setter.call(sel, value);
        } catch (e) { try { sel.value = value; } catch (e2) {} }
        try { sel.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        window.setTimeout(function () {
          var cur = sel;
          if (!cur.isConnected && id) {
            var again = findQtySelects().filter(function (s) { return s.id === id; })[0];
            if (again) cur = again;
          }
          var ok = cur && cur.value === String(value);
          log(ok ? ('Quantity is now ' + cur.value + '.') :
            ('Quantity change did not stick (still ' + (cur ? cur.value : 'gone') + ').'));
          if (done) done(ok);
        }, 600);
      }, 250);
    }, 700);
  }

  function runCartFlow() {
    if (monitoring) {
      log('Already running — waiting for the cart UI. Press Stop if you want to stop it.');
      setStatus('Already running — waiting for cart...', '#fbbf24');
      return;
    }
    monitoring = true;
    try { window.sessionStorage.setItem(STORE_KEY, '1'); } catch (e) {}
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    log('Cart page detected. Quantity + Checkout flow (Qty ' + desiredQty + ').');
    setStatus('Cart page — waiting for cart UI...', '#fbbf24');
    waitForCartUi(0);
  }

  function waitForCartUi(pollsUsed) {
    if (cartUiBlocked()) {
      log('Cart UI is blocked in this browser: the store backend answered "Access Denied" for the cart UI. This is not a script failure — open the cart on a normal browser / signed-in session and press Start there.');
      alertUser();
      stopAll('CART BLOCKED - CHECK THIS TAB NOW');
      return;
    }
    var sels = findQtySelects();
    var co = findCheckoutBtn();
    if (sels.length > 0 || co) {
      log('Cart UI loaded (' + sels.length + ' quantity select(s), Checkout button ' + (co ? 'found' : 'missing') + ').');
      applyCartQty(0);
      return;
    }
    if (pollsUsed >= 15) {
      log('Cart UI did not load within 30s (no quantity select, no Checkout button). The cart may be empty or still loading. Stopping for manual check.');
      alertUser();
      stopAll('CART UI NOT LOADED - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () { waitForCartUi(pollsUsed + 1); }, 2000);
  }

  function applyCartQty(idx) {
    var sels = findQtySelects();
    if (idx >= sels.length) {
      window.setTimeout(clickCheckoutButton, 1500);
      return;
    }
    var sel = sels[idx];
    if (sel.value === String(desiredQty)) {
      log('Quantity already ' + sel.value + ' — leaving it.');
      applyCartQty(idx + 1);
      return;
    }
    humanSelect(sel, desiredQty, function () {
      applyCartQty(idx + 1);
    });
  }

  function clickCheckoutButton(retriesUsed) {
    var co = findCheckoutBtn();
    if (!co || co.disabled) {
      log('Checkout button missing or disabled after quantity step. Stopping here for manual check.');
      alertUser();
      stopAll('CHECKOUT - CHECK THIS TAB NOW');
      return;
    }
    log('Clicking Checkout.');
    var beforeUrl = window.location.href;
    var startMs = Date.now();
    humanClick(co, function () {
      window.setTimeout(function () {
        verifyCheckoutClick(beforeUrl, retriesUsed || 0, startMs);
      }, 1500);
    });
  }

  function verifyCheckoutClick(beforeUrl, retriesUsed, startMs) {
    var s = checkoutState(beforeUrl);
    if (s.navigated || s.signIn || s.checkoutHeading) {
      var where = s.navigated ? ('navigated to ' + s.url) :
        (s.signIn ? 'sign-in prompt shown' : 'checkout page shown');
      log('Checkout clicked — ' + where + '. Stopping here: sign-in and payment are manual.');
      try { window.sessionStorage.removeItem(CART_KEY); } catch (e) {}
      // Carry the flow onto the checkout page (if the user armed it,
      // init() there will run the Place order flow).
      try { window.sessionStorage.setItem(CHECKOUT_KEY, '1'); } catch (e) {}
      alertUser();
      stopAll('CHECKOUT - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonPresent) {
      log('Checkout button is gone and the page did not navigate. Stopping for manual check.');
      try { window.sessionStorage.removeItem(CART_KEY); } catch (e) {}
      alertUser();
      stopAll('CHECKOUT - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonDisabled && retriesUsed < 1) {
      log('Checkout button is enabled again — the click may not have registered. Retrying once.');
      clickCheckoutButton(retriesUsed + 1);
      return;
    }
    if (Date.now() - startMs > 25000) {
      log('Checkout clicked but the page did not move within 25s (button ' +
        (s.buttonDisabled ? 'still disabled/processing' : 'enabled') +
        '). Check the tab — a real mouse click may be needed.');
      try { window.sessionStorage.removeItem(CART_KEY); } catch (e) {}
      alertUser();
      stopAll('CHECKOUT - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () {
      verifyCheckoutClick(beforeUrl, retriesUsed, startMs);
    }, 1000);
  }

  // --- Checkout page (v2.7, Place order — ARMED ONLY) ---------------------
  // This click PLACES A REAL ORDER and charges the saved payment
  // method. It runs ONLY when shouldPlaceOrder() is true (bot flow
  // reached checkout AND the user checked "Auto place order").
  function checkoutRoots() {
    var roots = [document];
    try {
      var f = document.getElementById('purchase-frame');
      if (f && f.contentDocument) roots.push(f.contentDocument);
    } catch (e) {}
    try {
      Array.prototype.slice.call(document.querySelectorAll('iframe')).forEach(function (fr) {
        try {
          if (fr.contentDocument && roots.indexOf(fr.contentDocument) === -1) roots.push(fr.contentDocument);
        } catch (e) {}
      });
    } catch (e) {}
    return roots;
  }

  function checkoutRootsText() {
    return checkoutRoots().map(function (d) {
      try { return (d.body ? (d.body.innerText || d.body.textContent || '') : ''); }
      catch (e) { return ''; }
    }).join('\n');
  }

  function findPlaceOrderBtn() {
    var found = null;
    checkoutRoots().forEach(function (d) {
      try {
        Array.prototype.slice.call(d.querySelectorAll('button')).forEach(function (b) {
          if (/^\s*Place order\s*$/i.test((b.textContent || ''))) {
            if (!found) found = b;
            else if (/btn-primary/.test(b.className || '') && !/btn-primary/.test(found.className || '')) found = b;
          }
        });
      } catch (e) {}
    });
    return found;
  }

  // The order total, read from the page for the log (informational —
  // the arming toggle is the go-ahead, not this read).
  function readOrderTotal() {
    var t = checkoutRootsText().replace(/\s+/g, ' ');
    var m = t.match(/(Total due|Order total|Total)\s*:?\s*\$?\s?([\d,]+\.\d{2})/i);
    if (m) return m[0].trim();
    var any = t.match(/\$\s?[\d,]+\.\d{2}/);
    return any ? any[0] : null;
  }

  // What the page looks like AFTER the Place order click.
  function placeOrderState(beforeUrl) {
    var t = checkoutRootsText();
    var po = findPlaceOrderBtn();
    return {
      navigated: window.location.href !== beforeUrl,
      url: window.location.href,
      confirmed: /Thank you|Order placed|Order confirmation|Order number|Your order (has been placed|is confirmed)/i.test(t),
      error: /payment (was )?declined|could\s?not place|something went wrong|try again|order (could not|was not) (be )?placed/i.test(t),
      buttonPresent: !!po,
      buttonDisabled: po ? po.disabled : null
    };
  }

  function runPlaceOrderFlow(manual) {
    if (monitoring) {
      // Never silently ignore a Start press — the user must see that
      // the flow is already running (v2.10 fix for "nothing happen").
      log('Already running — waiting for the Place order button. Press Stop if you want to stop it.');
      setStatus('Already running — waiting for Place order...', '#fbbf24');
      return;
    }
    monitoring = true;
    try { window.sessionStorage.setItem(STORE_KEY, '1'); } catch (e) {}
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    // Gate: the checkbox (PLACE_KEY) must be ON. On auto-resume the
    // bot flow must also have reached checkout (CHECKOUT_KEY); on a
    // manual Start press on this page, the checked box alone is the
    // go-ahead.
    var armed = storeGet(PLACE_KEY) === '1';
    if (!manual) armed = armed && shouldPlaceOrder();
    if (!armed) {
      log(manual ?
        'Auto place order checkbox is OFF. NOT clicking Place order — check the box in the panel and press Start if you want the bot to place the order.' :
        'On the checkout page, but Auto place order is NOT armed (checkbox off, or this tab did not come from the bot flow). NOT clicking Place order. Check the box in the panel and press Start if you want the bot to place the order.');
      alertUser();
      stopAll('NOT ARMED - CHECK THIS TAB NOW');
      return;
    }
    log('Checkout page detected. Auto place order is ARMED — will click Place order.');
    setStatus('Checkout page — waiting for Place order...', '#fbbf24');
    waitForPlaceOrderBtn(0);
  }

  function waitForPlaceOrderBtn(pollsUsed) {
    var po = findPlaceOrderBtn();
    if (po) {
      var total = readOrderTotal();
      log(total ? ('Order total read from the page: ' + total + '.') :
        'Could not read the order total from the page — proceeding because Auto place order is ON. Check the tab.');
      clickPlaceOrderButton(0);
      return;
    }
    if (pollsUsed >= 15) {
      log('Place order button did not appear within 30s. The checkout page may not have loaded, or the order cannot be placed from here. Stopping for manual check.');
      alertUser();
      stopAll('NO PLACE ORDER BUTTON - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () { waitForPlaceOrderBtn(pollsUsed + 1); }, 2000);
  }

  function clickPlaceOrderButton(retriesUsed) {
    var po = findPlaceOrderBtn();
    if (!po || po.disabled) {
      log('Place order button missing or disabled. Stopping here for manual check.');
      alertUser();
      stopAll('PLACE ORDER - CHECK THIS TAB NOW');
      return;
    }
    log('Clicking Place order — this places a REAL order.');
    var beforeUrl = window.location.href;
    var startMs = Date.now();
    humanClick(po, function () {
      window.setTimeout(function () {
        verifyPlaceOrderClick(beforeUrl, retriesUsed || 0, startMs);
      }, 2000);
    });
  }

  function verifyPlaceOrderClick(beforeUrl, retriesUsed, startMs) {
    var s = placeOrderState(beforeUrl);
    if (s.confirmed || s.error || s.navigated) {
      var what = s.confirmed ? 'ORDER CONFIRMED — check the confirmation / order number on the tab.' :
        (s.error ? 'an ERROR appeared after clicking Place order — check the tab (payment / order problem).' :
          ('navigated to ' + s.url + ' — check the tab for the order result.'));
      log('Place order clicked — ' + what);
      try { window.sessionStorage.removeItem(CHECKOUT_KEY); } catch (e) {}
      storeDelete(PLACE_KEY);
      placeOrderArmed = false;
      alertUser();
      stopAll(s.confirmed ? 'ORDER PLACED - CHECK THIS TAB NOW' : 'PLACE ORDER - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonPresent) {
      log('Place order button is gone and no confirmation appeared yet. Stopping for manual check.');
      try { window.sessionStorage.removeItem(CHECKOUT_KEY); } catch (e) {}
      alertUser();
      stopAll('PLACE ORDER - CHECK THIS TAB NOW');
      return;
    }
    if (!s.buttonDisabled && retriesUsed < 1) {
      log('Place order button is enabled again — the click may not have registered. Retrying once.');
      clickPlaceOrderButton(retriesUsed + 1);
      return;
    }
    if (Date.now() - startMs > 25000) {
      log('Place order clicked but no confirmation appeared within 25s (button ' +
        (s.buttonDisabled ? 'still disabled/processing' : 'enabled') +
        '). Check the tab — the order may still be processing.');
      try { window.sessionStorage.removeItem(CHECKOUT_KEY); } catch (e) {}
      alertUser();
      stopAll('PLACE ORDER - CHECK THIS TAB NOW');
      return;
    }
    window.setTimeout(function () {
      verifyPlaceOrderClick(beforeUrl, retriesUsed, startMs);
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
    if (onLoginAuthorizePage()) { runLoginFlow(); return; }
    if (onCheckoutPage()) { runPlaceOrderFlow(true); return; }
    if (onCartPage()) { runCartFlow(); return; }
    if (monitoring) {
      log('Already monitoring — press Stop if you want to stop it.');
      setStatus('Already monitoring...', '#fbbf24');
      return;
    }
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
        log('Polling deliverycost API at a random delay of ' + (pollMinMs / 1000) + '–' + (pollMaxMs / 1000) + 's between checks. Needs 2 true readings in a row, then DOM confirmation.');
        startApiLoop();
      }
    } else {
      log('Best Buy DOM mode (no verified API). Checks at a random ' + (pollMinMs / 1000) + '–' + (pollMaxMs / 1000) + 's delay, page reload after ~100–140s while unavailable.');
      scheduleNextBbTick();
      tickBestBuy();
      reloadTimer = window.setTimeout(function () {
        if (monitoring && !attempted) {
          log('Reloading page to re-check stock...');
          window.location.reload();
        }
      }, randDelay(100000, 140000));
    }
  }

  function stopAll(statusText) {
    monitoring = false;
    try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {}
    if (apiTimer) window.clearTimeout(apiTimer);
    if (domTimer) window.clearTimeout(domTimer);
    if (reloadTimer) window.clearTimeout(reloadTimer);
    if (verifyTimer) window.clearInterval(verifyTimer);
    if (nextTimer) window.clearInterval(nextTimer);
    apiTimer = null;
    domTimer = null;
    reloadTimer = null;
    verifyTimer = null;
    nextTimer = null;
    nextAt = 0;
    if (nextEl) nextEl.textContent = '';
    if (statusText) setStatus(statusText, '#fbbf24');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    log('Monitoring stopped. Sound/title alert stays until you press Stop or close the tab.');
  }

  function stopByUser() {
    stopTitleFlash();
    document.title = originalTitle;
    try { window.sessionStorage.removeItem(TRIGGER_KEY); } catch (e) {}
    try { window.sessionStorage.removeItem(CART_KEY); } catch (e) {}
    try { window.sessionStorage.removeItem(CHECKOUT_KEY); } catch (e) {}
    storeDelete(PLACE_KEY);
    placeOrderArmed = false;
    stopAll('Stopped.');
    log('Stopped by user.');
  }

  // --- Panel (v2.8, glassmorphism per ui-ux-pro-max design system) --------
  // Tokens: bg #0F172A, card rgba(27,35,54,.88) + blur(16px), accent
  // #22C55E, fg #F8FAFC, muted #94A3B8, border rgba(255,255,255,.16).
  // Inline styles only (the host page CSP already allows them — v2.7
  // proved it); no <style> block, no webfont dependency.
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'x25-monitor-panel';
    panel.setAttribute('style', 'position:fixed;right:12px;bottom:12px;z-index:999999;width:344px;background:rgba(27,35,54,0.88);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);color:#f8fafc;font:13px/1.5 system-ui,Arial,sans-serif;border:1px solid rgba(255,255,255,0.16);border-radius:16px;box-shadow:0 16px 48px rgba(2,6,23,0.6);overflow:hidden;');
    var modeLine = SITE === 'microsoft'
      ? (onCheckoutPage()
        ? 'Microsoft checkout mode &middot; Place order ONLY if armed below'
        : (onCartPage()
          ? 'Microsoft cart mode &middot; quantity + Checkout &middot; no Place Order'
          : 'Microsoft API mode &middot; no reload &middot; no checkout submit'))
      : 'Best Buy DOM mode &middot; no verified API &middot; no checkout submit';
    var msRows = '';
    if (SITE === 'microsoft') {
      msRows =
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0;font-size:13px;"><span style="color:#cbd5e1;">ZIP</span><input id="x25-zip" value="95037" style="width:70px;background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:6px 8px;font-size:13px;"> ' +
        '<span style="color:#cbd5e1;">Region</span><input id="x25-region" value="CA" style="width:44px;background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:6px 8px;font-size:13px;"></div>' +
        '<div id="x25-api" style="color:#94a3b8;font-size:12px;font-family:ui-monospace,monospace;background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-top:6px;">API: not started.</div>';
    }
    var cartRow = '';
    if (SITE === 'microsoft') {
      cartRow =
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;margin:12px 0 6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">Cart</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0;font-size:13px;"><span style="color:#cbd5e1;">Cart Qty</span><select id="x25-qty" style="width:64px;background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:6px 8px;font-size:13px;"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option></select> <span style="color:#94a3b8;font-size:12px;">(set on the cart page)</span></div>';
    }
    var inp = 'background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:6px 8px;font-size:13px;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-bottom:1px solid rgba(255,255,255,0.10);">' +
        '<span id="x25-dot" style="width:10px;height:10px;border-radius:50%;background:#64748b;box-shadow:0 0 0 3px rgba(100,116,139,0.25);flex:none;"></span>' +
        '<span style="font-weight:700;font-size:14px;letter-spacing:0.2px;">Xbox X25 Monitor</span>' +
        '<span style="background:rgba(34,197,94,0.15);color:#4ade80;font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;">v' + VERSION + '</span>' +
        '<button id="x25-collapse" aria-label="Collapse panel" style="margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#f8fafc;width:26px;height:26px;border-radius:8px;cursor:pointer;font-size:14px;line-height:1;padding:0;">–</button>' +
      '</div>' +
      '<div id="x25-body" style="padding:12px 14px 14px;">' +
      '<div style="color:#94a3b8;font-size:12px;">' + modeLine + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:8px;"><span id="x25-status" style="font-weight:700;font-size:14px;">Not started</span><span id="x25-next" style="color:#4ade80;font-size:12px;font-family:ui-monospace,monospace;white-space:nowrap;"></span></div>' +
      '<div id="x25-info" style="color:#94a3b8;font-size:12px;margin:4px 0 4px;">Press Start.</div>' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;margin:12px 0 6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">Monitoring</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0;font-size:13px;"><span style="color:#cbd5e1;">Check delay (random)</span><input id="x25-delay-min" type="number" min="1" max="120" value="4" style="width:56px;' + inp + '"> <span style="color:#94a3b8;">–</span> <input id="x25-delay-max" type="number" min="1" max="120" value="12" style="width:56px;' + inp + '"> <span style="color:#94a3b8;font-size:12px;">sec each check</span></div>' +
      msRows +
      cartRow +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0 0;font-size:13px;cursor:pointer;"><input id="x25-auto" type="checkbox" checked style="accent-color:#22c55e;width:16px;height:16px;flex:none;margin-top:1px;"> <span>Auto-attempt first click when in stock</span></label>' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;margin:12px 0 6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">Safety</div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13px;color:#fca5a5;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:8px 10px;cursor:pointer;"><input id="x25-place-order" type="checkbox" style="accent-color:#ef4444;width:16px;height:16px;flex:none;margin-top:1px;"> <span>Auto PLACE ORDER on the checkout page (charges the saved payment method — arm only when ready to buy)</span></label>' +
      '<div style="margin:6px 0;font-size:12px;color:#e2e8f0;"><div style="margin-bottom:4px;font-weight:600;">Microsoft account password (test account only)</div>' +
      '<div style="display:flex;gap:6px;"><input id="x25-ms-pass" type="password" autocomplete="off" placeholder="Type the test account password" style="flex:1;min-width:0;background:rgba(15,23,42,0.85);border:1px solid var(--x25-border,#334155);border-radius:8px;color:#f1f5f9;padding:6px 8px;font-size:12px;outline:none;">' +
      '<button id="x25-ms-pass-clear" type="button" style="flex:none;background:transparent;border:1px solid var(--x25-border,#334155);border-radius:8px;color:#cbd5e1;padding:6px 9px;font-size:12px;cursor:pointer;">Clear</button></div>' +
      '<div id="x25-ms-pass-note" style="margin-top:4px;font-size:11px;color:#94a3b8;">Saved in this browser only (Tampermonkey storage) — never in the script file. Used only on the Microsoft sign-in page. It stays saved until you press Clear. Never use your main account password here.</div></div>' +
      '<div style="display:flex;gap:8px;margin:12px 0 4px;">' +
        '<button id="x25-start" style="flex:1;height:38px;padding:0 14px;border:none;border-radius:10px;background:#22c55e;color:#0f172a;font-weight:700;font-size:13px;cursor:pointer;transition:filter 0.18s ease,transform 0.18s ease;">Start</button>' +
        '<button id="x25-stop" disabled style="flex:1;height:38px;padding:0 14px;border:none;border-radius:10px;background:#334155;color:#f8fafc;font-weight:600;font-size:13px;cursor:pointer;transition:filter 0.18s ease;">Stop</button>' +
        '<button id="x25-sound" style="height:38px;padding:0 14px;border:1px solid #475569;border-radius:10px;background:transparent;color:#f8fafc;font-weight:600;font-size:13px;cursor:pointer;transition:border-color 0.18s ease;">Test sound</button>' +
      '</div>' +
      '<div id="x25-log" style="margin-top:10px;max-height:150px;overflow-y:auto;background:rgba(2,6,23,0.75);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px;font:11px/1.6 ui-monospace,monospace;color:#cbd5e1;white-space:pre-wrap;"></div>' +
      '<div style="color:#64748b;font-size:11px;margin-top:8px;">Run one tab per site. Microsoft: no reload while polling. Best Buy: reloads after ~100–140s.</div>' +
      '</div>';
    document.body.appendChild(panel);
    statusEl = $('#x25-status', panel);
    infoEl = $('#x25-info', panel);
    apiLineEl = $('#x25-api', panel);
    logEl = $('#x25-log', panel);
    nextEl = $('#x25-next', panel);
    statusDotEl = $('#x25-dot', panel);
    panelBodyEl = $('#x25-body', panel);
    autoCheckbox = $('#x25-auto', panel);
    placeOrderCheckbox = $('#x25-place-order', panel);
    startBtn = $('#x25-start', panel);
    stopBtn = $('#x25-stop', panel);
    zipInput = $('#x25-zip', panel);
    regionInput = $('#x25-region', panel);
    delayMinInput = $('#x25-delay-min', panel);
    delayMaxInput = $('#x25-delay-max', panel);
    qtySelect = $('#x25-qty', panel);
    startBtn.addEventListener('click', start);
    stopBtn.addEventListener('click', stopByUser);
    // Collapse toggle: header stays, body hides.
    var collapseBtn = $('#x25-collapse', panel);
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        var hidden = panelBodyEl && panelBodyEl.style.display === 'none';
        if (panelBodyEl) panelBodyEl.style.display = hidden ? '' : 'none';
        collapseBtn.textContent = hidden ? '–' : '+';
        collapseBtn.setAttribute('aria-label', hidden ? 'Collapse panel' : 'Expand panel');
      });
    }
    // Visible focus rings (keyboard nav) + hover feedback on controls.
    Array.prototype.slice.call(panel.querySelectorAll('input, select, button')).forEach(function (el) {
      el.addEventListener('focus', function () { el.style.outline = '2px solid #22c55e'; el.style.outlineOffset = '1px'; });
      el.addEventListener('blur', function () { el.style.outline = ''; el.style.outlineOffset = ''; });
      el.addEventListener('mouseenter', function () { if (!el.disabled) el.style.filter = 'brightness(1.12)'; });
      el.addEventListener('mouseleave', function () { el.style.filter = ''; });
    });
    // v2.10: every setting is restored from Tampermonkey storage here
    // and saved back on every change — nothing resets on page change.
    if (qtySelect) {
      var savedQty = storeGet(QTY_KEY);
      if (savedQty === '2' || savedQty === '3') { qtySelect.value = savedQty; desiredQty = savedQty; }
      qtySelect.addEventListener('change', function () {
        desiredQty = qtySelect.value || '1';
        storeSet(QTY_KEY, desiredQty);
        log('Cart quantity set to ' + desiredQty + ' (saved — survives page changes).');
      });
    }
    if (zipInput) {
      var savedZip = storeGet(ZIP_KEY);
      if (savedZip) zipInput.value = savedZip;
      zipInput.addEventListener('change', function () {
        var z = (zipInput.value || '').trim();
        if (z) storeSet(ZIP_KEY, z);
        log('ZIP set to ' + (z || '95037') + ' (saved — survives page changes).');
      });
    }
    if (regionInput) {
      var savedRegion = storeGet(REGION_KEY);
      if (savedRegion) regionInput.value = savedRegion;
      regionInput.addEventListener('change', function () {
        var r = (regionInput.value || '').trim();
        if (r) storeSet(REGION_KEY, r);
        log('Region set to ' + (r || 'CA') + ' (saved — survives page changes).');
      });
    }
    if (autoCheckbox) {
      if (storeGet(AUTO_KEY) === '0') autoCheckbox.checked = false;
      autoCheckbox.addEventListener('change', function () {
        storeSet(AUTO_KEY, autoCheckbox.checked ? '1' : '0');
        log('Auto-attempt ' + (autoCheckbox.checked ? 'ON' : 'OFF') + ' (saved — survives page changes).');
      });
    }
    if (placeOrderCheckbox) {
      // Restore the armed state (Tampermonkey storage — survives page
      // changes and new tabs; uncheck after every order).
      if (storeGet(PLACE_KEY) === '1') {
        placeOrderCheckbox.checked = true;
        placeOrderArmed = true;
      }
      placeOrderCheckbox.addEventListener('change', function () {
        placeOrderArmed = !!placeOrderCheckbox.checked;
        if (placeOrderArmed) storeSet(PLACE_KEY, '1');
        else storeDelete(PLACE_KEY);
        log(placeOrderArmed ?
          'Auto place order ARMED — the script WILL click Place order on the checkout page and charge the saved payment method. (Saved — it stays armed until you uncheck it or an order completes.)' :
          'Auto place order disarmed — Place order will NOT be clicked.');
      });
    }
    // v2.9: password box — saves into Tampermonkey storage on change,
    // then clears the field so the password never sits in the page DOM.
    // The value is never logged and never written back into the field.
    var passInput = $('#x25-ms-pass', panel);
    var passNote = $('#x25-ms-pass-note', panel);
    var passClearBtn = $('#x25-ms-pass-clear', panel);
    if (passInput) {
      if (storeGet(PASS_KEY)) {
        if (passNote) passNote.textContent = 'A password is already saved in this browser. Type a new one to replace it, or press Clear to remove it.';
      }
      passInput.addEventListener('change', function () {
        var v = passInput.value || '';
        passInput.value = '';
        if (!v) return;
        storeSet(PASS_KEY, v);
        if (passNote) passNote.textContent = 'Password saved in this browser. It will be typed on the Microsoft sign-in page. It stays saved until you press Clear.';
        log('Microsoft account password saved in this browser (Tampermonkey storage). It is NOT in the script file.');
      });
    }
    if (passClearBtn) {
      passClearBtn.addEventListener('click', function () {
        storeDelete(PASS_KEY);
        if (passInput) passInput.value = '';
        if (passNote) passNote.textContent = 'Saved in this browser only (Tampermonkey storage) — never in the script file. Used only on the Microsoft sign-in page. It stays saved until you press Clear. Never use your main account password here.';
        log('Saved Microsoft account password cleared from this browser.');
      });
    }
    if (delayMinInput && delayMaxInput) {
      // v2.10 restore: saved delay range (defaults 4/12).
      var sLo = parseInt(storeGet(DMIN_KEY), 10);
      var sHi = parseInt(storeGet(DMAX_KEY), 10);
      if (!isNaN(sLo) && sLo >= 1 && sLo <= 120) delayMinInput.value = String(sLo);
      if (!isNaN(sHi) && sHi >= 1 && sHi <= 120) delayMaxInput.value = String(sHi);
      var rLo = parseInt(delayMinInput.value, 10) || 4;
      var rHi = parseInt(delayMaxInput.value, 10) || 12;
      if (rHi < rLo) rHi = rLo;
      pollMinMs = rLo * 1000;
      pollMaxMs = rHi * 1000;
      var applyDelayRange = function () {
        var lo = parseInt(delayMinInput.value, 10);
        var hi = parseInt(delayMaxInput.value, 10);
        if (isNaN(lo) || lo < 1) lo = 1;
        if (isNaN(hi) || hi < 1) hi = 1;
        if (lo > 120) lo = 120;
        if (hi > 120) hi = 120;
        if (hi < lo) hi = lo;
        delayMinInput.value = String(lo);
        delayMaxInput.value = String(hi);
        pollMinMs = lo * 1000;
        pollMaxMs = hi * 1000;
        storeSet(DMIN_KEY, String(lo));
        storeSet(DMAX_KEY, String(hi));
        if (monitoring) {
          if (SITE === 'microsoft') scheduleNextPoll();
          else scheduleNextBbTick();
        }
        log('Check delay set to a random ' + lo + '–' + hi + 's between checks. (Saved — survives page changes.)');
      };
      delayMinInput.addEventListener('change', applyDelayRange);
      delayMaxInput.addEventListener('change', applyDelayRange);
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

  // Slim panel for the Microsoft sign-in page (v2.9): only the
  // password box, Start/Stop, status and log. Shares the same
  // Tampermonkey storage as the main panel.
  function buildLoginPanel() {
    if (document.getElementById('x25-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'x25-panel';
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;max-width:calc(100vw - 32px);border-radius:16px;padding:14px;background:rgba(15,23,42,0.82);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);border:1px solid rgba(148,163,184,0.35);box-shadow:0 12px 40px rgba(2,6,23,0.45);color:#f1f5f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.45;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span id="x25-dot" style="width:10px;height:10px;border-radius:50%;background:#fbbf24;flex:none;"></span>' +
      '<span style="font-weight:700;font-size:14px;">Xbox X25 — Microsoft sign-in</span></div>' +
      '<div style="font-size:12px;color:#cbd5e1;margin-bottom:8px;">This page asks for the Microsoft account password. The script types it like a human and clicks Next — only if a password is saved below.</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:6px;"><input id="x25-login-pass" type="password" autocomplete="off" placeholder="Test account password" style="flex:1;min-width:0;background:rgba(2,6,23,0.75);border:1px solid #334155;border-radius:8px;color:#f1f5f9;padding:7px 9px;font-size:12px;outline:none;">' +
      '<button id="x25-login-clear" type="button" style="flex:none;background:transparent;border:1px solid #334155;border-radius:8px;color:#cbd5e1;padding:7px 10px;font-size:12px;cursor:pointer;">Clear</button></div>' +
      '<div id="x25-login-note" style="font-size:11px;color:#94a3b8;margin-bottom:10px;">Saved in this browser only (Tampermonkey storage) — never in the script file. It stays saved until you press Clear. Test account only.</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;"><button id="x25-start" type="button" style="flex:1;background:#22c55e;color:#052e16;border:none;border-radius:10px;padding:9px 10px;font-size:13px;font-weight:700;cursor:pointer;">Start sign-in</button>' +
      '<button id="x25-stop" type="button" style="flex:1;background:rgba(148,163,184,0.18);color:#e2e8f0;border:1px solid #475569;border-radius:10px;padding:9px 10px;font-size:13px;font-weight:600;cursor:pointer;" disabled>Stop</button></div>' +
      '<div id="x25-status" style="font-size:12px;color:#fbbf24;margin-bottom:6px;">Waiting…</div>' +
      '<div id="x25-log" style="max-height:150px;overflow:auto;font-size:11px;color:#cbd5e1;background:rgba(2,6,23,0.55);border:1px solid rgba(148,163,184,0.25);border-radius:8px;padding:6px 8px;white-space:pre-wrap;"></div>';
    document.body.appendChild(panel);
    statusEl = $('#x25-status', panel);
    logEl = $('#x25-log', panel);
    startBtn = $('#x25-start', panel);
    stopBtn = $('#x25-stop', panel);
    var passInput = $('#x25-login-pass', panel);
    var passNote = $('#x25-login-note', panel);
    if (passInput) {
      if (storeGet(PASS_KEY)) {
        if (passNote) passNote.textContent = 'A password is already saved in this browser. Type a new one to replace it, or press Clear to remove it.';
      }
      passInput.addEventListener('change', function () {
        var v = passInput.value || '';
        passInput.value = '';
        if (!v) return;
        storeSet(PASS_KEY, v);
        if (passNote) passNote.textContent = 'Password saved in this browser. It will be typed here. It stays saved until you press Clear.';
        log('Microsoft account password saved in this browser (Tampermonkey storage). It is NOT in the script file.');
      });
    }
    var clearBtn = $('#x25-login-clear', panel);
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        storeDelete(PASS_KEY);
        if (passInput) passInput.value = '';
        if (passNote) passNote.textContent = 'Saved in this browser only (Tampermonkey storage) — never in the script file. It stays saved until you press Clear. Test account only.';
        log('Saved Microsoft account password cleared from this browser.');
      });
    }
    if (startBtn) startBtn.addEventListener('click', function () { start(); });
    if (stopBtn) stopBtn.addEventListener('click', function () { stopAll('Stopped by user.'); });
  }

  function init() {
    if (!document.body) return;
    if (onLoginAuthorizePage()) {
      buildLoginPanel();
      log('Loaded v' + VERSION + ' on the Microsoft sign-in page.');
      log('Auto sign-in runs only when a password is saved in the panel above. The email step (if shown) and "Stay signed in?" stay manual.');
      runLoginFlow();
      return;
    }
    buildPanel();
    log('Loaded v' + VERSION + ' on ' + window.location.hostname + ' (' + SITE + ').');
    if (SITE === 'microsoft') {
      log('Microsoft: deliverycost API polling, no reload. Best Buy tab uses DOM mode.');
    } else {
      log('Best Buy: DOM mode. No verified API. No checkout submit, no payment entry.');
    }
    var resume = false;
    var cartResume = false;
    try {
      resume = window.sessionStorage.getItem(STORE_KEY) === '1';
      cartResume = window.sessionStorage.getItem(CART_KEY) === '1';
      if (window.sessionStorage.getItem(TRIGGER_KEY) === '1') {
        window.sessionStorage.removeItem(TRIGGER_KEY);
        triggerReloadDone = true;
        pendingDomVerify = true;
      }
    } catch (e) {}
    if (onCartPage() && cartResume) {
      log('Auto-resuming cart flow (came from Review and checkout).');
      runCartFlow();
      return;
    }
    if (onCheckoutPage()) {
      if (shouldPlaceOrder()) {
        log('Auto-resuming Place order flow (came from Checkout, armed).');
        runPlaceOrderFlow(false);
      } else {
        log('On the checkout page, but Auto place order is NOT armed. Press Start after checking the box if you want the bot to place the order.');
      }
      return;
    }
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
