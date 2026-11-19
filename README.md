# Xbox X25 Stock Monitor

**Version 2.8** — a small browser script that watches the Microsoft Store page for the **Xbox Series X25 Limited Edition (1TB, $899.99)** and buys it for you automatically when it comes back in stock.

No technical knowledge needed. If you can install a browser add-on, you can use this.

---

## What it does, step by step

1. **Watches** the Xbox page. It checks the store every few seconds, at a random time between checks, so it does not check like a clock.
2. **When the console is back in stock**, it picks the console option and clicks **Continue**.
3. It clicks **Review and checkout**.
4. On the cart page, it sets the **quantity** (1 by default) and clicks **Checkout**.
5. On the checkout page, it clicks **Place order** — but only if you turned that on (see the safety box below). Otherwise it stops there and waits for you.

While it watches, it plays a sound and flashes the browser tab title when it finds stock.

---

## Before you start, you need

- **Google Chrome or Microsoft Edge** on a computer.
- **Tampermonkey** — a free browser add-on that runs scripts like this one. (Install it from the Chrome Web Store or the Edge add-ons site.)
- **A Microsoft account, signed in** in that same browser, with a **payment method saved** on it. The script never signs you in and never types payment details — that part is yours.
- The Xbox page open: https://www.microsoft.com/en-us/store/configure/xbox-series-x25-limited-edition/8wg5vqp0x4h3

---

## Install (do this once)

1. Install **Tampermonkey** in your browser and turn it on.
2. Open the file **`xbox-x25-stock-monitor-v2.8.user.js`** from this repo. Tampermonkey will ask if you want to install it — click **Install**.
3. If you installed an older version before, remove it first: in Tampermonkey, delete any older "Xbox X25 Stock Monitor" script, so only version 2.8 is running. Two versions at once will fight each other.
4. Open the Xbox page above. A small dark panel appears in the **bottom-right corner**. That is the script.

---

## How to use it

1. Open the Xbox page and **sign in** to your Microsoft account if you are not already.
2. In the panel, check the settings (explained below).
3. Click **Start**. The panel shows what it is doing and counts down to the next check.
4. Leave the tab open. When the console is in stock, the script does the steps above and alerts you.
5. Click **Stop** any time to stop it.

### The panel, control by control

- **Check delay (random) — min / max seconds.** How long it waits between checks. Default is **4 to 12 seconds**, and each wait is a different random time inside that range. You can change it — for example, 10 to 30 seconds to check more slowly. Smaller numbers check faster; bigger numbers are gentler on the store.
- **ZIP / Region.** The delivery area the store checks stock for. Default is ZIP **95037**, region **CA**. You can change it to your own delivery area.
- **Cart Qty.** How many consoles to buy. Default is **1**. Change it before you press Start if you want more.
- **Auto-attempt first click when in stock.** On by default. This means the script clicks for you when it finds stock. If you turn it off, it only alerts you and waits.
- **Test sound.** Plays the alert sound so you know what it sounds like.
- **Stop.** Stops everything.

### The safety box — read this before you turn it on

> **Auto PLACE ORDER on the checkout page**

This checkbox is **OFF by default**, and that is on purpose.

- **Off (default):** the script stops at the checkout page. It never buys anything. You finish the purchase yourself.
- **On:** the script clicks **Place order** and completes a **real purchase** that charges the payment method saved on your Microsoft account.

Only turn it on when you are ready to buy. The first time it runs with the box on, it will place a real order.

Before it clicks Place order, the panel writes the order total in its log, so you can see the amount.

### What the panel shows while it runs

- **Status line** — what it is doing right now (for example, "OUT OF STOCK" or "Next check in ~7s").
- **Next check in ~Ns** — a countdown to the next check.
- **Log** — a running list of everything it did, newest at the bottom. For example, "API check #12: OUT OF STOCK" means check number 12 found nothing yet.

---

## If it stops or something looks wrong

| What you see | What it means | What to do |
|---|---|---|
| `Auto place order is NOT armed` | The Place order box is off, so it did not buy anything. | That is normal. Turn the box on only if you want it to buy. |
| `Cart UI is blocked in this browser` or `Access Denied` | The store is blocking that browser from showing the cart. This is the store, not the script. | Try your normal browser, signed in as usual. |
| `Place order button did not appear within 30s` | The checkout page did not finish loading. | Look at the tab. If the page is fine, press Start again. |
| `Rate-limited (429). Backing off...` | The store asked it to slow down. | Nothing to do. It waits longer on its own. |
| The panel does not appear | Tampermonkey is off, or an old version is also installed. | Turn Tampermonkey on, remove old versions, reload the page. |
| `Quantity is now 2` (or another number) | It changed the cart quantity to the number you set. | Check that the number is the one you wanted. |

If it stops for any other reason, copy the whole log from the panel and send it to the person who gave you the script.

---

## What it never does

- It never signs in to your account.
- It never types, reads, or changes payment details.
- It never changes your account settings.
- It never buys anything unless the **Auto PLACE ORDER** box is on.

---

## Honest limits — please read

- The Xbox X25 has been **out of stock the whole time**, so the full automatic buy has **not run on a real restock yet**. Nobody has seen it buy a real X25.
- The steps were tested on a similar console page that was in stock (Xbox Series S, refurbished) and on test copies of the cart and checkout pages. The watch → pick → Continue → Review steps were confirmed working on the real store page.
- Stock can sell out while the script is working. Finding stock does not guarantee a completed order.
- The store can change its pages at any time. If a button moves or changes, the script may stop and wait for you — that is safer than clicking the wrong thing.

---

## Files in this repo

- **`xbox-x25-stock-monitor-v2.8.user.js`** — the script. This is the only version. Install this one.
- **`README.md`** — this guide.
- **`network-capture/MICROSOFT-FINDINGS.md`** — technical notes on how the store's stock check works (for developers only).
