# Xbox X25 Stock Monitor

**Version 2.9** — a small browser script that watches the Microsoft Store page for the **Xbox Series X25 Limited Edition (1TB, $899.99)** and buys it for you automatically when it comes back in stock.

No technical knowledge needed. If you can install a browser add-on, you can use this.

---

## What it does, step by step

0. **If you are not signed in**, it signs in for you — but only if you saved the test account password in the panel (see "Signing in by itself" below). It types the password one character at a time, like a person, and clicks **Next**.
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
- **A Microsoft account, signed in** in that same browser, with a **payment method saved** on it. The script never types payment details — that part is yours. If you are not signed in, the script can sign in for you if you give it the test account password (see "Signing in by itself" below).
- The Xbox page open: https://www.microsoft.com/en-us/store/configure/xbox-series-x25-limited-edition/8wg5vqp0x4h3

---

## Install (do this once)

1. Install **Tampermonkey** in your browser and turn it on.
2. Open the file **`xbox-x25-stock-monitor-v2.9.user.js`** from this repo. Tampermonkey will ask if you want to install it — click **Install**.
3. If you installed an older version before, remove it first: in Tampermonkey, delete any older "Xbox X25 Stock Monitor" script, so only version 2.9 is running. Two versions at once will fight each other.
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
- **Microsoft account password (test account only).** Type the test account password here to let the script sign in by itself. It is saved in your browser only — never in the script file — and it is cleared after a successful sign-in. Press **Clear** to remove it. Never type your main account password here.
- **Auto-attempt first click when in stock.** On by default. This means the script clicks for you when it finds stock. If you turn it off, it only alerts you and waits.
- **Test sound.** Plays the alert sound so you know what it sounds like.
- **Stop.** Stops everything.

### Signing in by itself (optional)

If the browser is not signed in to the Microsoft account, the script can sign in for you — but only if you saved the test account password first:

1. In the panel, type the **test account password** into the "Microsoft account password" box. As soon as you leave the box, it is saved in your browser only. The box goes blank again — that is normal; the password is saved, not lost.
2. When the Microsoft sign-in page appears, the script types the saved password one character at a time, like a person, and clicks **Next**.
3. After a successful sign-in, the saved password is **cleared** from your browser.

What stays yours to do:

- If the page asks for the **email address** first, type it yourself. The script takes over at the password step.
- If it asks **"Stay signed in?"**, click **Yes** yourself.
- If it asks for a **code** or extra verification ("verify it's you"), the script cannot pass that — type the code yourself.

Use the **test account only**. Never put your main Microsoft account password in the panel. Anyone who can open this browser could read a saved password, and Microsoft may flag an account if it sees automated sign-ins.

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
| `Password needed — check the panel` | No password is saved, so the script cannot sign in. | Type the test account password in the panel's password box and press Start. |
| `Sign-in error` | Wrong password, or Microsoft is asking for extra verification. | Check the tab. Fix the password in the panel, or finish signing in yourself. |
| `No password field appeared` | This may be the email step, not the password step. | Type the email address yourself; the password step follows. |
| `Quantity is now 2` (or another number) | It changed the cart quantity to the number you set. | Check that the number is the one you wanted. |

If it stops for any other reason, copy the whole log from the panel and send it to the person who gave you the script.

---

## What it never does

- It signs in only if you saved the test account password in the panel. It never signs in on its own without that.
- It never saves the password in the script file. The password lives in your browser only, and it is cleared after a successful sign-in.
- It never types, reads, or changes payment details.
- It never changes your account settings.
- It never buys anything unless the **Auto PLACE ORDER** box is on.

---

## Honest limits — please read

- The automatic sign-in was tested on a copy of the sign-in page, not on a real sign-in yet. Microsoft may ask for extra verification (a code, "verify it's you") that the script cannot pass — then you sign in yourself.
- The Xbox X25 has been **out of stock the whole time**, so the full automatic buy has **not run on a real restock yet**. Nobody has seen it buy a real X25.
- The steps were tested on a similar console page that was in stock (Xbox Series S, refurbished) and on test copies of the cart and checkout pages. The watch → pick → Continue → Review steps were confirmed working on the real store page.
- Stock can sell out while the script is working. Finding stock does not guarantee a completed order.
- The store can change its pages at any time. If a button moves or changes, the script may stop and wait for you — that is safer than clicking the wrong thing.

---

## Files in this repo

- **`xbox-x25-stock-monitor-v2.9.user.js`** — the script. This is the only version. Install this one.
- **`README.md`** — this guide.
- **`network-capture/MICROSOFT-FINDINGS.md`** — technical notes on how the store's stock check works (for developers only).
