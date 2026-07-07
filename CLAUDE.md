# Khonsu Tech OPS — CLAUDE.md

## What This Project Is

A point-of-sale and back-office system for **Khonsu Electronic Gadgets Trading (ITEL Mobile)**, located at Space No. K424.6, Festival Mall, Alabang, Muntinlupa City, Philippines.

It's a **Vue 3 + Vite SPA** with `localStorage` as the primary datastore and an optional Google Apps Script Web App as a cross-device sync target (mirrored to a Google Sheet). Deployed to GitHub Pages via GitHub Actions on every push to `main`.

For full architectural detail — data flow diagrams, every composable, the complete Google Sheets schema tab-by-tab, sync semantics, and known technical debt — see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. This file is a condensed working guide; ARCHITECTURE.md is the source of truth and is kept current.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Vue 3 (`<script setup>` SFCs, Composition API) |
| Build tool | Vite 5 (pinned — Node 20.12 environment constraint) |
| State | Pinia 2, single setup-store `useAppStore()` |
| Routing | Vue Router 4, hash mode (`#/sales`) |
| PWA | vite-plugin-pwa 0.20, `autoUpdate` |
| Styling | Plain CSS (`css/styles.css`), CSS custom properties, no framework |
| Persistence | Browser `localStorage`, source of truth when offline |
| Optional backend | Google Apps Script Web App bound to a Google Sheet |
| Hosting | GitHub Pages via GitHub Actions (`base: '/khonsu-tech-ops/'`) |

**Run locally:** `npm run dev` (Node 20 + npm required). `npm run build` outputs to `dist/`.

---

## Project Structure

```
index.html                  ← Vite entry HTML (mounts #app)
vite.config.js               ← base path, Vue + PWA plugins, "@" → /src alias
css/styles.css               ← all app styling
.github/workflows/deploy.yml  ← CI: build + deploy dist/ to GitHub Pages

src/
  main.js                     ← createApp, Pinia, Router
  App.vue                      ← shell: SvgSprite + LockScreen | NavBar+RouterView + SyncBanner/Overlay/Toast
  router/index.js               ← 11 routes, hash history, adminOnly guard
  stores/state.js                ← Pinia store: all app state + initApp() bootstrapping
  utils.js                        ← ik(), vl(), fmt(), date helpers, ic()
  data.js                          ← DEF (default catalogue), COLORS map, ADDON_CATS

  composables/
    useSales.js                    ← sales-flow logic (IMEI-aware), PO generation, print report
    useSync.js                      ← Google Sheets sync: tryPush, enqueue, processQueue, pullFromSheets
    useToast.js                      ← module-singleton toast state
    usePaymentLogs.js                 ← non-cash payment log CRUD/reconciliation
    useErrorLog.js                     ← sync-failure/runtime-error logging

  components/    ← SvgSprite, LockScreen, NavBar, SyncBanner, SyncOverlay, Toast,
                    ProductGrid, ProductCard, SaleForm, AddonPicker, IMEIPicker,
                    CustomerForm, ReviewSale, TodayReport, Scanner

  views/         ← SalesPage, InventoryPage, PurchaseOrdersPage, MasterListPage,
                    SettingsPage (tabs: General / Google Sheets Sync — embeds SetupPage as a
                    child component, not a separate route), SetupPage, RestockPage,
                    ReportsPage, DashboardPage, PaymentLogsPage, IssuesPage
```

Nav items are grouped by section in `NavBar.vue` (`ops` → `insights` → `catalog` → `system`), rendered with a divider/label between groups. `/setup` is a router redirect to `/settings?tab=sync`, not a standalone nav item — Setup was merged into Settings as its "Sync" tab since both are the same admin-configuration concern.

**No legacy code in the working tree.** The original single-file `tecnix-ops_25.html` and an intermediate vanilla ES-module (`js/*.js`) version both existed historically but were fully replaced by `src/` — they exist only in git history (`backup/vanilla-js` branch, `v1.0-vanilla-js` tag). Do not assume either exists; do not reintroduce global-scope inline-`onclick` patterns from that era.

---

## State Management

All runtime state lives in one Pinia setup store, `useAppStore()` (`src/stores/state.js`) — no props-drilling, components call it directly. Key pieces: `currentUser`, `masterList`/`PRODUCTS` (computed, excludes obsolete), `inventory`, `predefinedBundles`, `productFreebies`, `settings`, `saleRows`, `pendingItems`, `paymentLogs`, `errorLogs`, `currentSO`, `purchaseOrders`, `scriptUrl`, `units` (IMEI records), `syncQueue`.

