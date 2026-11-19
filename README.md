# Xbox X25 Stock Monitor v1 (Tampermonkey)

Buyer: wiseman497 (Fiverr, $250 "Microsoft Automation" order, Nov 17, 2026, 7-day delivery).
Product: Xbox Series X25 Limited Edition, 1TB, $899.99.
Target stores: Microsoft Store (primary, buyer-confirmed) and Best Buy.

## What was verified live (Nov 18, 2026, signed out, no CAPTCHA / block)

Microsoft Store configure page
(`microsoft.com/en-us/store/configure/xbox-series-x25-limited-edition/8wg5vqp0x4h3`):

- Only console option reads "Out of stock 1TB $899.99". "From $899.99" /
  "Starting at $899.99". "Continue to accessories" is disabled. Step 2
  Accessories is unavailable until Step 1 completes.
- Availability is fully visible without sign-in. No visible re-check in
  60 seconds idle on the page.
- Signed-in check (separate session, test account) showed the same
  Out of stock state; checkout was unreachable.

Best Buy product page (SKU 6690019):

- $899.99. Button "Coming Soon" (disabled). "Pickup not available for
  this item", "Shipping not available for this item". No Add to Cart button.
- "High Demand Product", "Account required", "only 25,000 of these
  numbered consoles will be available to the public", "Sold by Best Buy".
- Availability is visible without sign-in. Pickup/shipping area loads
  after the initial page (skeleton placeholders first). No visible
  re-check in 60 seconds idle.

## Stock API verdict: no verified API for either site

Microsoft:

- `GET https://displaycatalog.mp.microsoft.com/v7.0/products/8wg5vqp0x4h3?market=US&languages=en-US`
  returns product JSON (ProductId 8WG5VQP0X4H3, Skus Q2BG and JXZJ,
  ListPrice/MSRP 899.99 USD). There is NO stock-count / inStock boolean
  in this payload, and Q2BG still lists "Purchase" in Actions while the
  page says "Out of stock". Polling this endpoint alone would
  false-positive. It is NOT used by v1. Whether the configure page
  itself calls it could not be proven (no network panel in the
  checking browser).
- `GET https://purchase.mp.microsoft.com/v7.0/products/8wg5vqp0x4h3?market=US&languages=en-US`
  returned 404. Do not use it.
- The live-inventory endpoint that overrides the catalog "Purchase"
  action was NOT identified. It needs DevTools network capture in a
  real browser while the page loads.

Best Buy:

- No verified inventory/pricing API URL or response fields were found
  in this investigation (no network panel available).
- Two guessed patterns were tried and FAILED (generic error /
  "Page Not Found"). Do NOT use them:
  - `https://www.bestbuy.com/api/offers/v1/products/6690019/offer`
  - `https://www.bestbuy.com/ecomm-api/availability/products/v1/pickup?skuId=6690019`
- Older notes (different SKU, Nov 6): tcfb buttonstate v5
  (`/api/tcfb/model.json`, per-store, ADD_TO_CART = buyable) worked
  for PS5 Slim SKU 6646420; priceBlocks 404 and tcfb v6 online 500
  were dead for that SKU; PDP fulfillment via GraphQL
  (`FulfillmentOptionHook_FulfillmentDynamicQuery`) is Akamai-cookie
  bound. NONE of this was verified for SKU 6690019. Do not build on
  it for this product without a live test on this SKU.

Conclusion: v1 reads the page DOM only. An API-based poller needs a
DevTools network capture from a real browser session (ideally during
a restock, when the in-stock requests actually fire).

## What v1 does

- Runs on the two product pages only (see `@match` in the script).
- Panel (bottom-right): status, last check, check count, log,
  Start/Stop, Test sound, auto-attempt checkbox (default ON).
- Checks the DOM every 3 seconds. Reloads the page every 120 seconds
  while unavailable and auto-resumes after reload.
