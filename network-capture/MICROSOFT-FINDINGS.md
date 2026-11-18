# Network-capture findings — Microsoft Store stock API (Nov 18, 2026)

Captured headless with Playwright + local CONNECT forwarder (VM egress proxy
blocks direct Chromium traffic; curl alone works). No purchase, no cart,
no sign-in, no payment, no account changes. No credentials in this file.

## Products compared (live, same session shape, signed out)

IN STOCK — Xbox Series S configure page
- URL: https://www.microsoft.com/en-us/store/configure/Xbox-Series-S/942j774tp9jn
- Product id: 942j774tp9jn. Title: "Buy XBOX Series S: 512GB or 1TB White"
- Wording: "512GB, Robot White $499.99" and "1TB, Robot White $599.99",
  each with "Get it as soon as November 19 to 90001 when you choose express
  shipping". No "Out of stock" label. Summary pre-selects 512GB $499.99.
  "Continue to accessories" button: enabled.

OUT OF STOCK — Xbox Series X25 Limited Edition configure page
- URL: https://www.microsoft.com/en-us/store/configure/xbox-series-x25-limited-edition/8wg5vqp0x4h3
- Product id: 8wg5vqp0x4h3. Wording: "Out of stock", "1TB", "$899.99".
  "Continue to accessories" disabled. Step 2 Accessories unavailable.

## Finding 1 (PRIMARY — verified live): delivery-cost / inventory API

Neither page load fires a DisplayCatalog or inventory XHR. The ONLY
product-related XHR observed was on the in-stock page, fired because a
console option was auto-selected:

POST https://dcc.mp.microsoft.com/v1.0/deliverycost/us?mode=continueOnError
- Headers sent by the page: accept, content-type (application/json),
  ms-cv, referer, sec-ch-ua*, user-agent. NO Authorization, NO Cookie.
  Direct curl WITHOUT ms-cv/cookies returned HTTP 200, so the call is
  anonymous. Response includes access-control-allow-origin (CORS-friendly).
- Request body (exact shape captured, then replayed via curl):
  {"deliveryGroups":[{"shipToInformation":{"countryCode":"US",
  "postalCode":"95037","region":"CA"},"deliveryGroupId":"sfwPdpDeliveryGroup",
  "lineItems":[{"availabilityId":"<AVAILABILITY_ID>","skuId":"<SKU_ID>",
  "isDeliveryRequired":true,"productId":"<PRODUCT_ID>","quantity":1,
  "lineItemId":"item0","catalogId":1}]}],"orderingExperience":"Consumer"}
- Stock field: deliveryGroups[].lineItems[].isInventoryAvailable (boolean).
  Do NOT use deliveryCosts presence/prices/dates as a signal: methods,
  prices and estimated dates are present even when unavailable.
- Verified by direct replay (cookieless curl, ~1.1-1.7s each):
  - Series S, skuId 2JBX, availabilityId 8WH0910DCX37: isInventoryAvailable=true
  - Series S, skuId Z1F6, availabilityId 8RKC5V6987JH: isInventoryAvailable=true (browser capture)
  - X25, skuId Q2BG, availabilityId 8S856RCB2BDV: isInventoryAvailable=false
  - X25, skuId JXZJ, availabilityId 93K6GL6PF64Z: isInventoryAvailable=false
- ZIP robustness: Series S still true with postalCode 10001/region NY;
  X25 Q2BG still false with postalCode 90001/region CA. Signal is not
  ZIP-sensitive across the ZIPs tested.
- Example response fields per line item: lineItemId, productId, skuId,
  availabilityId, catalogId, quantity, isDeliveryRequired, distributorId
  (9000000013 in all samples), isDeliveryCostOverride, render (true),
  showDateOverride, lotType ("current"), isInventoryAvailable,
  deliveryCosts[]: deliveryMethodId (0001/0002/0006/0009), price,
  estimatedDeliveryDate {date, cutoffTime, plant, estimatedShipDate}.
  Example: Series S method 0002 price 0.0, est. date 2026-11-20, plant N790.
  X25 plant was N260 in samples; plant id is not a stock signal.
- The X25 page itself did NOT fire this call on load (nothing selectable),
  so the Tampermonkey script must poll it directly with the X25 identifiers
  (from DisplayCatalog or the embedded page JSON below), NOT wait to observe
  it in page traffic. Poll the Q2BG availability (8S856RCB2BDV); JXZJ is the
  pre-order SKU (release 2027-01-13) and is not the buyable listing.

## Finding 2 (SECONDARY — verified live): embedded configurator JSON in page HTML

The configure-page HTML itself embeds a JSON blob (server-rendered, fresh
per request) with a `skus` array. Each entry carries:
  availabilityId, skuId, buttonTitle, configuration, title, tileText,
  inventory {inStock: bool, text: string}, inventoryControlSku,
  preOrder {isPreOrder, releaseDate, preOrderText}, price {listPrice, msrp,
  displayListprice, currencyCode}, edd.