`initApp()` (called once from `App.vue`'s `onMounted`) seeds/loads all of the above from `localStorage`, restores today's sales if still same-day, and back-fills dummy IMEIs for pre-existing stock.

Persistence keys are prefixed `kt_*` (e.g. `kt_ml`, `kt_inv`, `kt_units`, `kt_queue`). Full key list and every data structure (Product, IMEI unit, Sale row, Purchase Order, Payment log, Issue log, Promotion) is in [docs/ARCHITECTURE.md §5–6](docs/ARCHITECTURE.md#5-state-management).

---

## Business Logic Essentials

- **Sales flow**: Picker → Detail (variant/color/IMEI, sold type, payment, add-on) → Review → Confirm → Report. Four sub-screens toggled by a local ref inside `SalesPage.vue`, not by routing.
- **Pricing**: Walk-in pays SRP; Pasa pays SRP + pasa markup; Promotions pay a fixed bundle price. `netSales = (soldPrice − unitPrice) × qty`.
- **Pasa cap**: `settings.pasaCapEnabled` (default `true`, toggle in Settings → General) caps the per-unit Pasa markup at the item's own net sales amount (`SRP − unitPrice`), so a promoter's commission can't exceed what ITEL earns on the sale. Enforced in `SaleForm.vue` (UI clamp) and again in `useSales.js buildPendingItem()` (defense in depth).
- **IMEI tracking**: Smart Phone / Bar Phone / Tablet categories are unit-tracked (`units` array, one row per physical unit with a real or dummy IMEI); accessories remain quantity-based.
- **Numbering**: SO `SO-YYMMDD-XXXX`, bundle `BDL-YYMMDD-XXX`, promo `PRO-YYMMDD-XXX`, PO `PO-{6 digits of Date.now()}`. Counters are per-device (`localStorage`), not cross-device coordinated.
- **Stock**: new products default to `{stock: 4, reorder: 1}`; `confirmSale()` decrements for every line (main, add-on, promo-addon, freebie) or marks IMEI units sold; closing the day folds at/below-reorder items into a pending PO.
- **Payment logs / AR-AP**: ITEL entries are `pending → credited` (Accounts Receivable). Bisen entries are `pending → credited → settled` (Accounts Payable) — `settlePayment()` in `usePaymentLogs.js` only allows the credited→settled transition, i.e. Admin must confirm funds landed before marking them paid out to Bisen. AP's "still owed" (pending+credited) vs. "settled to date" split is visible to all staff on `/payment-logs`, not just Admin.
- **Users**: Sam/Joyce see Log Sale + Receive Stock + Payment Logs only; Admin sees everything and is gated by a PIN (Sheets-verified with a local SHA-256 fallback, default `1234`) — not real security, just a soft convenience gate.

---

## Google Sheets Sync (Optional Backend)

`useSync.js` is the whole story: `tryPush()` (immediate POST, falls back to `enqueue()` + logs an issue on failure), `processQueue()` (drains the offline queue, manual "Sync Now" or on the `online` event), `pullFromSheets()` (hydrates local state from Sheets, only when the queue is empty, to avoid clobbering unsynced local edits).

The Apps Script source lives embedded in `SetupPage.vue` (`SCRIPT_SOURCE`), copy-pasted by the store owner into their own Apps Script project. It backs 11 sheet tabs (Sales Log, Inventory, Purchase Orders, PO Items, Payment Logs, Promotions, Freebies, Settings, Units, Issue Log, Master List). See [docs/ARCHITECTURE.md §9–10](docs/ARCHITECTURE.md#9-offline-first-sync-architecture) for the full action list, tab schemas, and sync caveats — most importantly: **updating `SCRIPT_SOURCE` in this repo does not update anyone's already-deployed script.** A store owner must re-copy and redeploy (Deploy → Manage Deployments → Edit → New Version) before new actions take effect.

---

## Development Workflow

1. `npm run dev`, edit `.vue`/`.js` files under `src/` directly.
2. No inline `onclick` — use standard Vue event bindings (`@click`, etc.) and component props/emits.
3. Keep `css/styles.css` class naming consistent with the abbreviated conventions carried over from the pre-Vue era (`.pc`, `.sc`, `.sw`, `.sb`/`.sok`/`.slow`/`.sout`, `.g2`/`.g3`, `.pgrid`, `.btn-*`) — intentional, not accidental compactness.
4. There is no automated test suite. Manually test the full sales flow (Sam/Joyce: product → detail → review → confirm → report) and the Admin tabs (Inventory, PO, Master List, Settings, Setup, Restock, Reports, Dashboard, Payment Logs, Issues) after any change that touches them.
5. Adding products: edit `DEF` in `src/data.js`, or use Master List → "New Item" at runtime.
6. Modifying the Apps Script: edit the `SCRIPT_SOURCE` string in `SetupPage.vue` directly, keeping every frontend-called action (see `useSync.js`, `usePaymentLogs.js`, `useErrorLog.js`) backed by a matching server-side handler.

---

## Important Constraints

- **Currency**: Philippine Peso (₱) throughout — use `fmt(n)` for display, `en-PH` locale for formatting.
- **No cross-device counter coordination** — SO/PO numbers can collide if two devices are used simultaneously without a synced counter (documented, unresolved).
- **`localStorage` is origin-scoped** — moving the deployed URL orphans local data on devices already in use.
- **Keep docs/ARCHITECTURE.md current.** It's the authoritative technical reference; update it (not just this file) when architecture changes.