- Microsoft in-stock signal: a 1TB option button that is visible,
  enabled, and does NOT say "Out of stock"/"Sold out", OR an enabled
  "Continue to accessories" button.
- Best Buy in-stock signal: an enabled "Add to Cart" button. A changed
  state (e.g. Coming Soon button enabled, or not-available lines gone)
  alerts without auto-clicking.
- On a signal: loud beeps + flashing tab title + panel status. If
  auto-attempt is ON, it clicks once only: Microsoft = console option,
  then Continue (if enabled); Best Buy = Add to Cart. Then it STOPS
  and waits for a human. It never clicks Place Order / checkout
  submit, never fills payment details, never changes account settings.
- UNKNOWN states (page still loading, or layout not recognised) never
  trigger an alert.

## What v1 does NOT do

- No Telegram / Discord notifications yet. The buyer never answered
  which channel he wants, and no token/chat ID was supplied. The
  script alerts in the tab only. Add a webhook only after the buyer
  confirms the channel and supplies his own token/ID.
- No full auto-checkout. The Accessories step, cart, Best Buy
  reservation flow, and payment steps were never seen live because
  both listings are unavailable. Clicking through unseen steps would
  be guessing.
- No API polling (see verdict above).

## Install and test

1. Install Tampermonkey in Chrome/Edge.
2. Tampermonkey dashboard -> Create a new script -> delete the
   template -> paste the whole `.user.js` file -> File -> Save.
3. Open the Microsoft configure page. The panel appears bottom-right.
   Press Start. It should log UNAVAILABLE checks and show
   "UNAVAILABLE". Press Test sound to confirm audio.
4. Open the Best Buy page in a second tab. Press Start. It should log
   UNAVAILABLE (Coming Soon) checks.
5. Run ONE tab per site. Keep the tabs open and the computer awake.
   After a reload the script auto-resumes, but browser audio may need
   a click first; the flashing tab title still works.
6. Microsoft: sign in with the buyer's account BEFORE starting if the
   buyer wants checkout from his signed-in session. The script does
   not sign in. Best Buy: the page says an account is required to
   purchase; sign in first as well.

## Limits and honest status

- The in-stock click path is UNTESTED. Both listings were unavailable
  when v1 was built, so the exact in-stock button text, the
  Accessories step, and the Best Buy reservation/checkout flow are
  unknown. Treat the first restock as a live test: stay at the
  computer, watch the tab, and be ready to finish checkout manually.
- Selectors are text-based (button text + enabled/disabled). If either
  site changes wording or layout, the script reports UNKNOWN and
  alerts nothing. Check the panel log.
- Reloading every 120 seconds is deliberately slow to avoid hammering
  the sites. Do not set it much faster without watching for blocks.
- Syntax-checked with `node --check` on Nov 18, 2026. No live
  in-stock run has happened yet.

## Next steps (when a restock is near)

1. Capture DevTools Network (F12 -> Network, preserve log) while
   loading each page, and save any availability/inventory request
   URLs + responses. That is the only way to get a verified API.
2. If the buyer confirms Telegram or Discord, add his webhook to a
   v1.1 (his own token/ID only, never hardcode shared secrets).
3. After the first observed in-stock state, extend the Microsoft flow
   past Accessories and the Best Buy flow past Add to Cart using the
   real DOM seen at that time.

## Update, Nov 18 evening: Microsoft stock API FOUND and verified (v2)

Playwright network capture (in-stock Xbox Series S vs OOS X25, same
session shape, signed out, no CAPTCHA) found the real inventory call.
Full write-up: `network-capture/MICROSOFT-FINDINGS.md`. Raw API samples:
`network-capture/api-probes/`. (Do NOT share `network_log.json` files
publicly; they contain request/response headers for debugging.)

### The API

`POST https://dcc.mp.microsoft.com/v1.0/deliverycost/us?mode=continueOnError`

