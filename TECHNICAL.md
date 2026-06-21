# Khonsu Tech OPS — Technical Document

**Store:** Khonsu Electronic Gadgets Trading (ITEL Mobile)  
**Location:** Space No. K424.6, Festival Mall, FCC, Alabang, Muntinlupa City  
**Currency:** Philippine Peso (₱)

---

## 1. Overview

A browser-based Sales Operations System with no backend server. All data is stored in the browser's `localStorage`. An optional Google Apps Script Web App can be connected to sync pricing, stock, and sales logs to a Google Sheet.

The app ships as a multi-file ES Module project:

```
index.html          ← HTML shell (no inline JS)
css/styles.css      ← All CSS
js/main.js          ← Entry point, bootstraps state and event routing
js/*.js             ← 17 feature modules (ES Modules)
```

The original single-file version (`tecnix-ops_25.html`) is preserved for reference.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Vanilla JS (ES Modules) | Zero dependencies, no build step |
| Styling | Plain CSS with custom properties | Single file, no framework |
| Persistence | `localStorage` | No server required |
| Optional backend | Google Apps Script Web App | Free, no hosting needed |
| Fonts | Google Fonts (Inter + JetBrains Mono) | CDN, loaded via `@import` in CSS |

**Requirements to run:** any modern browser served over HTTP (ES modules require HTTP — `file://` protocol does not work).

---

## 3. File Structure

```
index.html
css/
  styles.css
js/
  main.js           ← bootstrap: init(), event listeners
  state.js          ← shared mutable app state object
  data.js           ← static defaults: DEF catalogue, COLORS map
  utils.js          ← ik(), vl(), fmt() helpers
  toast.js          ← toast notification
  nav.js            ← showPage(), showS() — dispatches CustomEvents
  auth.js           ← login(), logout()
  customer.js       ← toggleCustomerInfo(), getCustomerInfo(), resetCustomerInfo()
  form.js           ← renderColorFields(), recalc(), onSoldTypeChange()
  addon.js          ← add-on picker: toggleAddonPicker(), renderAddonGrid/List()
  products.js       ← buildCatFilter(), renderProducts(), openDetail(), openBundleDetail()
  sales.js          ← buildPendingItem(), goToReview(), confirmSale(), etc.
  report.js         ← renderSalesTable(), renderSummary(), submitDayReport(), printReport()
  inventory.js      ← renderInv()
  purchase-orders.js← generatePO(), renderPOs(), printPO(), PO edit CRUD
  master-list.js    ← renderML(), saveMasterList(), bundle/freebie CRUD
  settings.js       ← renderSettings(), saveSettings(), updateReorder()
  setup.js          ← connectSheet(), syncPricingFromSheet(), syncInventoryFromSheet(),
                       pushStockDecrement(), pushInventory(), pushMasterList()
```

---

## 4. Module Dependency Graph

Arrows = "imports from". Leaf modules at the top.

```
state.js   data.js   utils.js   toast.js
    │          │         │          │
    └──────────┴─────────┴──────────┘
                         │
              ┌──────────┼──────────┐
           nav.js     form.js    customer.js
              │          │
           addon.js      │
              │          │
           products.js ──┘
              │
    ┌─────────┼──────────┐
 inventory  report.js  purchase-orders.js
    │          │
 master-list  settings.js
    │
 setup.js ◄── auth.js ◄── (main.js side-effect import)
    ▲
 sales.js ◄── (main.js side-effect import)
```

**Circular dependency avoidance:**
- `nav.js` dispatches `page:change` and `screen:change` CustomEvents instead of importing render modules directly. Listeners are registered in `main.js`.
- `products.js` calls `window.goToReview()` (not an ES import) to avoid a cycle with `sales.js`.

---

## 5. State Management

All runtime state lives in a single exported object in `js/state.js`. Every module imports this object by reference — mutations are shared immediately.