- Series S: 2 entries, inventory.inStock=true, text="" (prices $499.99/$599.99).
- X25: 1 entry, skuId Q2BG, availabilityId 8S856RCB2BDV,
  inventory {inStock:false, text:"Out of stock"}, listPrice 899.99,
  inventoryControlSku EP2-84713, preOrder.isPreOrder=false.
- Note: raw HTML contains the phrase "Out of stock" even on the in-stock
  Series S page (1x, in script/template text), so grepping HTML text is NOT
  a reliable signal. Parse the `skus` JSON or use Finding 1.
- A script could fetch the page HTML (same-origin fetch, no visible reload)
  and parse `skus[].inventory.inStock`, but the deliverycost POST (Finding 1)
  is lighter (~3KB JSON vs ~165KB HTML) and is the recommended poller.
  Recommended v2 logic: poll deliverycost every N seconds; on
  isInventoryAvailable=true, re-check once, then reload/navigate to the
  configure page and run the DOM click flow. Never treat a single true
  reading as proof until the DOM also shows a selectable option.

## Finding 3 (NON-SIGNAL — confirmed): DisplayCatalog Actions do not discriminate

GET https://displaycatalog.mp.microsoft.com/v7.0/products/{id}?market=US&languages=en-US
- Series S (in stock) SKUs 2JBX/Z1F6: Actions
  [Browse, Curate, Details, Fulfill, Purchase] — identical to X25 Q2BG
  (out of stock). No stock boolean in the payload.
- Use DisplayCatalog ONLY to resolve productId -> skuId/availabilityId
  (response shape: {"Product": {"ProductId", "PreferredSkuId",
  "DisplaySkuAvailabilities": [{"Sku": {"SkuId", ...}, "Availabilities":
  [{"AvailabilityId", "Actions", ...}]}]}}). Never poll Actions for stock.

## Other endpoints observed (not stock signals)

- GET /store/buy/cartcount (200) — cart count only.
- GET cascadeauth silentauth + login.microsoftonline.com/live.com redirects
  — the page's own anonymous auth check; no sign-in performed, no credentials.
- POST target.microsoft.com/rest/v1/delivery — Adobe Target personalization.
- Telemetry/analytics only: browser.events.data.microsoft.com OneCollector,
  clarity.ms, googletagmanager, bing, facebook, doubleclick, etc.
- No polling observed: no repeated availability XHR during 12s idle on
  either page. No CAPTCHA, bot challenge, or block page on microsoft.com.

## Best Buy: capture NOT possible from this VM (stopped after 2 attempts)

- Attempt 1 (curl via forwarder): HTTP/2 stream error, 0 bytes.
- Attempt 2 (Playwright via forwarder): net::ERR_HTTP2_PROTOCOL_ERROR,
  page never loaded, 1 request, no response. Logs kept under
  bestbuy-instock/ as evidence of the failure. No further attempts made.
- Use the existing Nov 6 findings instead (see
  ~/workspace/network-interceptor/FINDINGS.md): tcfb buttonstate v5
  per-store, PDP JSON-LD availability, GraphQL fulfillment query
  (Akamai-cookie-bound), official Developer API. NONE of those were
  re-verified for Xbox SKU 6690019 in this task, and the tcfb v5 result
  was for PS5 SKU 6646420 only. Best Buy capture needs a US residential
  IP/proxy or a real browser with DevTools on the buyer's machine.

## What could NOT be verified

- The exact moment isInventoryAvailable flips to true for X25 (product
  stayed out of stock throughout). The true->buyable chain (DOM selectable
  + Continue enabled + checkout) is still untested live.
- Whether deliverycost rate-limits or blocks aggressive polling (only a
  handful of manual replays were made; keep poll interval polite, e.g.
  >= 5-10s, and stop polling once stock is found).
- Best Buy: no new capture at all (see above).
- Whether the X25 listing uses a different availabilityId at restock time
  (identifiers should be re-resolved from DisplayCatalog/embedded JSON at
  script start, not hardcoded forever — but Q2BG/8S856RCB2BDV is correct
  as of Nov 18, 2026).

## Files in this folder

- microsoft-instock/: network_log.json, endpoints.txt, traffic.har, page_dump.txt (123 requests)
- microsoft-x25/: network_log.json, endpoints.txt, traffic.har, page_dump.txt (123 requests)
- bestbuy-instock/: same files, failed load (1 request, error recorded)
- api-probes/: raw deliverycost responses (dcc_*.out) + DisplayCatalog Series S JSON
- MICROSOFT-FINDINGS.md: this file
Note: network_log.json files contain request/response headers for debugging;
keep them local, do not share publicly.
