# Khonsu Tech OPS — Technical Architecture Document

**Store:** Khonsu Electronic Gadgets Trading (ITEL Mobile)
**Location:** Space No. K424.6, Festival Mall, FCC, Alabang, Muntinlupa City, Philippines
**Currency:** Philippine Peso (₱)
**Document status:** Reflects the codebase as of **2026-07-05** (Vue 3 SPA on `main`). Superseded architectures (single-file HTML, vanilla ES-module version) are preserved as git history/tags — see [§13](#13-project-history--legacy-versions).

---

## 1. Purpose & Scope

Khonsu Tech OPS is a point-of-sale and back-office system for a single mobile-phone retail counter. It replaces manual logbooks with a guided sales flow (product → variant → pricing → review → confirm), tracks inventory (including per-unit IMEI for phones/tablets), generates purchase orders, and optionally mirrors all data to a Google Sheet so the owner can monitor sales remotely.

It is built to run **without a dedicated backend**: the browser is the primary datastore (`localStorage`), and Google Sheets (via Apps Script) is an optional, eventually-consistent mirror.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Vue 3** (`<script setup>` SFCs) | Composition API throughout |
| Build tool | **Vite 5** | Pinned below latest — Node 20.12 environment constraint (Vite 6+ needs Node 20.19+) |
| State | **Pinia 2** (setup-store syntax) | Single store, `useAppStore()` |
| Routing | **Vue Router 4**, hash mode (`#/sales`) | Enables static hosting with no server rewrite rules |
| PWA | **vite-plugin-pwa 0.20** | `autoUpdate` service worker, manifest supplied manually |
| Styling | Plain CSS (`css/styles.css`), CSS custom properties | No Tailwind/UI kit |
| Fonts | Google Fonts — Inter (UI), JetBrains Mono (numbers/codes) | `@import` in CSS + `<link>` preconnect in `index.html` |
| Persistence | Browser `localStorage` | Source of truth when offline |
| Optional backend | **Google Apps Script** Web App bound to a Google Sheet | Free, no hosting; acts as the sync target and cross-device source of truth |
| Hosting | **GitHub Pages**, deployed via GitHub Actions | `vite.config.js` sets `base: '/khonsu-tech-ops/'` |

**Requirements to run:** Node 20 + npm for development (`npm run dev`); any modern mobile/desktop browser to use the built app. No `file://` execution — Vite serves it over HTTP, and the deployed build is served by GitHub Pages.

---

## 3. High-Level System Diagram

```
┌─────────────────────────────── Browser (per device) ───────────────────────────────┐
│                                                                                      │
│   Vue 3 SPA (Vite build, served from GitHub Pages)                                  │
│   ┌────────────┐   ┌──────────────┐   ┌───────────────────┐   ┌──────────────────┐  │
│   │ Vue Router │──▶│ View / SFC   │──▶│ Composables        │──▶│ Pinia store      │  │
│   │ (hash mode)│   │ components   │   │ useSales/useSync/  │   │ useAppStore()    │  │
│   └────────────┘   └──────────────┘   │ useToast            │  │ (single source   │  │
│                                        └───────────────────┘   │  of in-memory     │  │
│                                                                 │  truth)          │  │
│                                                                 └─────────┬────────┘  │
│                                                                           │           │
│                                                                           ▼           │
│                                                                 localStorage (kt_*)   │
│                                                                 — survives refresh,   │
│                                                                   scoped per origin    │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │  fetch() POST/GET (fire-and-forget + offline queue)
                                        ▼
                         ┌───────────────────────────────┐
                         │ Google Apps Script Web App     │
                         │ (doGet / doPost, deployed as    │
                         │  "Execute as: Me / Anyone")      │
                         └───────────────┬─────────────────┘
                                        │
                                        ▼
                         ┌───────────────────────────────┐
                         │ Google Sheet ("Khonsu Sales")   │
                         │ Sales Log · Inventory ·         │
                         │ Master List · Purchase Orders   │
                         └───────────────────────────────┘
```

Each staff device runs its own copy of the SPA and its own `localStorage`. The Google Sheet is the only thing that can reconcile multiple devices — see [§9](#9-offline-first-sync-architecture) for how that reconciliation actually works (and its limits).

---

## 4. Project / File Structure

```
index.html                 ← Vite entry HTML (mounts #app)
vite.config.js              ← base path, Vue + PWA plugins, "@" → /src alias
manifest.json / public/manifest.json  ← PWA manifest (duplicated — see §12)
css/styles.css              ← all app styling, imported once in main.js
icons/, public/icons/        ← PWA icons (192/512)
.github/workflows/deploy.yml ← CI: build on push to main, deploy dist/ to GitHub Pages

src/
  main.js                    ← createApp, Pinia, Router, imports css/styles.css
  App.vue                    ← shell: SvgSprite + (LockScreen | NavBar+RouterView) + SyncBanner/Overlay/Toast
  router/index.js            ← 9 routes, hash history, adminOnly guard
  stores/state.js             ← Pinia store: all app state + initApp() bootstrapping
  utils.js                    ← ik(), vl(), fmt(), date helpers (parseSheetDate, sameDay, fmtSheetDate), ic()
  data.js                      ← DEF (default product catalogue), COLORS map, ADDON_CATS

  composables/
    useSales.js                ← sales-flow business logic (IMEI-aware), PO generation, print report
    useSync.js                  ← Google Sheets sync: tryPush, enqueue, processQueue, pullFromSheets, restoreTodaySales
    useToast.js                  ← module-singleton toast notification state
    usePaymentLogs.js              ← non-cash payment log CRUD, auto-derivation from confirmed sales, credited/pending status, cross-device pull

  components/
    SvgSprite.vue                ← inline <symbol> definitions for all icons, mounted once
    LockScreen.vue                ← user picker (Sam/Joyce) + Admin PIN modal
    NavBar.vue                     ← sticky header + desktop tab row + mobile hamburger drawer
    SyncBanner.vue                  ← amber banner shown while the offline queue is non-empty
    SyncOverlay.vue                  ← full-screen fade overlay during sync operations
    Toast.vue                         ← renders the useToast() singleton
    ProductGrid.vue                    ← category filter + search + product/promotion grid (Sales picker screen)
    ProductCard.vue                     ← single product tile with stock badge
    SaleForm.vue                         ← transaction detail form (color/qty/IMEI, sold type, payment, add-on)
    AddonPicker.vue                       ← accessory picker + editable add-on price, embedded in SaleForm
    IMEIPicker.vue                         ← IMEI scan/select grid, embedded in SaleForm for phone/tablet SKUs
    CustomerForm.vue                        ← optional customer name/contact/email captured on first item
    ReviewSale.vue                           ← pending items list + SO number + confirm button
    TodayReport.vue                           ← today's sales table, summary, Submit/Close Day/Print
    Scanner.vue                                ← BarcodeDetector camera modal, used by IMEIPicker & RestockPage

  views/                                       ← routed pages
    SalesPage.vue                               ← orchestrates picker/detail/review/report sub-screens
    InventoryPage.vue                            ← read-only stock table with search/status filter
    PurchaseOrdersPage.vue                        ← PO list, inline edit modal, mark-sent, print
    MasterListPage.vue                             ← product catalogue CRUD, promotions, freebies
    SettingsPage.vue                                ← targets, reorder points, Admin PIN change
    SetupPage.vue                                    ← Google Sheets connection wizard + embedded Apps Script source
    RestockPage.vue                                   ← "Receive Stock" — DR entry, IMEI/qty intake, scanner
    ReportsPage.vue                                    ← Today/Week/Month transaction report (Sheets-backed)
    DashboardPage.vue                                   ← KPI cards, 7-day bar chart, payment donut, staff leaderboard
    PaymentLogsPage.vue                                  ← non-cash payment reconciliation log (ITEL auto + Bisen manual), Admin credits/deletes
```

**Legacy directories no longer present:** the original single-file `tecnix-ops_25.html` and the intermediate `js/*.js` ES-module version described in earlier docs have been fully replaced by `src/`. They exist only in git history (see [§13](#13-project-history--legacy-versions)) — do not treat old copies of `CLAUDE.md`/`TECHNICAL.md` in this repo as current; they describe the pre-Vue architecture.

---

## 5. State Management

All runtime state lives in one Pinia **setup store**, `useAppStore()` (`src/stores/state.js`). Views/components call `useAppStore()` directly (no props-drilling); Pinia refs are reactive across every consumer.

```js
{
  currentUser: null,             // 'Sam' | 'Joyce' | 'Admin' — persisted to localStorage kt_user
  masterList: [],                 // full product catalogue (includes obsolete)
  PRODUCTS,                        // computed: masterList.filter(p => !p.obsolete)
  inventory: {},                    // { [productKey]: { stock, reorder } }
  predefinedBundles: [],             // seasonal promo bundles
  productFreebies: {},                 // { [mainProductKey]: freebieProductKey }
  settings: { dailyTarget, lowStockThreshold, globalReorder },
  saleRows: [],                          // confirmed transactions for the current day
  pendingItems: [],                        // staged, not yet confirmed
  paymentLogs: [],                          // non-cash payment reconciliation log (ITEL auto + Bisen manual), never day-cleared
  currentSO: null,                           // active Sales Order string
  soCounter, bundleCounter,                    // numbering counters
  selectedProduct, selectedAddon,                // active detail-screen selections
  activeCat, searchQ, addonCat,                    // ProductGrid/AddonPicker UI filters
  purchaseOrders: [],                                // PO array
  scriptUrl: '',                                       // Google Apps Script Web App URL
  editingPOId,
  syncQueue: [],                                         // mirror of kt_queue for reactive SyncBanner
  units: [],                                               // IMEI unit records
  selectedIMEIs: [],                                         // units picked for the in-progress sale item
  receiveDraftItems: [], restockProduct,                       // Receive Stock page scratch state
}
```

### `initApp()` bootstrap sequence (called once from `App.vue` `onMounted`)
1. Load or seed `masterList` from `DEF` (default catalogue in `data.js`).
2. Load or seed `inventory` (defaults every product to `{ stock: 4, reorder: 1 }`).
3. Load `settings`, `predefinedBundles`, `productFreebies`, `purchaseOrders`, `scriptUrl`, `syncQueue`.
4. Restore **today's** confirmed `saleRows` from `kt_today` if the stored date matches today (survives page refresh mid-day).
5. Load IMEI `units`, then **auto-generate dummy IMEIs** (`DUMMY-{key}-{NNN}`) for any existing stock that has no registered real units — this back-fills inventory that predates IMEI tracking.

### `localStorage` keys

| Key | Content |
|---|---|
| `kt_user` | Current logged-in user string |
| `kt_ml` | Master list array (JSON) |
| `kt_inv` | Inventory object (JSON) |
| `kt_bundles` | Promotions/bundles array (JSON) |
| `kt_freebies` | Freebies map (JSON) |
| `kt_settings` | Settings object (JSON) |
| `kt_so` | SO counter (int) |
| `kt_pc` | Bundle/promo code counter (int) |
| `kt_pos` | Purchase orders array (JSON) |
| `kt_url` | Google Apps Script Web App URL |
| `kt_today` | `{ date, rows }` — today's confirmed sales (refresh-safe) |
| `kt_units` | IMEI unit records array (JSON) |
| `kt_queue` | Offline sync queue (JSON) — see [§9](#9-offline-first-sync-architecture) |
| `kt_paylogs` | Payment logs array (JSON) — non-cash reconciliation, see [§6](#6-core-data-structures) |

---

## 6. Core Data Structures

### Product (`masterList` / `PRODUCTS`)
```js
{
  category: 'Smart Phone',   // Bar Phone | Smart Phone | Tablet | Earbuds | Smart Watch | Power Bank | Others
  name: 'A50C',
  ram: '2GB',                // '' for non-phone/tablet categories
  storage: '64GB',           // '' for non-phone/tablet categories
  unitPrice: 2789,           // cost / purchase price (₱)
  srp: 2999,                 // suggested retail price (₱)
  colors: 'Black, White',    // comma-separated string
  obsolete: false,
}
```

### Inventory entry
```js
inventory['A50C 2GB/64GB'] = { stock: 4, reorder: 1 }   // key = ik(product)
```
For IMEI-tracked categories, `stock` is *derived*: it always equals `count(units where productKey=key && status='available')`, recalculated on every receive/sale.

### IMEI unit record (`units`)
```js
{
  imei, productKey, productName, color,
  status: 'available' | 'sold',
  drNumber, receivedDate,
  soNumber: null, soldDate: null,
  isDummy: false,   // true for auto-generated placeholder units
}
```
`IMEI_CATS = {'Smart Phone', 'Bar Phone', 'Tablet'}` — only these categories are unit-tracked; accessories remain quantity-based.

### Pending item (staged, in `pendingItems`)
```js
{
  id, isPromo, bundleCode, bundleName,
  product,               // full product object
  colors, color,          // colors[] and joined string (non-IMEI) — one entry per unit
  qty, imeis,              // imeis[] populated instead of colors for IMEI products
  soldType,                 // 'Walk-in' | 'Pasa'
  promoter, pasa, payment,
  srp, sp,                    // sp = sold price actually charged (srp | srp+pasa | bundlePrice)
  unitPrice, net,
  addon,                        // { product, soldPrice } | null
  freebie,                       // { name, key } | null
  promoAddon,                     // { key, name } | null — accessory bundled into a promo, at cost
  customer,                        // { name, contact, email } | null — captured only on the first item of an SO
}
```

### Sale row (confirmed, in `saleRows`)
```js
{
  id, so, bundle, itemName, variant, color, qty, imeis,
  unitPrice, srp, soldPrice, pasaPrice, discount, netSales,
  payment, soldType, promoter, staff, productKey,
  isAddon, isPromotion, isPromoAddon,
  customer,
}
```

### Purchase Order
```js
{
  id: 'PO-123456',           // last 6 digits of Date.now()
  date, supplier, approver,
  items: [{ name, qty, color }],
  status: 'pending' | 'sent',
}
```

### Payment log (`paymentLogs`)
Non-cash payment reconciliation — tracks whether money collected via a non-cash channel has actually landed in the bank/merchant account. Two ways an entry is created:
- **Auto** (`origin: 'auto'`): every `confirmSale()` groups the confirmed sale's non-Cash rows (`Card`, `Home Credit`) by payment method and creates one entry per method, `store: 'ITEL'`, `reference` = the SO number.
- **Manual** (`origin: 'manual'`): staff log Bisen's (ITEL's sister store) Maya terminal transactions by hand via `/payment-logs`, since Bisen sales are outside this app — `store: 'Bisen'`, `method` is `'Maya - Card'` or `'Maya - QRPh'`.

```js
{
  id: 'PL-1735900000000-42',
  date,                       // ISO timestamp, when the entry was logged
  store: 'ITEL' | 'Bisen',
  method,                      // 'Card' | 'Home Credit' (ITEL, auto) | 'Maya - Card' | 'Maya - QRPh' (Bisen, manual)
  amount,
  reference,                    // SO number (auto) or terminal txn ID (manual, optional)
  notes,                          // manual only, optional
  staff,                            // who logged it (store.currentUser at creation time)
  origin: 'auto' | 'manual',
  status: 'pending' | 'credited',
  creditedDate, creditedBy,           // set when Admin marks the entry credited
}
```

Never cleared by day-close (unlike `saleRows`) — it accumulates until Admin reconciles it. Any logged-in user (Sam/Joyce/Admin) can view the log, add Bisen entries, and edit/delete manually-created entries (`origin: 'manual'`) to correct mistakes — auto-logged ITEL entries (`origin: 'auto'`) are read-only since they mirror a real confirmed sale. Only Admin can mark an entry credited/pending or force a full resync (see `usePaymentLogs.js` and `PaymentLogsPage.vue`).

`store: 'ITEL'` entries double as **Accounts Receivable** (money owed to ITEL by the card/Home Credit processor until credited) and `store: 'Bisen'` entries double as **Accounts Payable** (money ITEL is holding on Bisen's behalf via the Maya terminal until it's paid out) — the Admin view surfaces both as pending-outstanding totals, derived from the same `status` field rather than separate AR/AP state.

### Promotion / bundle
```js
{ id, name, price, mainKey, mainName, addonKey, addonName }
```

### Freebie map entry
```js
productFreebies['A50C 2GB/64GB'] = 'EARBUDS NEO'   // main product key → freebie product key
```

---

## 7. Utility Functions (`src/utils.js`)

| Function | Purpose |
|---|---|
| `ik(p)` | Inventory/product key: `name [+ ' '+ram] [+ '/'+storage]` |
| `vl(p)` | Variant label: `'ram / storage'` or `''` |
| `fmt(n)` | Peso format: `'₱1,234.00'`, or `'N/A'` for 0/null |
| `parseSheetDate(raw)` | Normalizes a Sheets date value (locale string, ISO string, or `Date`) to a local `Date` |
| `sameDay(raw, ref?)` | True if `raw` falls on the same calendar day as `ref` (default: now) |
| `fmtSheetDate(raw)` | Localized (`en-PH`) date string for display |
| `ic(name, size)` | Returns an inline `<svg><use href="#ic-{name}"/></svg>` snippet referencing `SvgSprite.vue`'s symbols |

---

## 8. Functional Walkthrough by Page

### 8.1 Log Sale (`/sales`, `SalesPage.vue`) — all users
Four sub-screens toggled by a local `screen` ref (`picker` → `detail` → `review` → `report`), not by routing:
- **Picker** (`ProductGrid.vue`): category tabs (mobile: bottom-sheet filter) + search; taps a product card or a Promotions tile.
- **Detail** (`SaleForm.vue`): variant/color entry (or IMEI scan/select for phone/tablet/bar-phone via `IMEIPicker.vue`), quantity, Walk-in vs Pasa (+ promoter name, + pasa markup), payment method (Cash/Card/Home Credit), optional accessory add-on (`AddonPicker.vue`, price editable), optional customer info (`CustomerForm.vue`, captured once per SO). Actions: **+ Add Another Item** (stages and returns to picker) or **Review Sale →**.
- **Review** (`ReviewSale.vue`): lists all staged items with subtotals/grand total; can edit or remove any line; **✓ Customer Approved — Confirm** calls `confirmSale()`.
- **Report** (`TodayReport.vue`): today's confirmed rows, summary stats, **Submit/Close Day** and **Print** (opens a formatted printable HTML report in a new window).
- A floating action button on the picker screen surfaces "Review (N items)" or "View Report (N)" depending on state; an "Active SO" banner with a Clear button appears once an SO number has been issued.

### 8.2 Receive Stock (`/restock`, `RestockPage.vue`) — all users
Delivery-receipt intake: DR number/date/supplier header, then per-line product selection (typed/datalist match against `PRODUCTS`) with color, and either:
- **IMEI mode** (phone/tablet categories): type or camera-scan (`Scanner.vue`, `BarcodeDetector` API) each unit's IMEI, staged one at a time, duplicate-IMEI guarded against both existing `units` and the current draft.
- **Qty mode** (accessories): a plain quantity add.

**Confirm Receipt** creates new `available` unit records (IMEI items), recomputes derived stock for those product keys from `units`, increments raw stock for qty-based items, persists to `localStorage`, and pushes `saveUnits` + `updateInventoryItems` to Sheets.

### 8.3 Inventory (`/inventory`, `InventoryPage.vue`) — Admin only
Read-only stock table (search + status filter: All/OK/Low Stock/Out of Stock) with SKU counts and OK/LOW/OUT badges derived from `inventory[key].stock` vs `.reorder`.

### 8.4 Purchase Orders (`/po`, `PurchaseOrdersPage.vue`) — Admin only
List of POs (search + Pending/Sent filter); **Edit** (pending only) opens a modal to add/remove/adjust line items (product name autocompletes against active products); **Mark as Sent** freezes the PO; **Print** opens a formatted, print-ready PO document.

### 8.5 Master List (`/masterlist`, `MasterListPage.vue`) — Admin only
- Inline-editable product table (colors, unit price, SRP) with search/status filter and an **Obsolete/Available** toggle per row; **Save Changes** persists locally and pushes `saveProducts` + `saveInventory`.
- **+ New Product** modal — adds a catalogue entry (category, name, RAM/storage, pricing, colors).
- **Promotions** section — create/delete phone+accessory bundle deals at a fixed price (`savePromotions`).
- **Freebies** section — map a main product to a complimentary accessory given away on sale (`saveFreebies`).

### 8.6 Settings (`/settings`, `SettingsPage.vue`) — Admin only
Daily sales target, low-stock alert threshold, global default reorder point (with **Apply to All**), a per-product reorder-point override table, and an **Admin PIN change** form (calls the `setPin` Apps Script action; requires Sheets connection).

### 8.7 Setup (`/setup`, `SetupPage.vue`) — Admin only
4-step wizard: (1) instructions to create a Google Sheet, (2) the full embedded Apps Script source with a **Copy Script** button (`navigator.clipboard`), (3) **Connect** (posts `{action:'init'}` to verify + store the Web App URL), (4) **Push All Data** — one-shot full overwrite of Master List + Inventory sheets from local state.

### 8.8 Reports (`/reports`, `ReportsPage.vue`) — Admin only
Today/Week/Month period selector; pulls `?action=getSales` from Sheets and filters client-side by date (`sameDay`/`parseSheetDate`); falls back to local `saleRows` for "Today" only if Sheets is unavailable, with a warning banner for the other periods.

### 8.9 Dashboard (`/dashboard`, `DashboardPage.vue`) — Admin only
KPI cards (today/week/month net sales), daily-target progress bar, a 7-day CSS bar chart, an inline-SVG payment-method donut (Cash/Card/Home Credit), and a staff-performance leaderboard — all derived from the same `getSales` payload used by Reports.

### 8.10 Payment Logs (`/payment-logs`, `PaymentLogsPage.vue`) — all users, Admin has extra controls
Non-cash payment reconciliation. ITEL's `Card`/`Home Credit` sales are logged automatically (grouped per SO, per method) whenever `confirmSale()` runs. Any user can also log Bisen's (sister store) Maya terminal transactions (`Maya - Card` / `Maya - QRPh`) by hand, since Bisen sales don't flow through this app. Any user can **edit** (store/method/amount/reference/notes) or **delete** manually-created entries to correct mistakes — auto-logged ITEL entries are read-only, since they mirror a real confirmed sale. Search + store/status filter mirror the Purchase Orders page. Every entry starts `pending`; **Admin only** can mark it `credited` (or revert it) once the funds are confirmed in the bank/merchant account, and gets a prominent **Accounts Receivable (ITEL)** / **Accounts Payable (Bisen)** summary — pending-amount totals per store, i.e. what's still owed to ITEL vs. still owed to Bisen — plus a **Push All to Sheets** full-resync button. Pulls `?action=getPaymentLogs` on mount (when the offline queue is empty) to merge in entries logged from other staff devices, so Admin sees the full cross-device picture.

---

## 9. Offline-First Sync Architecture

Google Sheets is intended as the cross-device **source of truth**; every device otherwise only knows its own `localStorage`.

### `useSync.js` primitives
| Function | Behavior |
|---|---|
| `tryPush(action, payload)` | POSTs immediately if `scriptUrl` is set; on any failure (or if not configured) falls back to `enqueue()`. Used by every state-mutating feature. |
| `enqueue(action, payload)` | Appends `{id, action, payload, addedAt, attempts}` to `kt_queue` and updates `store.syncQueue` (drives `SyncBanner.vue`). |
| `processQueue()` | Drains the queue sequentially against the Web App; failed items are re-queued with an incremented `attempts` counter; shows the full-screen `SyncOverlay` while running. Triggered manually or automatically on the browser `online` event. |
| `pullFromSheets()` | `GET ?action=getAllData` — hydrates `masterList`, `inventory`, `predefinedBundles`, `productFreebies`, `settings`, `purchaseOrders` from Sheets and overwrites the matching `localStorage` keys. Runs on login/app-mount, **only if the offline queue is empty** (to avoid clobbering un-synced local edits), after an 800 ms delay. |
| `restoreTodaySales()` | `GET ?action=getSales`, filtered to today, used to rehydrate `saleRows` on login (in addition to the local `kt_today` fallback in `initApp()`). |

### Actions the frontend actually sends
`init`, `logSale`, `updateInventoryItems`, `updateUnitStatus`, `savePO`, `updatePOStatus`, `saveProducts`, `saveInventory`, `savePromotions`, `saveFreebies`, `saveUnits`, `saveSettings`, `verifyPin`, `setPin`, `logPayment`, `updatePaymentStatus`, `pushPaymentLogs`, `editPaymentLog`, `deletePaymentLog`, plus GETs `getAllData`, `getSales`, `getPaymentLogs`, `getMasterList` (legacy), `ping`.

`logPayment`, `updatePaymentStatus`, `pushPaymentLogs`, `editPaymentLog`, `deletePaymentLog` (and the `getPaymentLogs` GET) are the exception to the gap below — they **are** implemented in the reference Apps Script in `SetupPage.vue`, against a `Payment Logs` sheet created by `initSheets()`, so payment-log reconciliation works cross-device out of the box for anyone following the Setup wizard. `pushPaymentLogs` is a full-overwrite recovery action (mirrors `pushMasterList`/`pushInventory`) for force-resyncing local `paymentLogs` if entries were ever created while the deployed script was stale.

### ⚠️ Known integration gap
The **Apps Script source embedded in `SetupPage.vue`** (what a store owner actually copies into `script.google.com`) only implements: `doPost` → `init, logSale, logPO, pushInventory, pushMasterList, logPayment, updatePaymentStatus, pushPaymentLogs, editPaymentLog, deletePaymentLog`; `doGet` → `ping, getMasterList, getSales, getPaymentLogs`. It does **not** implement `getAllData`, `verifyPin`, `setPin`, `updateInventoryItems`, `savePO`, `updatePOStatus`, `saveProducts`, `saveInventory`, `savePromotions`, `saveFreebies`, `saveUnits`, or `updateUnitStatus` — all of which the Vue app calls. In practice, for anyone following the in-app Setup wizard today:
- Real-time stock decrement, PO sync, promotions/freebies sync, IMEI unit sync, and PIN management **silently fail and pile up in the offline queue forever** (they never succeed against the deployed script).
- `pullFromSheets()`'s `getAllData` call will always error, so cross-device hydration on login does not work with the currently-documented script.
- Admin login PIN verification falls back to a hard-coded local SHA-256 hash (default PIN **1234**) whenever `verifyPin` fails, which — given the above — is *always*, once a script URL is connected without patching the script.

This is a real, current discrepancy between the client and the reference server script, not a hypothetical risk — the Apps Script needs to be extended (or the reference source in `SetupPage.vue` needs updating) to cover the newer action set documented in the "Key functions" list above before the sync/IMEI/PIN features can work end-to-end against a fresh Setup.

### What is NOT synced
- `saleRows` for the *current, still-open* day are pushed per-transaction (`logSale` on every `confirmSale()`), so completed sales do reach the queue immediately — there is no separate end-of-day-only submit step in the current sales flow (unlike the legacy vanilla version's `submitDayReport()`).
- Dummy IMEIs (`isDummy: true`) are a local backfill convenience and are never pushed to Sheets as real inventory.

---

## 10. Business Logic Reference

### Pricing
| Sold Type | Customer Pays | Net Sales Formula |
|---|---|---|
| Walk-in | SRP | `(SRP − unitPrice) × qty` |
| Pasa (promoter/referral) | SRP + pasaPrice | `(SRP + pasa − unitPrice) × qty` |
| Promotion/Bundle | Fixed bundle price | `(bundlePrice − unitPrice) × qty` |

- Add-on net: `addonSoldPrice − addonUnitPrice`
- Promo-included accessory ("promoAddon"): `−(unitPrice × qty)` — cost with no revenue (given away as part of the bundle)
- Freebie items decrement stock but generate no sale row / no revenue or cost line at all

### Numbering formats
| Type | Format | Example |
|---|---|---|
| Sales Order | `SO-YYMMDD-XXXX` | `SO-260705-0001` |
| Bundle code | `BDL-YYMMDD-XXX` | `BDL-260705-001` |
| Promo code | `PRO-YYMMDD-XXX` | `PRO-260705-001` |
| Purchase Order | `PO-{6 digits of Date.now()}` | `PO-123456` |

SO and bundle/promo counters persist in `localStorage` (`kt_so`, `kt_pc`) and only ever increment — they are **not** shared across devices, so two devices connected to the same Sheet can independently generate colliding SO numbers if both are used simultaneously without a synced counter.

### Stock management
- New products default to `{ stock: 4, reorder: 1 }`.
- `confirmSale()` decrements stock for every line: main product, add-on, promo-included accessory, and freebie. For IMEI products it instead marks each selected unit `sold` and recomputes `stock` as the remaining `available` count.
- **Closing the day** (`closeDayReport()` in `useSales.js`) scans all active products; any at or below their `reorder` point are folded into a (new-or-existing pending) purchase order, then clears `saleRows`/`pendingItems`/`currentSO` for the next day.

### Users & permissions
| User | Routes visible | Notes |
|---|---|---|
| Sam / Joyce | Log Sale, Receive Stock | Standard staff, no PIN |
| Admin | All routes | Requires PIN (Sheets `verifyPin`, else local SHA-256 fallback; default `1234`) |

There is no real authentication — `router.beforeEach` only checks `store.currentUser === 'Admin'` for `meta.adminOnly` routes, and the "PIN" is a soft convenience gate, not a security boundary (the app and its `localStorage` are fully accessible client-side regardless).

---

## 11. Deployment

### Build & CI
- `npm run dev` — Vite dev server (`localhost:5173`).
- `npm run build` — outputs to `dist/` (code-split per view; PWA service worker + Workbox precache generated by `vite-plugin-pwa`).
- `.github/workflows/deploy.yml` — on every push to `main`, runs `npm ci && npm run build` and deploys `dist/` to **GitHub Pages** via `actions/deploy-pages`. `vite.config.js` sets `base: '/khonsu-tech-ops/'` to match the Pages sub-path.

### Connecting Google Sheets (end-user flow, via the Setup tab)
1. Create a new Google Sheet.
2. Extensions → Apps Script → paste the script shown in Setup (or an updated one — see [§9's gap](#-known-integration-gap)) → Deploy → New Deployment → Web App (Execute as **Me**, access **Anyone**).
3. Paste the deployment URL into Setup → Connect (persists to `kt_url` / `store.scriptUrl`).
4. **Push All Data** to seed the sheet from whatever is currently in `localStorage`.
5. Redeploying script changes requires **Deploy → Manage Deployments → Edit → New Version** — the Web App URL itself stays stable.

### PWA
- `vite-plugin-pwa` in `autoUpdate` mode; manifest is hand-authored (both `manifest.json` at repo root and a duplicate in `public/manifest.json` — see [§12](#12-known-constraints--technical-debt)) rather than plugin-generated.
- Installable on mobile home screens; icons at 192/512px.

---

## 12. Known Constraints & Technical Debt

- **Apps Script / frontend action mismatch** — see [§9](#-known-integration-gap). This is the highest-priority integration risk: several admin features (PO sync, promotions/freebies sync, IMEI sync, PIN management, full data pull) are silently non-functional against the script currently shown to users in the Setup tab.
- **Duplicate PWA manifest** — `manifest.json` (repo root) and `public/manifest.json` are byte-identical; only the `public/` copy is actually served by Vite. The root copy appears to be leftover from before the Vue migration and should be removed or documented as intentionally duplicated.
- **No cross-device SO/PO numbering coordination** — counters are per-device/localStorage; concurrent devices can produce duplicate SO/PO numbers.
- **No day-end submit gate** — sales push to Sheets immediately per-transaction; there's no explicit "has today been reconciled" state, so a device left connected indefinitely will keep accumulating `saleRows` until `closeDayReport()` is manually invoked.
- **PIN is not real security** — see [§10](#users--permissions). Default PIN `1234` is a hard-coded fallback and is reachable any time the Sheets `verifyPin` call fails (currently: always, per the script gap above).
- **`localStorage` is origin-scoped** — moving the deployed URL (e.g. changing the GitHub Pages path) orphans all local data for staff devices already in use; only pricing/stock/sales already pushed to Sheets would be recoverable.
- **CORS in local dev** — Apps Script only sends permissive CORS headers from the deployed Web App URL, not from `localhost`; errors during `npm run dev` against a live script are expected and are swallowed into the offline queue by design.

---

## 13. Project History & Legacy Versions

The codebase went through two prior architectures, preserved in git rather than in the working tree:

1. **`tecnix-ops_25.html`** — original single-file, zero-dependency version (HTML+CSS+JS in one file, global-scope functions, inline `onclick=""` handlers). This is the version described by the repository's original `CLAUDE.md`.
2. **Vanilla ES-module version** (`index.html` + `css/` + `js/*.js`, 17 feature modules, `CustomEvent`-based navigation to avoid circular imports) — an intermediate refactor, described by the repository's original `TECHNICAL.md`. Preserved at branch **`backup/vanilla-js`** and tag **`v1.0-vanilla-js`**.
3. **Current: Vue 3 + Vite + Pinia + Vue Router** (this document) — ported the vanilla modules feature-by-feature (Sales flow → Admin pages → Reports/Dashboard → Scanner/Restock/PWA), then deleted the `js/` folder and `sw.js` once parity was confirmed.

If reviving or diffing against a pre-Vue behavior, check out `v1.0-vanilla-js` rather than assuming any `js/*.js` files still exist in `main`.

---

## 14. CSS Conventions (`css/styles.css`)

Custom properties on `:root`: `--bg`, `--surface`, `--surface2`, `--border`, `--accent` (`#1b2e6b`), `--accent2`, `--accent-light`, `--green`, `--red`, `--yellow`, `--text`, `--muted`, `--white`, `--moon` (`#c8d0e8`).

Abbreviated class names carried over from the original single-file era are still in use and intentional: `.pc` (product card), `.sc` (stat card), `.sw`/`.si` (search wrapper/icon), `.sb`/`.sok`/`.slow`/`.sout` (stock badge + status colors), `.g2`/`.g3` (2/3-col grids), `.pgrid` (product grid), `.btn-primary`/`.btn-success`/`.btn-danger`/`.btn-outline`/`.btn-sm`/`.btn-lg` (button variants).