```js
export const state = {
  currentUser: null,          // 'Sam' | 'Joyce' | 'Admin'
  masterList: [],             // full product catalogue (includes obsolete)
  PRODUCTS: [],               // masterList.filter(p => !p.obsolete)
  inventory: {},              // { [productKey]: { stock, reorder } }
  predefinedBundles: [],      // seasonal promotions
  productFreebies: {},        // { [mainProductKey]: freebieProductKey }
  settings: {
    dailyTarget: 3000,
    lowStockThreshold: 2,
    globalReorder: 1,
  },
  saleRows: [],               // confirmed transactions for the current day
  pendingItems: [],           // staged items not yet confirmed
  currentSO: null,            // active Sales Order string e.g. 'SO-260621-0001'
  soCounter: 0,               // persisted in localStorage kt_so
  selectedProduct: null,      // product on the detail screen
  selectedAddon: null,        // { product, soldPrice }
  activeCat: 'Smart Phone',   // active category filter
  searchQ: '',
  addonCat: 'All',
  bundleCounter: 0,           // persisted in localStorage kt_pc
  purchaseOrders: [],         // persisted in localStorage kt_pos
  scriptUrl: '',              // Google Apps Script Web App URL
  editingPOId: null,
};
```

### localStorage Keys

| Key | Content |
|---|---|
| `kt_ml` | Master list array (JSON) |
| `kt_inv` | Inventory object (JSON) |
| `kt_bundles` | Bundles/promotions array (JSON) |
| `kt_freebies` | Freebies object (JSON) |
| `kt_settings` | Settings object (JSON) |
| `kt_so` | SO counter integer |
| `kt_pc` | Bundle/promo code counter integer |
| `kt_pos` | Purchase orders array (JSON) |
| `kt_url` | Google Apps Script Web App URL |

---

## 6. Key Data Structures

### Product (in `masterList` / `PRODUCTS`)
```js
{
  category: 'Smart Phone',   // Bar Phone | Smart Phone | Tablet |
                             // Earbuds | Smart Watch | Power Bank | Others
  name: 'A50C',
  ram: '2GB',                // empty string for non-phones/tablets
  storage: '64GB',           // empty string for non-phones/tablets
  unitPrice: 2789,           // cost / purchase price (₱)
  srp: 2999,                 // suggested retail price (₱)
  colors: 'Black, White',    // comma-separated string
  obsolete: false,
}
```

### Inventory Entry
```js
inventory['A50C 2GB/64GB'] = { stock: 4, reorder: 1 }
// key produced by ik(product)
```

### Pending Item (staged, not yet confirmed)
```js
{
  id, isPromo, bundleCode, bundleName,
  product,          // full product object
  colors,           // string[] — one per unit
  color,            // colors.join(', ')
  qty, soldType, promoter, pasa, payment,
  srp, sp,          // sp = sold price (srp | srp+pasa | bundlePrice)
  unitPrice, net,
  addon,            // { product, soldPrice } | null
  freebie,          // { name, key } | null
  promoAddon,       // { key, name } | null
  customer,         // { name, contact, email } | null (first item only)
}
```

### Sale Row (confirmed, in `saleRows`)
```js
{
  id, so, bundle, itemName, variant, color, qty,
  unitPrice, srp, soldPrice, pasaPrice, discount, netSales,
  payment,          // Cash | Card | Home Credit
  soldType,         // Walk-in | Pasa
  promoter, staff, productKey,
  isAddon,          // true for add-on rows
  isPromotion,      // true for bundle/promo main rows
  isPromoAddon,     // true for included promo accessory rows
  customer,         // { name, contact, email } | null
}
```

### Purchase Order
```js
{
  id: 'PO-123456',
  date: '6/21/2026, 10:00:00 AM',
  supplier: 'Tecnix Trading',
  approver: 'Admin',
  items: [{ name, qty, color }],
  status: 'pending' | 'sent',
}
```

---

## 7. Utility Functions (`js/utils.js`)

| Function | Logic | Example |
|---|---|---|
| `ik(p)` | Inventory key | `'A50C 2GB/64GB'` |
| `vl(p)` | Variant label | `'2GB / 64GB'` or `''` |
| `fmt(n)` | Peso format | `'₱2,999.00'` or `'N/A'` |

