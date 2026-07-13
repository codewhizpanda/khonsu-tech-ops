# Khonsu Tech OPS — Initial Store Launch Checklist

This is the runbook for taking Khonsu Tech OPS from "code deployed" to "staff actually using it at the counter." Work through it roughly in order — later phases assume earlier ones are done. Check items off as you go; re-run the whole checklist (or at least Phases 5–8) if the Apps Script or master list changes materially before you actually flip staff over to it.

**App URL:** https://codewhizpanda.github.io/khonsu-tech-ops/ (already live — every push to `main` redeploys it automatically via GitHub Actions. Nothing to do here except bookmark it on every staff device.)

---

## Phase 1 — Google Sheets backend

- [ ] Create a new Google Sheet (`sheets.new`). Name it something recognizable, e.g. "Khonsu Sales".
- [ ] In the Sheet: **Extensions → Apps Script**. Delete any placeholder code.
- [ ] In the app: log in as **Admin** → **Settings → Google Sheets Sync** tab → **Copy Script** → paste it into the Apps Script editor → save.
- [ ] **Deploy → New Deployment → Web app.** Set *Execute as:* **Me**, *Who has access:* **Anyone**. Deploy, then copy the Web App URL it gives you.
- [ ] Back in the app's Setup/Sync tab, paste that URL into **Connect**. A success message confirms it and auto-creates all 11 sheet tabs (Sales Log, Inventory, Purchase Orders, PO Items, Payment Logs, Promotions, Freebies, Settings, Units, Issue Log — Master List is created on first push).
- [ ] **Push All Data** (same tab) — seeds the sheet with the local master list, inventory, promotions, freebies, and settings.
- [ ] Open the Sheet and eyeball a couple of tabs (Inventory, Master List) to confirm real data landed, not blank rows.

> **This same Web App URL is what every staff device connects to.** Write it down somewhere safe (e.g. a password manager or a note only Admin can access) — you'll paste the identical URL into each device in Phase 6, not create a new deployment per device.

---

## Phase 2 — Admin PIN (do this before anyone else touches the app)