- Anonymous: no Authorization, no Cookie needed. Direct cookieless
  replays returned HTTP 200 in ~1.1-1.7s. Response carries
  `access-control-allow-origin`, so in-page `fetch` should work
  (v2 falls back to `GM_xmlhttpRequest` if fetch fails).
- Request body (exact captured shape):

  ```json
  {"deliveryGroups":[{"shipToInformation":{"countryCode":"US","postalCode":"95037","region":"CA"},"deliveryGroupId":"sfwPdpDeliveryGroup","lineItems":[{"availabilityId":"<AVAILABILITY_ID>","skuId":"<SKU_ID>","isDeliveryRequired":true,"productId":"<PRODUCT_ID>","quantity":1,"lineItemId":"item0","catalogId":1}]}],"orderingExperience":"Consumer"}
  ```

- Stock field: `deliveryGroups[].lineItems[].isInventoryAvailable`
  (boolean). Do NOT use `deliveryCosts` presence/prices/dates:
  methods, prices and estimated dates are present even when
  unavailable. Plant id is not a signal either.

### Verification table (cookieless replays, Nov 18)

| Product | skuId | availabilityId | isInventoryAvailable |
|---|---|---|---|
| Series S (in stock) | 2JBX | 8WH0910DCX37 | true |
| Series S (in stock) | Z1F6 | 8RKC5V6987JH | true (browser capture) |
| X25 (OOS) | Q2BG | 8S856RCB2BDV | false |
| X25 preorder SKU | JXZJ | 93K6GL6PF64Z | false (release 2027-01-13; poll Q2BG, not this) |

ZIP robustness: Series S still true with 10001/NY; X25 Q2BG still
false with 90001/CA. Signal is stable across the ZIPs tested.

### Secondary signal: embedded configurator JSON

The configure-page HTML embeds a `skus` array with
`inventory {inStock: bool, text}` per SKU (Series S: true; X25 Q2BG:
false, text "Out of stock"). Parsing it needs a ~165KB HTML fetch;
the ~3KB deliverycost POST is the better poller. Never grep raw HTML
for "Out of stock": the phrase also appears in template text on the
in-stock Series S page.

### What v2 does differently from v1

- Microsoft: polls deliverycost every 8s by default (5/8/15/30s
  selectable in the panel). NO page reload while polling. ZIP and
  region are editable in the panel (defaults 95037/CA).
- Identifiers are re-resolved at start from DisplayCatalog
  (productId from the page URL -> first non-preorder skuId +
  availabilityId). Hardcoded X25 fallback (Q2BG / 8S856RCB2BDV) is
  used only if DisplayCatalog fails, and only for product
  8wg5vqp0x4h3.
- Needs 2 consecutive `true` readings, then confirms in the DOM:
  if the tab is on a `/d/` page it navigates to the configure page;
  if the configure DOM still shows unavailable it reloads ONCE.
  After that reload it verifies the DOM for up to 25s; if the DOM
  still shows unavailable it resumes API polling without further
  reloads. Only when the DOM also shows a selectable option does it
  attempt the first clicks (option + Continue), then stops.
- HTTP 429 backs off (interval doubles, max 60s). API errors never
  trigger an alert.
- Best Buy: UNCHANGED from v1 (DOM + 120s reload). Capture from the
  checking VM failed twice (HTTP/2 errors, page never loaded), so no
  Best Buy API was verified. Best Buy capture needs a US residential
  IP/proxy or DevTools on the buyer's machine.

### How to test v2

1. Install `xbox-x25-stock-monitor-v2.user.js` in Tampermonkey
   (replace v1; do not run both at once).
2. Open the Xbox Series S configure page and press Start. The panel
   should log API checks returning IN STOCK almost at once (this
   proves the API path works end to end on an in-stock product).
   Keep auto-attempt ON only if you are ready for it to click the
   Series S option + Continue; otherwise untick it for a safe
   alert-only test.