---

## 8. Sales Flow

```
[Picker screen]
  User taps product card
        │
        ▼
  openDetail(key)         — sets state.selectedProduct, shows detail screen

[Detail screen]
  User fills: color(s), qty, sold type, pasa price, payment, optional add-on
  recalc()                — updates price display reactively
        │
        ├─ "+ Add Another Item" → addAnotherItem()
        │       └─ buildPendingItem() → push to state.pendingItems → back to Picker
        │
        └─ "Review Sale →" → goToReview()
                └─ buildPendingItem() → push to state.pendingItems
                   generate SO number if none exists
                   renderReview() → show Review screen

[Review screen]
  Shows all pendingItems with subtotals and grand total
  "+ Add Another Item" → addItemFromReview() → back to Picker
  "✓ Customer Approved" → confirmSale()
        │
        ├─ Moves pendingItems → saleRows
        ├─ Decrements localStorage inventory for each item/addon/freebie
        ├─ pushStockDecrement() → Google Sheet Inventory (fire-and-forget)
        └─ Shows Picker screen

[Report screen]  (showS('report'))
  Aggregates saleRows for current day
  "Submit" → submitDayReport()
        ├─ POST logSale → Google Sheet Sales Log
        ├─ Generates PO if any product is at/below reorder point
        └─ Clears saleRows for next day
```

---

## 9. Pricing Rules

| Sold Type | Customer Pays | Net Sales Formula |
|---|---|---|
| Walk-in | SRP | `(SRP − unitPrice) × qty` |
| Pasa | SRP + pasaPrice | `(SRP + pasa − unitPrice) × qty` |
| Promotion/Bundle | Fixed bundle price | `(bundlePrice − unitPrice) × qty` |

Add-on net: `addonSoldPrice − addonUnitPrice`  
Promo included accessory net: `−(addonUnitPrice × qty)` (cost with no revenue)

---

## 10. Numbering Formats

| Type | Format | Example |
|---|---|---|
| Sales Order | `SO-YYMMDD-XXXX` | `SO-260621-0001` |
| Bundle code | `BDL-YYMMDD-XXX` | `BDL-260621-001` |
| Promo code | `PRO-YYMMDD-XXX` | `PRO-260621-001` |
| Purchase Order | `PO-{6 digits of Date.now()}` | `PO-123456` |

SO and promo counters persist in `localStorage` (`kt_so`, `kt_pc`).

---

## 11. Google Sheets Integration

### Sheet Tabs and Columns

**Inventory**

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Category | Model | RAM | Storage | Colors | Unit Price | SRP | Stock | Reorder Point |

**Master List**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Category | Model | RAM | Storage | Colors | Unit Price | SRP | Status |

`Status` is `Active` or `Obsolete`.

**Sales Log**

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Date | Bundle | Item | Variant | Color | Qty | Unit Price | SRP | Sold Price | Pasa Price | Discount | Net Sales | Payment | Sold Type | Promoter | Staff |

**Purchase Orders**

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| PO Number | Date | Supplier | Items | Quantities | Status | Approver |

---

### Apps Script API Reference

All calls go to the same Web App URL. POST calls send `{ action, ...payload }` as JSON.

#### GET Actions

| `?action=` | Returns | Called when |
|---|---|---|
| `ping` | `{status:'ok'}` | Health check |
| `getMasterList` | `{rows:[{category,model,ram,...}]}` | Login — sync pricing |
| `getInventory` | `{rows:[{key,stock}]}` | Login — sync stock levels |

#### POST Actions

| `action` | Payload | Called when |
|---|---|---|
| `init` | _(none)_ | Setup tab → Connect |
| `decrementStock` | `{items:[{productKey,qty}]}` | Each `confirmSale()` |
| `logSale` | `{date,rows:[saleRow]}` | Day-end Submit |
| `logPO` | `{id,date,supplier,items,status,approver}` | Auto PO after Submit |
| `pushMasterList` | `{rows:[[col A…J]]}` | Master List → Save Changes |
| `pushInventory` | `{rows:[[col A…I]]}` | Setup tab → Push Master List |