- [ ] The Admin PIN defaults to **`1234`** until changed — this is public knowledge (it's in the source code), so treat it as already compromised.
- [ ] Settings → General → **Change Admin PIN**. This requires Sheets to already be connected (Phase 1) — the new PIN is verified server-side going forward.
- [ ] Store the new PIN somewhere only Admin/the owner can access. There's no "forgot PIN" recovery flow other than editing the `Settings` tab's `AdminPinHash` row directly in the Sheet (or clearing it to fall back to the default).

---

## Phase 3 — Staff logins

The lock screen currently shows three fixed logins: **Sam**, **Joyce**, **Admin**. These are hardcoded labels, not configurable in Settings.

- [ ] Confirm "Sam" and "Joyce" match your actual staff's names. **If not, tell me and I'll rename them in the code** (`LockScreen.vue` — small, contained change) before launch, since renaming later means everyone re-picks their name but doesn't lose any data (names are just labels, not accounts).
- [ ] There is no password for Sam/Joyce — anyone with physical access to the device can pick either name. This is by design (a soft convenience gate, not real security) — make sure staff and the owner both understand that.

---

## Phase 4 — Business settings

All in Settings → General, all Admin-only:

- [ ] **Daily Target** — defaults to ₱3,000. Set to your real daily sales goal.
- [ ] **Low Stock Alert** — defaults to 2 units. Set to whatever threshold should visually flag low stock on the Inventory page.
- [ ] **Default Reorder Point** — defaults to 1 unit (auto-generates a PO line when stock hits this). Adjust and **Apply to All**, then fine-tune any SKU that needs a different reorder point in the table below it (e.g. faster-moving models).
- [ ] **Pasa Amount Cap** — defaults **on**. Leave it on unless you specifically want staff able to enter a Pasa markup larger than the item's own margin.

---

## Phase 5 — Master list & inventory accuracy

The app ships pre-seeded with your real ITEL catalog (47 SKUs — Bar Phones, Smart Phones, Tablets, etc. with cost/SRP already filled in), not placeholder data. Still worth a pass before real money moves through it:

- [ ] Master List page: skim every row — confirm **Unit Price** (cost) and **SRP** are current. Prices change; this seed data has a timestamp the moment it was written.
- [ ] Confirm **colors** per model match what's actually stocked.
- [ ] Mark anything truly discontinued as **Obsolete** rather than deleting it (keeps historical sales data intact).
- [ ] Add any new/missing SKUs the store carries that aren't in the seed list yet (Master List → **+ New Product**).
- [ ] Review **Promotions** and **Freebies** — the seed data likely has none; add your current bundle deals and freebie pairings if any are active.
- [ ] **Inventory page**: this is where it gets store-specific. Every product defaults to **stock: 4** regardless of what's physically on the shelf. Correct every SKU's actual on-hand count — this is the single most important data-accuracy step before go-live, since Sold/Report/PO logic all depend on it.

You can make all of the above edits either in the app itself, or in bulk directly in the Google Sheet's **Master List**/**Inventory** tabs (faster for a large one-time correction) — then **Settings → Google Sheets Sync → Pull Latest Data** to bring the corrected numbers into any device without waiting for the next login. Note this only carries prices/quantities; it does **not** by itself give you real per-unit IMEIs — that's Phase 6.

---

## Phase 6 — IMEI reality check (Smart Phones / Bar Phones / Tablets only)

This is the step it's easiest to skip and regret. Read it even if you're in a hurry.

The app auto-generates placeholder **`DUMMY-...`** IMEIs to match whatever stock count you enter in Phase 5 — it has no way to know the *real* IMEI printed on a box unless someone actually scans it in.

- [ ] Decide: do you want barcode scanning to work against your **existing** physical inventory (units already on the shelf before launch), or only for **new deliveries** going forward?
  - **Existing stock, scan-ready from day one — two ways to load it:**
    - *One at a time, in-app:* for each phone/tablet/bar-phone unit currently in stock, go to **Receive Stock** and scan (or type) its real IMEI. Use a DR number like `INITIAL-STOCKTAKE` so it's identifiable in the log later.
    - *Bulk, directly in the Sheet (faster for a large stocktake):* paste rows straight into the **Units** tab — columns are `IMEI, ProductKey, ProductName, Color, Status, DRNumber, ReceivedDate, SONumber, SoldDate, IsDummy` (`Status` = `available`, `IsDummy` = `false`, `ProductKey` must exactly match the product's key format, e.g. `A100C 3GB/64GB`). Then in the app: **Settings → Google Sheets Sync → Pull Latest Data.** Real units automatically replace any local `DUMMY-...` placeholder for the same product once they cover its stock count — no manual cleanup needed.
    - Either way, this takes real time proportional to your unit count — budget for it.
  - **New deliveries only:** skip this. Existing stock keeps its dummy placeholders (quantity-accurate, but scanning a real box's barcode against old stock won't find a match — staff will need to type/select the unit manually instead of scanning it, same as before this feature existed). Every unit received *after* launch via Receive Stock will have a real, scannable IMEI.
- [ ] Either way, confirm at least one test scan works end-to-end (Phase 8 covers this).

---

## Phase 7 — Install on every staff device

The app is a PWA — it installs like a native app and works offline (queues sync when connection returns).

- [ ] **iPhone (Safari):** open the app URL → tap the **Share** icon → **Add to Home Screen**.
- [ ] **Android (Chrome):** open the app URL → menu (⋮) → **Install app** (or the automatic "Add to Home Screen" banner).
- [ ] On each device: open the installed app and log in. The app now ships pre-connected to the production Web App URL (defaulted in `src/stores/state.js`), so **Setup/Sync should already show "✓ Connected"** with no manual paste needed. Only use **Setup/Sync tab → paste Web App URL → Connect** if this device needs to point at a different spreadsheet/script.
- [ ] On first camera/barcode use per device, grant the camera permission prompt when asked (needed for both Receive Stock and Log Sale scanning).
- [ ] Confirm each device shows the real inventory counts/prices from Phase 5, not the original seed defaults — if it still shows stale numbers, the connect step above didn't complete, or the queue needs a manual "Sync Now."

---

## Phase 8 — Dry run (do this with real staff, before real customers)

Walk through each of these once, end to end, as if it were a real transaction — on more than one device if you have more than one:

- [ ] Log a **Walk-in** sale (with an add-on accessory).
- [ ] Log a **Pasa** sale — confirm the Pasa cap behaves as expected (Phase 4).
- [ ] Log a **Promotion/bundle** sale, if any bundles are configured.
- [ ] For an IMEI-tracked product: **scan a real barcode** on the Sales form and confirm it finds the unit (this is the exact flow that was broken and just got fixed — worth double-checking here).
- [ ] **Receive Stock**: add a unit both by scanning and by typing an IMEI manually; add a qty-mode accessory restock too.
- [ ] View **Today's Report**, confirm the numbers look right, then **Print** (make sure pop-ups aren't blocked for this site).
- [ ] Let stock drop to/below its reorder point on one SKU and confirm a **Purchase Order** gets auto-generated (or generate one manually and edit it).
- [ ] Log a Bisen Maya payment, mark it **Credited**, then **Settle** it — confirm the Accounts Payable numbers move as expected.
- [ ] Check the **Dashboard** and **Reports** pages render real numbers.
- [ ] Check **Sync Issues** (`/issues`) — should be empty. If anything shows up during the dry run, resolve it before go-live rather than carrying it into day one.
- [ ] From a second device, confirm a sale logged on device A shows up (via Sync Now / pull) on device B — this is the actual cross-device promise of the whole system.

---

## Phase 9 — Go-live day

- [ ] Do one final **Push All Data** from Setup/Sync if you made any last-minute Master List/Inventory edits during the dry run.
- [ ] Brief staff: how to pick their name, how Walk-in vs. Pasa works, when to use the camera scan vs. typing an IMEI, and what the amber "N unsynced items" banner means (it's fine — it means offline queueing is working, it'll clear on its own once back online, or tap **Sync Now**).
- [ ] Tell staff **never to clear browser data/history on the work device** without first confirming the sync banner is clear — `localStorage` is the only local copy of anything not yet pushed to Sheets.
- [ ] Go live.

---

## Phase 10 — First week / ongoing

- [ ] Check **Sync Issues** daily for the first week — this is where anything that failed to sync (and why) surfaces, instead of silently vanishing.
- [ ] Reconcile **Payment Logs** (Accounts Receivable/Payable) at whatever cadence matches your actual bank/Bisen payout schedule.
- [ ] Revisit reorder points after a couple of weeks of real sell-through data — the Phase 4 defaults are a starting guess, not a forecast.
- [ ] If you ever redeploy a new Apps Script version (because this repo's script changed), remember: **updating the code here does not update your live script.** You must re-copy from Setup/Sync and go Deploy → Manage Deployments → Edit → New Version, or new actions will silently fail for everyone until you do.

---

## Known limitations worth knowing up front

- No real user authentication — the PIN is a convenience gate, not security. Anyone with the device can act as any staff name.
- SO/PO numbers are generated per-device and not coordinated across devices — two devices used simultaneously *could* generate a duplicate number. Low risk for a single-counter shop, worth knowing if you ever run two registers at once.
- `localStorage` is tied to the browser/device — moving the app to a different URL later would orphan any device's not-yet-synced local data.
- The iOS barcode scanner fallback (ZXing, added recently) is slower to lock onto a barcode than Android's native scanner, especially in low light. Functional, just not instant.
