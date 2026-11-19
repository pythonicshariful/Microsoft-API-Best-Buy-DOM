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