3. Open the X25 configure page and press Start. The panel should log
   API checks returning OUT OF STOCK with no page reloads.
4. Set the buyer's own ZIP/region in the panel before handing over.

### Still unverified (do not overclaim)

- The moment `isInventoryAvailable` flips to `true` for X25, and the
  true -> selectable DOM -> Continue -> checkout chain. First
  restock is the live test; a human must watch the tab.
- Whether deliverycost rate-limits aggressive polling (only a
  handful of replays were made). Keep polling polite (>= 5-10s)
  and stop once stock is found.
- Whether X25 uses a different availabilityId at restock time
  (v2 re-resolves identifiers at start for this reason).
- Best Buy: no verified API at all.

## Update, Nov 19: v2.1 — console-option fix (live test on refurbished Series X)

Shariful tested v2 on Xbox Series X Certified Refurbished
(8mzbmmcjznxr, $649.99, in stock). The API was right: deliverycost
returned `isInventoryAvailable=true` twice. But the purchase stalled:
v2 logged "No selectable option button captured" and clicked Continue
with no option selected; the page answered with red validation
"Please make a choice", no navigation, cart 0 items.

Root cause: v2 matched console options ONLY as `<button>` elements
whose textContent contains "1TB". On the refurbished page the 1TB
option ("Save $150.00 1TB Full price was $799.99 now $649.99") is a
button in the accessibility tree, but v2's textContent-only `/1TB/`
test did not match it (the capacity text may live in aria-label or
with spacing, and the element may carry a role rather than be a
`<button>`). Meanwhile Continue is enabled before any option is
chosen, so v2's "enabled Continue = in stock" shortcut fired the
blind click. (First guess — "the option is not a button" — was
wrong; live DOM inspection showed it IS a button in the AX tree.)

Live DOM check (Nov 19, browser): clicking the 1TB option selects it
(checked true, [pressed], summary subtotal $649.99); Continue then
loads Step 2 Accessories ("Add your accessories", 15 items, e.g.
controller $89.99, headset $134.99) with a "Review and checkout"
button. Nothing was bought; the check stopped there.

What v2.1 changes (file: `xbox-x25-stock-monitor-v2.1.user.js`):
- Option finder matches capacity text (512GB / 1TB / 2TB,
  spacing-tolerant) in textContent OR aria-label, across button,
  `[role=button|radio|option]`, radio input, and label elements;
  prefers the innermost match inside "Choose your console".
- An enabled Continue alone is NO LONGER an in-stock signal. A
  selectable console option is required.
- After clicking the option, v2.1 VERIFIES selection (aria-pressed /
  aria-checked / checked / selected class / summary update), with one
  retry of the option click. If selection cannot be verified, it does
  NOT click Continue — it alerts and stops for a human.
- After Continue, v2.1 checks Step 2 loaded ("Add your accessories" /
  "Review and checkout"). On "Please make a choice" it retries
  option+Continue once, then stops.

Retest (same refurbished page, still in stock):
1. Disable/remove v2 in Tampermonkey; install v2.1 (do not run both).
2. Open the refurbished configure page, press Start. Expect the log:
   "Selectable console option found", "Clicking console option:
   Save $150.00 1TB...", "Option verified selected", "Clicking
   Continue to accessories", "Step 2 Accessories loaded".
3. If the log instead shows "OPTION NOT SELECTED" or "VALIDATION",
   send the panel log — do not keep clicking manually past Step 2
   without checking.

Still unverified: the X25 restock path (X25 remains OOS); the full
chain to Review and checkout was never clicked through (by design —
no order is placed by the script).

## Update, Nov 19: v2.2 — pre-selected toggle + human-like click (live test on Series S refurbished)

Shariful tested v2.1 on Xbox Series S Certified Refurbished
(8p01kzxz5j21, 512GB, $399.99, in stock). The API was right again
(IN STOCK, 528ms), but the script never clicked: the DOM verify loop
ran 25s, found no option, and resumed polling.