---

### Data Flow Summary

```
LOGIN
  ├─ GET getMasterList  →  update pricing/status in localStorage + re-render
  └─ GET getInventory   →  overwrite stock counts in localStorage

CONFIRM SALE (real-time, fire-and-forget)
  └─ POST decrementStock  →  Inventory sheet column H decremented per item

DAY-END SUBMIT
  ├─ POST logSale       →  append rows to Sales Log sheet
  └─ POST logPO         →  append row to Purchase Orders sheet (if low stock)

ADMIN — MASTER LIST SAVE
  └─ POST pushMasterList →  replace all rows in Master List sheet

ADMIN — SETUP TAB
  └─ POST pushInventory  →  replace all rows in Inventory sheet (one-time)
```

**Source of truth:** Google Sheet is authoritative for pricing and stock. The app reads from the sheet on every login and overwrites localStorage — so even after a browser cache wipe, data is restored from the sheet on next login.

---

## 12. Navigation Architecture

### Pages (toggled by `showPage(name, event)`)

| Page ID | Tab | Visible to |
|---|---|---|
| `page-sales` | Log Sale | Everyone |
| `page-inventory` | Inventory | Admin only |
| `page-po` | Purchase Orders | Admin only |
| `page-masterlist` | Master List | Admin only |
| `page-settings` | Settings | Admin only |
| `page-setup` | Setup | Admin only |

### Sub-screens within Sales page (toggled by `showS(name)`)

| Screen ID | Purpose |
|---|---|
| `s-picker` | Product grid + category filter |
| `s-detail` | Transaction detail form |
| `s-review` | Review pending items before confirm |
| `s-report` | Daily totals + Submit/Print |

`showPage` and `showS` dispatch `page:change` and `screen:change` CustomEvents. `main.js` listens for these and calls the appropriate render function — this keeps `nav.js` free of imports from render modules.

---

## 13. Users and Permissions

| User | Tabs visible | Notes |
|---|---|---|
| Sam | Log Sale only | Standard staff |
| Joyce | Log Sale only | Standard staff |
| Admin | All tabs | Full access |

No real authentication — user is selected on the lock screen. `state.currentUser` is set on login and cleared on logout.

---

## 14. Deployment

### Serving the App
ES modules require HTTP. Use any static file server:

```bash
# Python (built-in)
python -m http.server 8080

# Node (npx)
npx serve .

# Production
GitHub Pages / Netlify / Vercel / Cloudflare Pages (all free tier)
```

### Connecting Google Sheets
1. Create a Google Sheet named **Khonsu Tech Operations**
2. Open **Extensions → Apps Script**, paste the script from the Setup tab
3. **Deploy → New Deployment → Web App** — set access to **Anyone**
4. Copy the Web App URL into the app's Setup tab → Connect
5. Click **Push Master List** to seed the Inventory sheet with initial stock
6. On next login the app will pull pricing and stock from the sheet

### Redeploying the Apps Script after Changes
Changes to the Apps Script source require a new deployment version:  
**Deploy → Manage Deployments → Edit → New Version → Deploy**

The Web App URL stays the same across versions.

---

## 15. Known Constraints

- **Single origin:** `localStorage` is scoped to the domain. If the app moves to a new URL, data does not follow it (but the sheet backup covers pricing and stock).
- **No multi-device sync mid-day:** `saleRows` (in-progress day data) live only in `localStorage`. They are not pushed to the sheet until day-end Submit.
- **CORS in development:** Apps Script CORS headers are only sent from the deployed URL, not in `localhost` preview. The app catches these errors silently — data is saved locally and synced on next interaction.
- **Apps Script quotas:** Google imposes [daily execution quotas](https://developers.google.com/apps-script/guides/services/quotas). For a single-store operation these limits are not a practical concern.
