# Khonsu Tech OPS — Technical Architecture Document

**Store:** Khonsu Electronic Gadgets Trading (ITEL Mobile)
**Location:** Space No. K424.6, Festival Mall, FCC, Alabang, Muntinlupa City, Philippines
**Currency:** Philippine Peso (₱)
**Document status:** Reflects the codebase as of **2026-07-07** (Vue 3 SPA on `main`). Superseded architectures (single-file HTML, vanilla ES-module version) are preserved as git history/tags — see [§14](#14-project-history--legacy-versions).

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
| Barcode scanning | Native `BarcodeDetector` where available, **`@zxing/browser` + `@zxing/library`** fallback elsewhere | Safari/iOS never implemented the Shape Detection API — `Scanner.vue` lazy-`import()`s ZXing only on browsers without `BarcodeDetector`, so Chrome/Android never downloads it |
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
                         ┌─────────────────────────────────────┐
                         │ Google Sheet ("Khonsu Sales")         │
                         │ Sales Log · Inventory · Purchase       │
                         │ Orders · Payment Logs · Promotions ·    │
                         │ Freebies · Settings · Units · Issue Log │
                         │ · Master List (lazily created)          │
                         └───────────────────────────────────────┘
```

Each staff device runs its own copy of the SPA and its own `localStorage`. The Google Sheet is the only thing that can reconcile multiple devices — see [§9](#9-offline-first-sync-architecture) for the sync mechanics and [§10](#10-database-schema-google-sheets) for the actual tab-by-tab schema (and how well each tab is kept in sync in practice).

---

## 4. Project / File Structure

```
index.html                 ← Vite entry HTML (mounts #app)
vite.config.js              ← base path, Vue + PWA plugins, "@" → /src alias
manifest.json / public/manifest.json  ← PWA manifest (duplicated — see §13)
css/styles.css              ← all app styling, imported once in main.js
icons/, public/icons/        ← PWA icons (192/512)
.github/workflows/deploy.yml ← CI: build on push to main, deploy dist/ to GitHub Pages

src/
  main.js                    ← createApp, Pinia, Router, imports css/styles.css
  App.vue                    ← shell: SvgSprite + (LockScreen | NavBar+RouterView) + SyncBanner/Overlay/Toast
  router/index.js            ← 10 routes + a /setup→/settings?tab=sync redirect, hash history, adminOnly guard
  stores/state.js             ← Pinia store: all app state + initApp() bootstrapping
  utils.js                    ← ik(), vl(), fmt(), date helpers (parseSheetDate, sameDay, fmtSheetDate), ic()
  data.js                      ← DEF (default product catalogue), COLORS map, ADDON_CATS

  composables/
    useSales.js                ← sales-flow business logic (IMEI-aware), PO generation, print report
    useSync.js                  ← Google Sheets sync: tryPush, enqueue, processQueue, pullFromSheets, restoreTodaySales
    useToast.js                  ← module-singleton toast notification state
    usePaymentLogs.js              ← non-cash payment log CRUD, auto-derivation from confirmed sales, credited/pending status, cross-device pull
    useErrorLog.js                   ← sync-failure/runtime-error logging, dedup-by-queueId, resolve/reopen, cross-device pull (deliberately does not import useSync.js — see §9)

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
    IMEIPicker.vue                         ← IMEI scan/select grid, embedded in SaleForm for phone/tablet SKUs; grid only renders once the staff types/scans an IMEI (or a unit is already selected) — not a standing list of every serial
    CustomerForm.vue                        ← optional customer name/contact/email captured on first item
    ReviewSale.vue                           ← pending items list + SO number + confirm button
    TodayReport.vue                           ← today's sales table, summary, Submit/Close Day/Print
    Scanner.vue                                ← camera scan modal (native BarcodeDetector, ZXing fallback on Safari/iOS), used by IMEIPicker & RestockPage

  views/                                       ← routed pages
    SalesPage.vue                               ← orchestrates picker/detail/review/report sub-screens
    InventoryPage.vue                            ← read-only stock table with search/status filter
    PurchaseOrdersPage.vue                        ← PO list, inline edit modal, mark-sent, print
    MasterListPage.vue                             ← product catalogue CRUD, promotions, freebies
    SettingsPage.vue                                ← targets, reorder points, Pasa cap toggle, Admin PIN change (General tab) + embeds SetupPage.vue (Sync tab)
    SetupPage.vue                                    ← Google Sheets connection wizard + embedded Apps Script source; no longer a standalone nav item, rendered inside Settings' "Sync" tab
    RestockPage.vue                                   ← "Receive Stock" — DR entry, IMEI/qty intake, scanner
    ReportsPage.vue                                    ← Today/Week/Month transaction report (Sheets-backed)
    DashboardPage.vue                                   ← KPI cards, 7-day bar chart, payment donut, staff leaderboard
    PaymentLogsPage.vue                                  ← non-cash payment reconciliation log (ITEL auto + Bisen manual), Admin credits/deletes
    IssuesPage.vue                                        ← sync-failure/runtime-error log, Admin resolves/reopens + force-resync
```

**Legacy directories no longer present:** the original single-file `tecnix-ops_25.html` and the intermediate `js/*.js` ES-module version described in earlier docs have been fully replaced by `src/`. They exist only in git history (see [§14](#14-project-history--legacy-versions)) — do not treat old copies of `CLAUDE.md`/`TECHNICAL.md` in this repo as current; they describe the pre-Vue architecture.

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
  settings: { dailyTarget, lowStockThreshold, globalReorder, pasaCapEnabled },  // pasaCapEnabled default true — see §11
  saleRows: [],                          // confirmed transactions for the current day
  pendingItems: [],                        // staged, not yet confirmed
  paymentLogs: [],                          // non-cash payment reconciliation log (ITEL auto + Bisen manual), never day-cleared
  errorLogs: [],                             // sync-failure + runtime-error log, never day-cleared
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
| `kt_errlogs` | Sync-failure/runtime-error log array (JSON) — see [§6](#6-core-data-structures) |

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
  status: 'pending' | 'credited' | 'settled',   // 'settled' is Bisen-only — see below
  creditedDate, creditedBy,           // set when Admin marks the entry credited
  settledDate, settledBy,               // set when Admin settles a credited Bisen entry (usePaymentLogs.js settlePayment())
}
```

Never cleared by day-close (unlike `saleRows`) — it accumulates until Admin reconciles it. Any logged-in user (Sam/Joyce/Admin) can view the log, add Bisen entries, and edit/delete manually-created entries (`origin: 'manual'`) to correct mistakes — auto-logged ITEL entries (`origin: 'auto'`) are read-only since they mirror a real confirmed sale. Only Admin can mark an entry credited/pending, settle/revert a Bisen entry, or force a full resync (see `usePaymentLogs.js` and `PaymentLogsPage.vue`).

`store: 'ITEL'` entries use a 2-state lifecycle (`pending → credited`) — `credited` means the card/Home Credit processor's payout has landed, fully resolving that entry as **Accounts Receivable**.

`store: 'Bisen'` entries use a 3-state lifecycle (`pending → credited → settled`) since two separate facts need tracking: whether the Maya terminal funds actually landed in ITEL's account (`credited`, via `markCredited()`), and whether ITEL has since paid that amount out to Bisen (`settled`, via `settlePayment()` — only callable once a Bisen entry is already `credited`; enforced in `usePaymentLogs.js`, not just the UI). **Accounts Payable** — money ITEL is holding on Bisen's behalf — is therefore derived as: `apOutstanding` = sum of Bisen entries with status `pending` or `credited` (still owed), `apSettled` = sum of Bisen entries with status `settled` (already paid out). `revertToCredited()` undoes a settle if it was recorded by mistake. The Accounts Payable card on `/payment-logs` is visible to all staff (not just Admin) so Sam/Joyce can also see what's still owed to Bisen vs. already paid; Accounts Receivable stays Admin-only.

### Issue log (`errorLogs`)
Sync-failure and runtime-error tracking, created two ways:
- **`type: 'sync'`** — logged by `useSync.js`'s `tryPush()`/`processQueue()` whenever a real-time push or a queued retry fails against a *connected* Sheets URL (not logged just for being offline/unconfigured — that's normal, expected behavior already surfaced by `SyncBanner.vue`). Upserted by `queueId`: a retried failure of the same queue item updates the existing entry's `attempts`/`lastSeen` instead of creating a duplicate.
- **`type: 'runtime'`** — logged by global `window.onerror` / `unhandledrejection` handlers registered in `useErrorLog.js`, catching uncaught app errors app-wide.

```js
{
  id: 'ERR-1735900000000-42',
  date,                        // ISO timestamp, first occurrence
  lastSeen,                      // ISO timestamp, most recent occurrence (bumped on repeat sync failures)
  type: 'sync' | 'runtime',
  action,                          // sync action name (e.g. 'saveProducts'), '' for runtime errors
  queueId,                           // matching kt_queue item id, for upsert-on-retry; null for runtime errors
  message,                             // error message / server {error} string
  context,                               // JSON snippet of the failed payload, or "file:line" for runtime errors
  attempts,                                // sync retries seen so far
  status: 'open' | 'resolved',
  resolvedDate, resolvedBy,                  // set when Admin marks it resolved
}
```

`useErrorLog.js` deliberately does **not** import `tryPush`/`enqueue` from `useSync.js` — `useSync.js` imports *from* `useErrorLog.js` to log failures, so the reverse import would be circular. Instead, issue-log pushes are one-shot/best-effort (`fetch` directly, swallow failures) — the local copy is always saved regardless, and Admin's **Push All to Sheets** button on `/issues` is the manual recovery valve if a push never lands, mirroring `pushAllPaymentLogs()`.

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
- **Detail** (`SaleForm.vue`): variant/color entry (or IMEI scan/select for phone/tablet/bar-phone via `IMEIPicker.vue` — camera scan via `Scanner.vue`, same modal RestockPage uses, or type an IMEI; the unit grid stays empty until something is typed/scanned, so a sale never starts by browsing every serial in stock), quantity, Walk-in vs Pasa (+ promoter name, + pasa markup), payment method (Cash/Card/Home Credit), optional accessory add-on (`AddonPicker.vue`, price editable), optional customer info (`CustomerForm.vue`, captured once per SO). Actions: **+ Add Another Item** (stages and returns to picker) or **Review Sale →**.
- **Review** (`ReviewSale.vue`): lists all staged items with subtotals/grand total; can edit or remove any line; **✓ Customer Approved — Confirm** calls `confirmSale()`.
- **Report** (`TodayReport.vue`): today's confirmed rows, summary stats, **Submit/Close Day** and **Print** (opens a formatted printable HTML report in a new window).
- A floating action button on the picker screen surfaces "Review (N items)" or "View Report (N)" depending on state; an "Active SO" banner with a Clear button appears once an SO number has been issued.

### 8.2 Receive Stock (`/restock`, `RestockPage.vue`) — all users
Delivery-receipt intake: DR number/date/supplier header, then per-line product selection (typed/datalist match against `PRODUCTS`) with color, and either:
- **IMEI mode** (phone/tablet categories): type or camera-scan (`Scanner.vue`) each unit's IMEI, staged one at a time, duplicate-IMEI guarded against both existing `units` and the current draft.
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
Tabbed: **General** and **Google Sheets Sync**. `activeTab` defaults from `route.query.tab` (`?tab=sync` opens the sync tab directly; `/setup` redirects here with that query for old bookmarks/links — see [§4](#4-project--file-structure)).
- **General** — daily sales target, low-stock alert threshold, global default reorder point (with **Apply to All**), a per-product reorder-point override table, the **Pasa Amount Cap** toggle (`settings.pasaCapEnabled` — see [§11](#11-business-logic-reference)), and an **Admin PIN change** form (calls the `setPin` Apps Script action; requires Sheets connection).
- **Sync** — renders `SetupPage.vue` as a child component (unchanged internally, just no longer a standalone routed page/nav item): 4-step wizard — (1) instructions to create a Google Sheet, (2) the full embedded Apps Script source with a **Copy Script** button (`navigator.clipboard`), (3) **Connect** (posts `{action:'init'}` to verify + store the Web App URL), (4) **Push All Data** — one-shot full overwrite of Master List + Inventory sheets from local state.

Setup was merged into Settings (as a tab, not a separate nav item) since both are the same "Admin configures how the app behaves" concern — this also shrank the nav from 11 items to 10. The desktop tab bar and mobile drawer (`NavBar.vue`) group remaining items into four sections in click-order: **Daily Operations** (Log Sale, Receive Stock, Payment Logs — all users), **Insights** (Dashboard, Reports), **Catalog & Stock** (Inventory, Master List, Purchase Orders), **System** (Settings, Sync Issues) — the latter three Admin-only. A thin `.nav-divider` (desktop) / `.drawer-section-label` (mobile) renders wherever consecutive items' `section` differs.

### 8.7 Reports (`/reports`, `ReportsPage.vue`) — Admin only
Today/Week/Month period selector; pulls `?action=getSales` from Sheets and filters client-side by date (`sameDay`/`parseSheetDate`); falls back to local `saleRows` for "Today" only if Sheets is unavailable, with a warning banner for the other periods.

### 8.8 Dashboard (`/dashboard`, `DashboardPage.vue`) — Admin only
KPI cards (today/week/month net sales), daily-target progress bar, a 7-day CSS bar chart, an inline-SVG payment-method donut (Cash/Card/Home Credit), and a staff-performance leaderboard — all derived from the same `getSales` payload used by Reports.

### 8.9 Payment Logs (`/payment-logs`, `PaymentLogsPage.vue`) — all users, Admin has extra controls
Non-cash payment reconciliation. ITEL's `Card`/`Home Credit` sales are logged automatically (grouped per SO, per method) whenever `confirmSale()` runs. Any user can also log Bisen's (sister store) Maya terminal transactions (`Maya - Card` / `Maya - QRPh`) by hand, since Bisen sales don't flow through this app. Any user can **edit** (store/method/amount/reference/notes) or **delete** manually-created entries to correct mistakes — auto-logged ITEL entries are read-only, since they mirror a real confirmed sale. Search + store/status filter mirror the Purchase Orders page. Every entry starts `pending`; **Admin only** can mark it `credited` (or revert it), and for Bisen entries can further **settle** a credited entry (or revert that too) — see [§6](#6-core-data-structures)'s Payment log lifecycle. The page gets a prominent **Accounts Receivable (ITEL)** (Admin-only) / **Accounts Payable (Bisen)** (all users) summary, plus a **Push All to Sheets** full-resync button. Pulls `?action=getPaymentLogs` on mount (when the offline queue is empty) to merge in entries logged from other staff devices, so Admin sees the full cross-device picture.

Rendered as a **table, not cards** (`Date`, `Store/Method`, `Amount`, `Reference`, `Staff`, `Status`, actions), since this log only grows and never day-clears — a card list would get unbounded. Client-side paginated: a "Rows per page" selector (`10` default, `25`/`50`/`100`) plus Prev/Next, both scoped to `filteredLogs` (post search/filter) so paging always matches what's currently shown; any change to search, store/status filter, or page size snaps back to page 1 to avoid landing on an empty page.

The **Status** column is Admin's control surface: a plain `<select>` bound to the row's status (options are `Pending`/`Credited` for ITEL, `Pending`/`Credited`/`Settled` for Bisen) — picking a value calls the same guarded `usePaymentLogs.js` functions the old per-transition buttons called (`onStatusChange()` in `PaymentLogsPage.vue`), so an invalid jump (e.g. Pending straight to Settled) is still rejected by `settlePayment()`'s own check and the `<select>` snaps back to the real status on next render (it's bound via `:value`, not `v-model`, specifically so a rejected change doesn't stick optimistically). Non-admin users see the same information as a read-only colored badge instead. Row actions are reduced to three icon-only buttons: **Edit**/**Delete** (manually-created entries only, any user) and **Revert** (Admin-only, hidden once a row is already `pending`) — a one-click shortcut that steps back exactly one stage (`settled → credited` or `credited → pending`) without opening the dropdown.

The filter button (search bar) intentionally does **not** change color when a filter is active, matching `ProductGrid.vue`'s picker-screen filter button — the "Showing: X · ✕ Clear" chip beneath the search bar is the only active-filter indicator. (This one button pattern is copy-pasted across five list pages — Payment Logs, Inventory, Purchase Orders, Master List, Sync Issues — so all five stay visually consistent with each other and with the Sales picker.)

### 8.10 Sync Issues (`/issues`, `IssuesPage.vue`) — Admin only
Every sync failure and uncaught runtime error surfaces here instead of only the browser console — see the `errorLogs` structure in [§6](#6-core-data-structures). Summary cards break down open issues by type (sync vs. runtime) alongside a resolved count. Search + type/status filter mirror the other log pages. Admin marks an issue **Resolved** once the underlying data has been checked/fixed in Sheets, or **Reopens** it; a nav badge shows the live open-issue count. **Push All to Sheets** force-overwrites the Issue Log sheet from local state, for the same reason Payment Logs has one — issue-log pushes are one-shot/best-effort (see [§6](#6-core-data-structures)'s note on avoiding a circular import with `useSync.js`), so a push can occasionally not land and needs a manual nudge.

---

## 9. Offline-First Sync Architecture

Google Sheets is intended as the cross-device **source of truth**; every device otherwise only knows its own `localStorage`.

### `useSync.js` primitives
| Function | Behavior |
|---|---|
| `tryPush(action, payload)` | POSTs immediately if `scriptUrl` is set; on any failure (network error, or a `{error}` JSON response) falls back to `enqueue()` **and** logs a `sync` issue via `useErrorLog.js`. If `scriptUrl` isn't set at all, it just enqueues silently — that's normal offline-first operation, not a logged issue. Used by every state-mutating feature; this is the "real-time, right after save" half of the sync story. |
| `enqueue(action, payload)` | Appends `{id, action, payload, addedAt, attempts}` to `kt_queue`, updates `store.syncQueue` (drives `SyncBanner.vue`), and returns the created item so callers can key an issue-log entry to it. |
| `processQueue()` | Drains the queue sequentially against the Web App; failed items are re-queued with an incremented `attempts` counter and logged/updated as a `sync` issue; shows the full-screen `SyncOverlay` while running. Triggered manually ("Sync Now") or automatically on the browser `online` event. This is the "manual re-sync" half — what a user runs after an issue is flagged. |
| `pullFromSheets()` | `GET ?action=getAllData` — hydrates `masterList`, `inventory`, `predefinedBundles`, `productFreebies`, `settings`, `purchaseOrders` from Sheets and overwrites the matching `localStorage` keys. Runs on login/app-mount, **only if the offline queue is empty** (to avoid clobbering un-synced local edits), after an 800 ms delay. |
| `restoreTodaySales()` | `GET ?action=getSales`, filtered to today, used to rehydrate `saleRows` on login (in addition to the local `kt_today` fallback in `initApp()`). |

### Actions the frontend sends — all implemented server-side as of this revision
`init`, `logSale`, `voidSaleRow`, `updateInventoryItems`, `saveInventory`, `saveProducts` (alias of `pushMasterList`), `updateUnitStatus`, `saveUnits`, `savePO`, `updatePOStatus`, `savePromotions`, `saveFreebies`, `saveSettings`, `verifyPin`, `setPin`, `logPayment`, `updatePaymentStatus`, `pushPaymentLogs`, `editPaymentLog`, `deletePaymentLog`, `logIssue`, `updateIssueStatus`, `pushIssueLogs`, plus GETs `getAllData`, `getSales`, `getPaymentLogs`, `getIssueLogs`, `getMasterList` (legacy), `ping`. Legacy/manual-only actions `logPO`, `pushInventory`, `pushMasterList` remain for the Setup page's "Push All Data" full-resync button.

### ✅ Previously a known integration gap — now closed
Earlier revisions of this document flagged a real, significant gap: the reference Apps Script only implemented a handful of actions (`init`, `logSale`, `logPO`, `pushInventory`, `pushMasterList`, plus the Payment Logs set), while the Vue app called many more that had no server-side handler at all — so PO sync, promotions/freebies sync, IMEI sync, inventory decrement outside of `logSale`, PIN management, and full cross-device data pull all silently failed and piled up in the offline queue forever. That gap is now closed: every action the frontend sends has a matching handler in `SCRIPT_SOURCE` (`SetupPage.vue`), and five new tabs (`Promotions`, `Freebies`, `Settings`, `Units`, `Issue Log`) were added to `initSheets()` to back them. See [§10](#10-database-schema-google-sheets) for the tab-by-tab detail.

Two concrete correctness bugs were fixed alongside this:
- `deleteFreebie()` (`MasterListPage.vue`) used to push `{ freebies: [] }` on every delete — an empty array — which would have wiped every freebie mapping in Sheets, not just the one being removed. It now pushes the full remaining list, same as `saveFreebie()`.
- `removeRow()` (`useSales.js`, used by `TodayReport.vue` to undo a mistakenly-added line before end of day) restored local inventory but never synced the restored stock, and never removed the corresponding row from the Sales Log sheet — so a voided sale stayed in Sheets forever, permanently diverging from local state. It now pushes `updateInventoryItems` for the restored stock and `voidSaleRow` (matched by a new `SaleID` column) to delete the row.

**Caveat that still applies to already-deployed scripts:** none of this reaches a store owner's *live* Apps Script automatically. Updating the reference text in `SetupPage.vue` only changes what the Setup wizard shows to someone copying it *now*. Anyone with an already-deployed script must re-copy it and go **Deploy → Manage Deployments → Edit → New Version** (same URL, updated code) before these actions actually start working — see [§12](#12-deployment).

### What is NOT synced
- `saleRows` for the *current, still-open* day are pushed per-transaction (`logSale` on every `confirmSale()`), so completed sales do reach the queue immediately — there is no separate end-of-day-only submit step in the current sales flow (unlike the legacy vanilla version's `submitDayReport()`).
- Dummy IMEIs (`isDummy: true`) are a local backfill convenience and are never pushed to Sheets as real inventory — `initApp()`'s dummy-unit bootstrap never calls `tryPush`. The `Units` tab's `IsDummy` column (added this revision) exists so that *if* a dummy unit is ever pushed (e.g. a future admin cleanup/audit tool), it's distinguishable on the sheet — every unit `saveUnits` currently sends (from `RestockPage.vue`, real received stock only) writes `IsDummy = 'false'`.
- `restoreTodaySales()`'s failure path is intentionally silent (no issue logged) — it's a best-effort login-time rehydration retried implicitly on every login, and logging every transient blip there would be noisy relative to its non-critical nature.

### Sync-issue and runtime-error logging (`useErrorLog.js`, `/issues`)
Every `tryPush`/`processQueue` failure against a *connected* script, and every uncaught runtime error/rejection app-wide, is recorded as an entry in `errorLogs` (see [§6](#6-core-data-structures)) and surfaced to Admin on `/issues` for investigation and resolution tracking — closing the loop on "all transactions sync in real time, and anything that doesn't gets flagged instead of silently disappearing."

---

## 10. Database Schema (Google Sheets)

The Google Sheet **is** the database — there is no separate DBMS. Each tab is a table; each row is a record; there is no engine-enforced schema, typing, uniqueness, or referential integrity, so everything below reflects what the Apps Script (`SetupPage.vue`'s `SCRIPT_SOURCE`) and the frontend actually read/write, not a designed-then-enforced schema. Columns are addressed **positionally** (`getRange(row, colIndex)`), so column order is load-bearing — reordering a header breaks every function that writes or reads that tab.

### 10.1 Tab overview

All eleven tabs below are created up front by `initSheets()` (i.e. the moment Setup's **Connect** succeeds, or `init` is run manually in the Apps Script editor) except `Master List`, which is only lazily created the first time `pushMasterList`/`saveProducts` runs.

**`initSheets()` is also the schema-migration path for existing tabs, not just first-time creation.** On every call, row 1 of every tab is unconditionally (re)written to exactly match the current header list in code — existing tabs get their header row replaced outright, brand-new tabs get it appended; no data row (row 2+) is ever touched. This is what makes it safe to re-run `init`/Connect after a script update that changes a tab's columns, and it went through two iterations to get right:
- **First version:** appended only newly-added *trailing* header columns, guarded by `if (sh.getLastRow() === 0)` to skip brand-new-vs-existing tabs. That guard only ever handled a *completely empty* sheet — re-running `init` on a tab that already had data silently did nothing, even after redeploying a version with new columns (e.g. `Sale ID`/`IMEI` being added to `Sales Log`).
- **Second version:** replaced the guard with a comparison of `sh.getLastColumn()` against the expected header count, backfilling only the missing trailing labels. This still had a real bug: `getLastColumn()` reflects the widest *data* row, not row 1's own width. A tab created under an older, narrower schema but since written with wider, newer-schema data (the live `Inventory` tab was originally the pre-Vue app's 4-column `ProductKey, Stock, ReorderPoint, LastUpdated`, but every row in it has long since been written by the current 9-column `pushInventory`) already reports `getLastColumn()` at or past the new header count — so the stale header labels were never corrected, and the extra columns to their right stayed permanently blank.
- **Current version:** row 1 is simply overwritten to the exact expected header array on every `init` call, full stop — sidestepping both bugs by never trying to infer "how much of the header is already right" in the first place. Headers are pure labels (the only thing that ever reads them dynamically is the legacy, unused `getMasterList()`), so unconditionally rewriting them is safe.

Verified by executing the real extracted script against a simulated "old 4-column header + rows already written with 9-column data" `Inventory` tab (reproducing the user's actual live sheet): the header row was fully corrected to the current 9-column schema, both data rows were byte-for-byte unchanged, and a second `init` call was idempotent.

| Tab | Primary key | Written by | Overwrite style |
|---|---|---|---|
| `Sales Log` | `Sale ID` (col Q) | `logSale`, `voidSaleRow` | Append-only, `voidSaleRow` deletes by `Sale ID`; cols S–X (`Bundle Code, Is Addon, Is Promotion, Customer Name, Customer Contact, Customer Email`) added this revision |
| `Inventory` | none (key recomputed as `Model + " " + RAM + "/" + Storage`) | `pushInventory` (full overwrite), `updateInventoryItems`/`saveInventory` (incremental, matched by recomputed key) | Mixed |
| `Purchase Orders` | `PO Number` | `savePO` (upsert), `updatePOStatus`, legacy `logPO` | Upsert |
| `PO Items` | none (`POID` foreign key, one row per line item) | `savePOItems` (called from `savePO`/`logPO`) — **new this revision** | Delete-all-for-POID then re-append, on every `savePO` call |
| `Payment Logs` | `ID` (client-generated `PL-…`) | `logPayment`, `editPaymentLog`, `updatePaymentStatus`, `deletePaymentLog` | Upsert / full overwrite via `pushPaymentLogs` |
| `Promotions` | none (client-generated `BundleID` stored, not matched against) | `savePromotions` | Full overwrite |
| `Freebies` | none | `saveFreebies` | Full overwrite |
| `Settings` | `Key` (simple key/value table) | `saveSettings`, `setPin` (stores `AdminPinHash`) | Upsert per key |
| `Units` | `IMEI` | `saveUnits` (append), `updateUnitStatus` (matched by IMEI) | Mixed; col J `IsDummy` added this revision |
| `Issue Log` | `ID` (client-generated `ERR-…`) | `logIssue` (upsert), `updateIssueStatus` | Upsert / full overwrite via `pushIssueLogs` |
| `Master List` | `Key` (`ik(product)`, the one tab that stores the composite key as an actual column) | `pushMasterList`/`saveProducts` | Full overwrite |

No tab has engine-enforced referential integrity. Every cross-tab relationship is either a **string re-derived from other columns at the moment a script function runs** (e.g. `Model + ' ' + RAM + '/' + Storage`, mirroring the client-side `ik()` helper, used by `Inventory`/`getAllData`) or a plain copied value (the PO number/bundle code sitting in Sales Log column B, a Sales Log SO string copied into a Payment Log's `Reference`, or a `MainProductKey`/`AddonProductKey` sitting in `Promotions`/`Freebies` uninterpreted until `getAllData` or the client resolves it against `Master List`).

### 10.2 `Sales Log` (created by `initSheets`)

| # | Column | Type | Written by | Notes |
|---|---|---|---|---|
| A | Date | Date/ISO string | `logSale` | `d.date` — an ISO timestamp string sent by the client, not a Sheets-native date |
| B | Bundle | string | `logSale` | Actually `r.so \|\| r.bundle` — holds the **Sales Order number** for ordinary sales, or the **bundle/promo code** for promo lines. Column name is misleading; this is the closest thing to an order/grouping key, and it repeats across every line item of the same SO |
| C | Item | string | `logSale` | Product name (`itemName`) |
| D | Variant | string | `logSale` | RAM/Storage label, e.g. `2GB / 64GB` |
| E | Color | string | `logSale` | Comma-joined if multiple units |
| F | Qty | number | `logSale` | |
| G | Unit Price | number (₱) | `logSale` | Cost |
| H | SRP | number (₱) | `logSale` | |
| I | Sold Price | number (₱) | `logSale` | Price actually charged per unit |
| J | Pasa Price | number (₱) | `logSale` | Promoter markup, 0 for Walk-in |
| K | Discount | number (₱) | `logSale` | Always 0 in the current client (`discount` is not exposed as an editable field anywhere in the sales UI) |
| L | Net Sales | number (₱) | `logSale` | Precomputed client-side, not recalculated server-side |
| M | Payment | string | `logSale` | `Cash` \| `Card` \| `Home Credit` |
| N | Sold Type | string | `logSale` | `Walk-in` \| `Pasa` |
| O | Promoter | string | `logSale` | Empty for Walk-in |
| P | Staff | string | `logSale` | `currentUser` at time of sale |
| Q | Sale ID | string | `logSale` | The client's own `saleRow.id` (`now + i*10`, unique per line item), written verbatim. This is the tab's first real, stable primary key — used by `voidSaleRow` to delete a specific row when a line item is removed via `TodayReport.vue` before end of day. |
| R | IMEI | string (comma-joined) | `logSale` | `item.imeis` for IMEI-tracked products (Smart Phone/Bar Phone/Tablet), empty for accessories. |
| S | Bundle Code | string | `logSale` | **New this revision.** `item.bundleCode`, distinct from column B (which holds the SO number, not the bundle/promo code, for ordinary sales). Column B's `r.so \|\| r.bundle` fallback logic is unchanged — this column is the one place the bundle code is *always* recoverable regardless of whether an SO was also present. |
| T | Is Addon | `'true'`/`'false'` string | `logSale` | **New this revision.** True for the accessory line of a main-item+addon sale (`saleRow.isAddon`). |
| U | Is Promotion | `'true'`/`'false'` string | `logSale` | **New this revision.** True for a bundle/promo main-item line (`saleRow.isPromotion`). Note: a third row type, promo-addon lines (`isPromoAddon`), has no dedicated column and reads back as `false` here — same lossy behavior the pre-existing `Sales` (obsolete) tab had. |
| V | Customer Name | string | `logSale` | **New this revision.** From `saleRow.customer.name`, blank when no customer was captured (only the first item of a multi-item SO carries a customer). |
| W | Customer Contact | string | `logSale` | **New this revision.** From `saleRow.customer.contact`. |
| X | Customer Email | string | `logSale` | **New this revision.** From `saleRow.customer.email`. |

Rows are still appended in insertion order; "the sale" as a unit still only exists as the set of rows sharing the same column-B value — column Q identifies a *line item*, not the SO as a whole.

**Read-path data loss — fixed.** `getSales()` previously projected only 10 of 16 columns (`Date, SO, ItemName, Variant, Color, Qty, SoldPrice, NetSales, Payment, Staff`), silently dropping `UnitPrice, SRP, PasaPrice, Discount, SoldType, Promoter` on the way back out — so `restoreTodaySales()` (`useSync.js`) rehydrated any Pasa sale after a cache-cleared refresh as a zero-cost Walk-in. That was fixed by returning all 18 columns (`SaleID`/`IMEI` included). This revision closes the *remaining* gap: `sheetRowToSaleRow()` in `useSync.js` had always expected `BundleCode`, `IsAddon`, `IsPromotion`, `CustomerName`, `CustomerContact`, `CustomerEmail` too (this was discovered by comparing against the columns of the old, pre-Vue-migration `Sales` tab, which — unlike `Sales Log` — had captured all of these fields all along) — `getSales()` now returns all 24 columns and every field `sheetRowToSaleRow()` consumes has a real writer behind it.

### 10.3 `Inventory` (created by `initSheets`)

| # | Column | Type | Written by |
|---|---|---|---|
| A | Category | string | `pushInventory` (full overwrite only) |
| B | Model | string | `pushInventory` |
| C | RAM | string | `pushInventory` |
| D | Storage | string | `pushInventory` |
| E | Colors | string (comma-joined) | `pushInventory` |
| F | Unit Price | number (₱) | `pushInventory` |
| G | SRP | number (₱) | `pushInventory` |
| H | Stock | number | `pushInventory` (full overwrite); `logSale`, `updateInventoryItems`/`saveInventory` (incremental, key-matched) |
| I | Reorder Point | number | `pushInventory`; `updateInventoryItems`/`saveInventory` (incremental) |

**Primary key:** none stored — `B+" "+C+"/"+D` (when non-empty) is recomputed at read time to match `ik(product)`, shared by `logSale`'s inline decrement, `updateInventoryRows()` (the shared helper behind both `updateInventoryItems` and `saveInventory`), and `getAllData`. Real-time stock now stays live across every source of change (sales, restocks, sale-row voids, Master List saves) as long as the product's key already has a row — if a brand-new product has never been through a "Push All Data", there's no existing row to key-match against and the incremental update silently no-ops for that product until the next full push, same as `logSale`'s existing behavior.

### 10.4 `Purchase Orders` + `PO Items` (both created by `initSheets`)

**`Purchase Orders`** — one row per PO, `Items`/`Quantities` are a human-glance summary only, no longer the source of truth for programmatic reads (see `PO Items` below):

| # | Column | Type | Written by |
|---|---|---|---|
| A | PO Number | string | `savePO` — `PO-{6 digits}`; primary key |
| B | Date | string | `savePO` |
| C | Supplier | string | `savePO` |
| D | Items | **JSON string** of `[{name, qty, color}]` — legacy, see below | `savePO` |
| E | Quantities | string (comma-joined qtys, human-glance only — not parsed by anything) | `savePO` |
| F | Status | string | `savePO`, `updatePOStatus` — `pending` \| `sent` |
| G | Approver | string | `savePO` |

`savePO` is a real **upsert**: linear scan for a matching PO Number, update in place if found, append if not — this is what `useSales.js generatePO()` (auto-PO on low stock) and `PurchaseOrdersPage.vue` (manual edit) actually call. The legacy `logPO()` append-only handler is kept only for backward compatibility with anyone's very old copied script; nothing in the current frontend calls it.

**`PO Items`** — normalized, one row per line item, added this revision to replace the fragile single-JSON-cell design (a malformed or truncated blob in column D above would silently drop every item on that PO):

| # | Column | Type | Written by |
|---|---|---|---|
| A | POID | string | `savePOItems` — the same `PO Number` as the parent row, foreign key not enforced by the sheet |
| B | ItemName | string | `savePOItems` |
| C | Qty | number | `savePOItems` |
| D | Color | string | `savePOItems` |

`savePOItems(poId, items)` is called from both `savePO` and `logPO`. It is **not** an append-only log: on every call it first deletes every existing `PO Items` row for that `POID`, then re-appends the current item list — so editing a PO's items never leaves stale rows behind, and re-saving with the same items is a no-op in effect. `getAllData`'s `purchaseOrders` projection now reads `items` from `PO Items` first; only if a `POID` has **no** rows there at all does it fall back to parsing the legacy JSON blob in `Purchase Orders` column D — this covers POs created before this revision shipped, without needing a one-time data migration. `Purchase Orders` columns D/E are still written on every save (for anyone glancing at the raw sheet) but are otherwise vestigial for POs that have a `PO Items` presence.

### 10.5 `Payment Logs` (created by `initSheets`) — fully functional

| # | Column | Type | Written by |
|---|---|---|---|
| A | ID | string | `logPayment` — client-generated `PL-{timestamp}-{rand}`, the only real primary key in the whole spreadsheet |
| B | Date | ISO string | `logPayment` |
| C | Store | string | `logPayment` / `editPaymentLog` — `ITEL` \| `Bisen` |
| D | Method | string | `logPayment` / `editPaymentLog` — `Card` \| `Home Credit` (ITEL) or `Maya - Card` \| `Maya - QRPh` (Bisen) |
| E | Amount | number (₱) | `logPayment` / `editPaymentLog` |
| F | Reference | string | `logPayment` / `editPaymentLog` — SO number (auto entries) or free-text terminal txn ID (manual) |
| G | Staff | string | `logPayment` (not editable after creation) |
| H | Origin | string | `logPayment` (not editable) — `auto` \| `manual` |
| I | Notes | string | `logPayment` / `editPaymentLog` |
| J | Status | string | `logPayment` / `updatePaymentStatus` — `pending` \| `credited` \| `settled` (ITEL entries only ever use `pending`/`credited`; `settled` is Bisen-only) |
| K | Credited Date | ISO string or `''` | `updatePaymentStatus` |
| L | Credited By | string or `''` | `updatePaymentStatus` |
| M | Settled Date | ISO string or `''` | `updatePaymentStatus` — **new this revision** |
| N | Settled By | string or `''` | `updatePaymentStatus` — **new this revision** |

Lookup for update/delete (`updatePaymentStatus`, `editPaymentLog`, `deletePaymentLog`) is a linear scan matching column A against `d.id`. Every client-side action for this tab (`logPayment`, `updatePaymentStatus`, `editPaymentLog`, `deletePaymentLog`, `pushPaymentLogs`, `getPaymentLogs`) has a matching, implemented server-side handler — see [§9](#9-offline-first-sync-architecture). `updatePaymentStatus` always writes all four of columns J–N together (`usePaymentLogs.js`'s `pushStatus()` helper sends the log's full current status/credited/settled state on every transition), so a status change never leaves stale settle info from an earlier state.

### 10.6 `Promotions`, `Freebies`, `Settings`, `Units`, `Issue Log` (all created by `initSheets`)

These five tabs used to not exist at all — `getAllData` had no server-side handler and nothing backed a normalized `products`/`promotions`/`freebies`/`settings` schema the client was already written to expect (see `pullFromSheets()` in `useSync.js`). All are now real:

| Tab | Columns | Written by | Notes |
|---|---|---|---|
| `Promotions` | `BundleID, Name, Price, MainProductKey, MainProductName, AddonProductKey, AddonProductName` | `savePromotions` (full overwrite) | Mirrors `store.predefinedBundles` verbatim |
| `Freebies` | `MainProductKey, FreebieProductKey, MainProductName, FreebieProductName` | `saveFreebies` (full overwrite) | Mirrors `store.productFreebies` (denormalized to an array first client-side) |
| `Settings` | `Key, Value` | `saveSettings` (`DailyTarget`/`LowStockThreshold`/`GlobalReorder`/`PasaCapEnabled`, one row each), `setPin` (`AdminPinHash`) | Generic key/value table rather than one fixed-column row, so it can hold both app settings and the Admin PIN hash without a schema change |
| `Units` | `IMEI, ProductKey, ProductName, Color, Status, DRNumber, ReceivedDate, SONumber, SoldDate, IsDummy` | `saveUnits` (append new units from Receive Stock), `updateUnitStatus` (matched by IMEI, marks `sold` + SO/date on `confirmSale()`) | `IsDummy` column added this revision (writes `'false'` for every unit currently pushed — see below); dummy units themselves are still never sent here — see [§9](#what-is-not-synced) |
| `Issue Log` | see [§6](#6-core-data-structures) | `logIssue` (upsert by ID), `updateIssueStatus` | Backs `/issues` |

`getAllData` reads `Master List`/`Inventory`/`Promotions`/`Freebies`/`Settings`/`Purchase Orders` and returns them in the exact shape `pullFromSheets()` already expected (it was written against this aspirational schema before the schema existed) — `verifyPin`/`setPin` hash the incoming PIN with the same SHA-256 scheme as the client's local fallback (`Utilities.computeDigest` server-side vs. `crypto.subtle.digest` client-side) and compare/store against `Settings!AdminPinHash`, defaulting to the same hard-coded hash for `1234` when no custom PIN has ever been set, so behavior is identical to the pre-existing local-only fallback until an Admin actually changes it.

### 10.7 `Master List` (lazily created — not part of `initSheets`)

Only created the first time `pushMasterList`/`saveProducts` succeeds (Setup's "Push All Data", or the ordinary Master List "Save Changes" button — both send the identical row shape, so `saveProducts` is a plain alias for `pushMasterList` server-side).

| # | Column | Type |
|---|---|---|
| A | Key | string — `ik(product)`, the only tab that stores the composite key as an actual column |
| B | Category | string |
| C | Model | string |
| D | RAM | string |
| E | Storage | string |
| F | Colors | string (comma-joined) |
| G | Unit Price | number (₱) |
| H | SRP | number (₱) |
| I | Status | string — `Active` \| `Obsolete` |

Full delete-and-reinsert overwrite on every save — from either "Push All Data" (Setup) or "Save Changes" (Master List page), now that `saveProducts` is wired up. `getMasterList()` (legacy `doGet` action, no longer called by any current view) reads this tab, falling back to `Inventory` if `Master List` doesn't exist yet.

---

## 11. Business Logic Reference

### Pricing
| Sold Type | Customer Pays | Net Sales Formula |
|---|---|---|
| Walk-in | SRP | `(SRP − unitPrice) × qty` |
| Pasa (promoter/referral) | SRP + pasaPrice | `(SRP − unitPrice) × qty` — pasaPrice excluded, see below |
| Promotion/Bundle | Fixed bundle price | `(bundlePrice − unitPrice) × qty` |

- Add-on net: `addonSoldPrice − addonUnitPrice`
- Promo-included accessory ("promoAddon"): `−(unitPrice × qty)` — cost with no revenue (given away as part of the bundle)
- Freebie items decrement stock but generate no sale row / no revenue or cost line at all
- **Pasa markup is excluded from net sales.** The customer pays `SRP + pasaPrice` (`soldPrice`, tracked in the Sales Log's `Sold Price` column) and that full amount is what's collected at the till, but the `pasaPrice` portion is the promoter's commission passing through — it was never ITEL's revenue. `useSales.js buildPendingItem()` computes `net` from a `netBase` (SRP for Walk-in/Pasa, `bundlePrice` for promotions) that always excludes the Pasa markup; `confirmSale()` copies that precomputed `item.net` onto the sale row's `netSales` rather than re-deriving it from `soldPrice`, so the two never drift apart. `pasaPrice` remains its own tracked column/field for promoter commission reporting — it's recorded, just not counted as ITEL's earnings.

**Pasa amount cap** (`settings.pasaCapEnabled`, default `true`, toggle in Settings → General): when on, the per-unit Pasa markup a staff member can enter is capped at that item's own net sales amount, `max(0, SRP − unitPrice)` — so a promoter's commission can never exceed what ITEL earns selling the item at plain SRP. Enforced twice: in `SaleForm.vue` (clamps on blur, shows the max and a "capped" notice) and again in `useSales.js buildPendingItem()` (defense in depth — reclamps regardless of what the form passed, e.g. an item added before the cap was toggled on and then re-edited). Because the cap is per-unit and both the cap and the pasa markup scale linearly with `qty`, capping per-unit is equivalent to capping the line's total Pasa payout. Turning the setting off removes the cap entirely (any Pasa amount is accepted, matching pre-cap behavior).

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

## 12. Deployment

### Build & CI
- `npm run dev` — Vite dev server (`localhost:5173`).
- `npm run build` — outputs to `dist/` (code-split per view; PWA service worker + Workbox precache generated by `vite-plugin-pwa`).
- `.github/workflows/deploy.yml` — on every push to `main`, runs `npm ci && npm run build` and deploys `dist/` to **GitHub Pages** via `actions/deploy-pages`. `vite.config.js` sets `base: '/khonsu-tech-ops/'` to match the Pages sub-path.

### Connecting Google Sheets (end-user flow, via the Setup tab)
1. Create a new Google Sheet.
2. Extensions → Apps Script → paste the script shown in Setup → Deploy → New Deployment → Web App (Execute as **Me**, access **Anyone**).
3. Paste the deployment URL into Setup → Connect (persists to `kt_url` / `store.scriptUrl`; also runs `init`, creating all ten tabs — see [§10](#10-database-schema-google-sheets)).
4. **Push All Data** to seed the sheet from whatever is currently in `localStorage` (master list, inventory, promotions, freebies, settings).
5. **Redeploying script changes always requires Deploy → Manage Deployments → Edit → New Version** — the Web App URL stays stable, but plain-saving the editor does *not* update the live endpoint. This matters whenever the reference script in Setup changes (as it did in this revision): anyone with an already-deployed script must re-copy and re-deploy a new version before newly-added actions actually work — see [§9](#9-offline-first-sync-architecture).

### PWA
- `vite-plugin-pwa` in `autoUpdate` mode; manifest is hand-authored (both `manifest.json` at repo root and a duplicate in `public/manifest.json` — see [§13](#13-known-constraints--technical-debt)) rather than plugin-generated.
- Installable on mobile home screens; icons at 192/512px.

---

## 13. Known Constraints & Technical Debt

- **ZXing fallback is slower than native `BarcodeDetector`** — Safari/iOS decodes via repeated canvas-frame sampling in JS rather than a native/hardware-accelerated detector, so it can take noticeably longer to lock onto a barcode (worse in low light or at an angle) than the Chrome/Android path. No UI currently distinguishes which path is active; if this becomes a support issue, a visible "camera decode mode" indicator would be the next step.
- **Stale already-deployed scripts** — the Apps Script/frontend action mismatch that used to be this section's top item is now closed in the *reference* script (see [§9](#9-offline-first-sync-architecture)), but that fix only reaches a store owner's *live* script if they re-copy and redeploy a new version. Anyone running an older deployed script still has the old gap until they do. There's no version-check or staleness warning in the app — a mismatched deployment just silently fails the same way the gap always did, now logged to `/issues` at least, so it's discoverable instead of invisible.
- **Duplicate PWA manifest** — `manifest.json` (repo root) and `public/manifest.json` are byte-identical; only the `public/` copy is actually served by Vite. The root copy appears to be leftover from before the Vue migration and should be removed or documented as intentionally duplicated.
- **No cross-device SO/PO numbering coordination** — counters are per-device/localStorage; concurrent devices can produce duplicate SO/PO numbers.
- **No day-end submit gate** — sales push to Sheets immediately per-transaction; there's no explicit "has today been reconciled" state, so a device left connected indefinitely will keep accumulating `saleRows` until `closeDayReport()` is manually invoked.
- **PIN is now checked server-side, but is still not real security** — see [§11](#users--permissions). `verifyPin`/`setPin` now hash and compare against a stored `Settings!AdminPinHash` (defaulting to the hash of `1234` until changed), so a correctly-deployed script enforces a real custom PIN — but the app and its `localStorage` remain fully accessible client-side regardless, and the local SHA-256 fallback (same default hash) still applies whenever Sheets is unreachable or not connected.
- **`localStorage` is origin-scoped** — moving the deployed URL (e.g. changing the GitHub Pages path) orphans all local data for staff devices already in use; only pricing/stock/sales already pushed to Sheets would be recoverable.
- **CORS in local dev** — Apps Script only sends permissive CORS headers from the deployed Web App URL, not from `localhost`; errors during `npm run dev` against a live script are expected and are swallowed into the offline queue (and logged to `/issues`) by design.
- **Issue-log pushes are best-effort, not queued** — unlike every other sync action, `logIssue`/`updateIssueStatus` pushes (`useErrorLog.js`) don't retry via the offline queue (to avoid a circular import with `useSync.js` — see [§6](#6-core-data-structures)). If Sheets is briefly unreachable exactly when an issue is logged, that specific push can be lost; the local copy never is, and Admin's **Push All to Sheets** on `/issues` is the manual recovery path.

---

## 14. Project History & Legacy Versions

The codebase went through two prior architectures, preserved in git rather than in the working tree:

1. **`tecnix-ops_25.html`** — original single-file, zero-dependency version (HTML+CSS+JS in one file, global-scope functions, inline `onclick=""` handlers). This is the version described by the repository's original `CLAUDE.md`.
2. **Vanilla ES-module version** (`index.html` + `css/` + `js/*.js`, 17 feature modules, `CustomEvent`-based navigation to avoid circular imports) — an intermediate refactor, described by the repository's original `TECHNICAL.md`. Preserved at branch **`backup/vanilla-js`** and tag **`v1.0-vanilla-js`**.
3. **Current: Vue 3 + Vite + Pinia + Vue Router** (this document) — ported the vanilla modules feature-by-feature (Sales flow → Admin pages → Reports/Dashboard → Scanner/Restock/PWA), then deleted the `js/` folder and `sw.js` once parity was confirmed.

If reviving or diffing against a pre-Vue behavior, check out `v1.0-vanilla-js` rather than assuming any `js/*.js` files still exist in `main`.

---

## 15. CSS Conventions (`css/styles.css`)

Custom properties on `:root`: `--bg`, `--surface`, `--surface2`, `--border`, `--accent` (`#1b2e6b`), `--accent2`, `--accent-light`, `--green`, `--red`, `--yellow`, `--text`, `--muted`, `--white`, `--moon` (`#c8d0e8`).

Abbreviated class names carried over from the original single-file era are still in use and intentional: `.pc` (product card), `.sc` (stat card), `.sw`/`.si` (search wrapper/icon), `.sb`/`.sok`/`.slow`/`.sout` (stock badge + status colors), `.g2`/`.g3` (2/3-col grids), `.pgrid` (product grid), `.btn-primary`/`.btn-success`/`.btn-danger`/`.btn-outline`/`.btn-sm`/`.btn-lg` (button variants).