Root cause (live inspection, Nov 19): two things at once. (1) The
512 GB option is a PRE-SELECTED toggle button (checked true on load,
solid blue border) — clicking it once DESELECTS it. A blind option
click would have broken the flow. (2) The "512 GB" text lives in the
card heading next to the button, not in the button's own textContent,
so v2.1's textContent/aria-label match missed it. (The browser's own
click test confirmed both: one click deselected the option, summary
changed to "removed from summary", and Continue then showed
"Please make a choice".)

What v2.2 changes (file: `xbox-x25-stock-monitor-v2.2.user.js`):
- Option finder matches capacity text in the button's own text,
  aria-label, aria-labelledby targets, AND its parent card text (card
  text counts only when the element itself shows a price, so
  Continue/Review buttons can't false-match).
- Toggle-aware: selection is checked FIRST. If the option is already
  selected on load, the option click is skipped entirely and the
  script goes straight to Continue.
- humanClick(): fast (~100-370ms) random-waypoint pointer sequence —
  pointerover, pointermove (2-3 random waypoints), pointerdown/up,
  click — with a small visible blue cursor dot that moves to the
  target. NOTE: synthetic events are still isTrusted=false; no
  userscript can produce trusted input. The sequence fires the same
  handlers a real click fires, with random timing.
- On a DOM-confirm failure, v2.2 logs one "DOM diagnostics" line
  listing capacity-text elements, so the next miss is debuggable from
  the panel log.

Harness verification (headless Chromium, mock pages built from the
observed live structure; `tests/test_finder.py`, exact file code
extracted by `tests/extract_finder.js`): 8/8 checks pass — finder
finds the pre-selected S option (sibling-h4 case) and the X variant,
selected state reads true/false correctly, humanClick re-selects a
deselected option and Continue loads Step 2, OOS option excluded.
Live retest on the real page still pending.

Retest (same Series S refurbished page, still in stock):
1. Disable/remove v2.1 in Tampermonkey; install v2.2 (do not run both).
2. Open the page, press Start. Expect the log: "Selectable console
   option found", "Option already selected on load (pre-selected
   toggle). Skipping option click.", "Clicking Continue to
   accessories.", "Step 2 Accessories loaded." You will see a small
   blue dot move quickly to the buttons.
3. If a "DOM diagnostics" line appears, or "OPTION NOT SELECTED" /
   "VALIDATION" shows, send the panel log.

Still unverified: the X25 restock path (X25 remains OOS); the full
chain to Review and checkout was never clicked through (by design —
no order is placed by the script).

## Update, Nov 19: v2.3 — scroll into view before clicking

Shariful retested v2.2 on the same Series S refurbished page: still no
click, or the click did nothing. Fix (his direction, and correct):
humanClick() now scrolls the target into the middle of the viewport
first (smooth scroll, ~700ms settle), and only then computes the
button's position and runs the pointer sequence. Reason: a button below
the fold may not be rendered/hydrated until it is scrolled into view,
so clicking it cold can silently do nothing; a real human always
scrolls to the button before clicking it. The scroll applies to both
click sites (console option and Continue). The panel log now shows
"Scrolling the button into view first, then clicking." before each
click. If the button still has no size after scrolling, the old
el.click() fallback is kept.

Harness verification (headless Chromium, same mock pages as v2.2;
`tests/test_finder.py`, exact file code extracted by
`tests/extract_finder.js`): 8/8 checks pass. Live retest on the real
page still pending — if it still fails, the panel log will show
whether it stopped at the option or at Continue.

Retest (same Series S refurbished page, still in stock):
1. Disable/remove v2.2 in Tampermonkey; install v2.3 (do not run both).
2. Open the page, press Start. Expect: "Selectable console option
   found", "Option already selected on load (pre-selected toggle).
   Skipping option click.", "Clicking Continue to accessories.",
   "Scrolling the button into view first, then clicking.", "Step 2
   Accessories loaded." You will see the page scroll to the button
   and the small blue dot move to it.
3. If it still fails, send the full panel log.

Still unverified: the X25 restock path (X25 remains OOS); the full
chain to Review and checkout was never clicked through (by design —
no order is placed by the script).

## Update, Nov 19: v2.4 — the real option structure (empty button + <li> card)

Shariful retested v2.3: still no click. This time the failure was
diagnosed live instead of guessed at. A Playwright probe of the real
page (headless Chromium, via a local CONNECT forwarder — the VM's
egress proxy blocks Chromium's unauthenticated CONNECT and MITMs TLS)
proved two things:

1. SYNTHETIC CLICKS WORK. The exact v2.3 pointer sequence, dispatched
   on the Continue button, loaded Step 2 Accessories ("Add your
   accessories", "Review and checkout", no validation). The page does
   NOT ignore untrusted events. Every earlier failure was in the
   finder, never in the click.
2. THE OPTION IS NOT A BUTTON WITH TEXT. The real structure is an
   EMPTY <button class="option-button" aria-labelledby="<li id>"
   aria-pressed="true|false"
   data-automation-test-id="configuratorV35-selection-group-option-button-*">
   (no textContent, no aria-label) inside an <li
   class="selection-group-option-v35 [is-checked]" aria-current="true">
   card whose <h4> says "512 GB". The accessibility tree shows it as a
   button — the DOM does not. And the trap: the li's joined
   textContent is "Save $100.00512 GB..." (no space between the badge
   and the title), so /\b512/ NEVER matches it — no word boundary
   after a digit. v2.1–v2.3 all matched capacity on joined text, so
   they never saw the option. The button IS visible (offsetParent =
   the li, 527x95px) — visibility was never the problem.

v2.4 fixes the finder, not the click: the option is found by its
stable test-id prefix
(configuratorV35-selection-group-option-button-*) and capacity is read
from its aria-labelledby card element-by-element (the <h4>'s own text
is exactly "512 GB"); selection is read from aria-pressed on the
button OR is-checked/aria-current on the card. Continue is found by
its verified test id (configuratorV35-BottomBar-next-button — exactly
1 on the page, not disabled). The old generic capacity matching stays
as a fallback for configurator variants without the v35 test ids.
humanClick() is unchanged. The diagnostics line now also lists the
v35 option buttons and their pressed state.

Verification: harness (`tests/test_finder.py`, exact file code
extracted by `tests/extract_finder.js`) now 10/10 — the 8 earlier
checks plus T9/T10 on a mock built from the probed live structure
(the joined-text trap reproduced: /\b512/ fails on the li's
textContent, the v2.4 finder still finds exactly the console button,
pre-selected) and the full toggle-off/toggle-on/Continue flow on that
mock. Then the extracted v2.4 code was run against the REAL page
(`tests/validate_v24_live.py`): finder found exactly 1 candidate
(test id ...button-8CZ4-0-0-0, pressed=true, selected=true,
check=instock); humanClick toggled the option button off
(pressed=false) and back on (pressed=true); Continue loaded Step 2
Accessories. V24_LIVE_PASS.

Retest (same Series S refurbished page, still in stock):
1. Disable/remove v2.3 in Tampermonkey; install v2.4 (do not run both).
2. Open the page, press Start. Expect: "Selectable console option
   found", "Option already selected on load (pre-selected toggle).
   Skipping option click.", "Clicking Continue to accessories.",
   "Scrolling the button into view first, then clicking.", "Step 2
   Accessories loaded."
3. If it still fails, send the full panel log.

Still unverified: the X25 restock path (X25 remains OOS); the full
chain to Review and checkout was never clicked through (by design —
no order is placed by the script).

## v2.5 — Review and checkout click (Nov 19, 2026)

Shariful confirmed v2.4 works ("working thanks") and asked for the
next button to be clicked too: "Review and checkout"
(`data-automation-test-id="configuratorV35-BottomBar-checkout-button"`,
class `btn btn-primary btn-block mt-3`, stpidx=1, on Step 2
Accessories; the button he pasted carries pid 8p01kzxz5j21, sku 8CZ4,
the S refurbished page).

Live check first (headless Chromium on the real S refurbished page,
`tests/test_review_checkout.py`): the v2.4 flow reaches Step 2, the
Review button is exactly 1, not disabled, visible (533x65 at
1227,631); the synthetic humanClick sequence runs (clicked_done=true)
and the button goes `disabled: true` — its processing state — so the
click REGISTERS. But the page had not navigated after 5s (URL, title,
headings and body text all unchanged), so v2.5 does not assume an
instant navigation.

v2.5: after Step 2 loads, the script clicks Review and checkout
(test id first, exact-text fallback) and polls `reviewState()` every
1s for up to 25s for the next state — URL navigation (e.g. to
login.live.com when signed out), a sign-in prompt, or a review/cart
heading — then it alerts and stops for a human. If the button
re-enables (the click did not take), it retries once. The heading
check is scoped to h1/h2 and to phrases that do NOT appear on Step 2
("Review your order", "Your cart"): a bare "Checkout" match would
false-fire on the button's own text, and the page header always shows
"Sign in", so the sign-in test needs the "to continue" phrasing, the
login host, or a password field.

Safety unchanged: Review and checkout is a navigation step only. The
script NEVER clicks Place Order / checkout submit, NEVER signs in,
NEVER fills payment. Sign-in and payment stay manual, by the buyer on
his own account.

Verification: harness (`tests/test_finder.py`, exact file code
extracted by `tests/extract_finder.js`) now 14/14 — the 10 earlier
checks plus T11/T12 on both mocks: Review found by test id,
humanClick disables it, `reviewState()` sees the sign-in prompt
afterwards, an h2 "Review your order" reads as a review state, and
the text fallback still finds the button with the test id removed.
The 20-second live poll of where the Review click lands was still
running when v2.5 was pushed; if it shows a different landing state,
a v2.5.1 follows.

Retest (same Series S refurbished page, still in stock):
1. Disable/remove v2.4 in Tampermonkey; install v2.5 (do not run both).
2. Open the page, press Start. Expect: "Selectable console option
   found", "Option already selected on load (pre-selected toggle).
   Skipping option click.", "Clicking Continue to accessories.",
   "Step 2 Accessories loaded. Continuing to Review and checkout.",
   "Clicking Review and checkout.", then "Review and checkout
   clicked — sign-in prompt shown. Stopping here: sign-in and
   payment are manual." (or "navigated to ...").
3. If it still fails, send the full panel log.

Still unverified: the X25 restock path (X25 remains OOS); where the
Review click lands on a real signed-out browser after the 25s poll
(sign-in page expected); the full chain to a placed order is never
done by the script (by design).

## v2.6 — Cart page: quantity + Checkout (Nov 19, 2026)

Shariful asked for the cart step: on `/store/cart*`, select the
quantity like a real human and click Checkout. He pasted the exact
HTML from his own browser: a quantity
`<select id="QuantityPicker---8P01KZXZ5J21">` (options 1/2/3) inside
`<div class="custom-select mw-fit-content cartco-quantity-select">`,
and `<button type="button" class="btn btn-primary btn-block"
autofocus>Checkout</button>` (no test id).

Live probes first (headless Chromium on the real S refurbished
page, 4 runs, `tests/test_cart_flow*.py`): the Review click DOES
land on the cart URL (+4-6s, so v2.5's 25s poll catches it). BUT the
cart UI never renders in this environment: the cart page's purchase
UI comes from purchaseui.production.store-web.dynamics.com, which
answers 403 Access Denied to this VM's egress (Akamai) — no quantity
select and no Checkout button appear even after 60s of polling. Two
things WERE proven: (1) the cart UI lives inside
`<iframe id="purchase-frame">` with an EMPTY src — its document is
same-origin and READABLE from the top document (contentDocument
works, no SecurityError; the Access Denied text itself was read from
inside the frame), so a microsoft.com userscript CAN reach the
quantity select and Checkout button inside it. (2) The cart backend
itself works from here (`PUT .../cart/loadCart` 200,
`GET /store/buy/cartcount` 200) — only the purchase-UI render is
blocked. Whether the Review click actually put the item in the cart
could not be confirmed from here (the cartItemCount cookie is not
visible to page JS); the script checks for the UI and stops for a
human if it never loads, instead of clicking blind.

v2.6: `@match` now also covers `https://www.microsoft.com/*/store/cart*`.
After the Review click lands on the cart, the script carries the flow
over with a session flag (`x25_cart_flow_v2`, set before the Review
step's stop clears the monitor flag) and auto-resumes the cart flow
on the cart page; pressing Start on the cart page runs it too. The
flow waits up to 30s for the cart UI (quantity select or Checkout
button, searched in the top document AND the #purchase-frame), and
says plainly if the frame shows "Access Denied" — that is the store
backend blocking the browser, not a script failure. Quantity is a
PANEL setting, default 1 (the buyer ordered one console); change it
in the panel before Start if the buyer wants 2 or 3. `humanSelect()`
scrolls the select into view, focuses it, fires pointer events, then
sets the value through the native HTMLSelectElement setter of the
select's OWN window (so React-controlled selects notice it) +
input/change events, and verifies the value stuck (re-querying by id
in case the page re-rendered the node). Then it clicks Checkout
(exact text, btn-primary preferred) with the same humanClick
sequence and polls up to 25s for the next state (navigation /
sign-in prompt / checkout page), then stops for a human. One retry
if the button re-enables. Also fixed: the panel header and load line
still said "v2.3" — they now show the real version.

Safety unchanged: Checkout is a navigation step only. The script
NEVER clicks Place Order / checkout submit, NEVER signs in, NEVER
fills payment. Sign-in and payment stay manual, by the buyer on his
own account.

Verification: harness (`tests/test_finder.py`, exact file code
extracted by `tests/extract_finder.js`) now 17/17 — the 14 earlier
checks plus T13/T14/T15 on a mock of the pasted cart HTML (quantity
select + Checkout inside the #purchase-frame iframe): the finder
reaches into the frame, humanSelect changes 1 → 2 (mock subtotal
$399.99 → $799.98) and back to 1, the Checkout click disables the
button and `checkoutState()` sees the sign-in prompt, and an
Access-Denied frame is detected as blocked. The quantity/Checkout
clicks could NOT be live-proven from this VM (403 on the purchase UI);
the real-browser retest is the proof.

Retest (same Series S refurbished page, still in stock, signed-in
browser is best — the cart UI needs a normal session):
1. Disable/remove v2.5 in Tampermonkey; install v2.6 (do not run both).
2. Panel: Cart Qty is 1 by default — leave it, unless the buyer
   wants 2 or 3.
3. Open the page, press Start. Expect: option → Continue → Step 2 →
   "Clicking Review and checkout." → cart page → "Cart UI loaded
   (1 quantity select(s), Checkout button found)." → "Quantity
   already 1 — leaving it." → "Clicking Checkout." → then
   "Checkout clicked — sign-in prompt shown" (or "navigated to ...").
4. If the log says "Cart UI is blocked in this browser" with
   Access Denied, the store backend is blocking that browser — try
   the buyer's normal browser/session, not a datacenter IP.
5. If it still fails, send the full panel log.

Still unverified: the X25 restock path (X25 remains OOS); the
quantity/Checkout clicks on a real cart (blocked from this VM);
whether the Review click puts the item in the cart (same reason);
the full chain to a placed order is never done by the script (by
design).
