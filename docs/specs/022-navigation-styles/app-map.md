# 022 — Full app map: every section and sub-menu

The owner asked on 2026-11-21 for the menu to name the whole product now, phases 1 to 6, with pages
that are not built yet opening an Under development page (`owner-questions.ar.md`, NAV-L0).

## How to read it

- **Live**: the route exists on `main` at `de88bfd` and is in today's menu
  (`src/modules/permissions/ui/navigation.ts`). It keeps its address and its rule.
- **Soon**: no route in this repository. The entry carries a "Soon" mark and opens the Under
  development page.
- **Phase**: this document's reading of where the feature sits. Phase 1 comes from this
  repository's `docs/PRD-phase1.ar.md`. Phases 2 to 6 come from the product PRD kept in
  `lolotam/PayPos.systems` (`docs/PRD.md` §7 and §10), because this repository has no PRD for
  them; its own PRD only lists them as out of scope (§2, §14). "—" means neither PRD plans it.
- Names are working names in English. The Arabic and English labels go in `src/i18n` when an entry
  is added, and each name is confirmed when its feature gets a spec here.

The areas are those of spec 016: company management `/app`, reception `/pos`, staff `/me`, platform
`/admin`. This spec adds no page: the style choice is a new section of each area's existing Settings
page.

## Company management (`/app`)

### 1. Home

| Page | State | Phase |
|---|---|---|
| Dashboard (`/app`) | Live | 1 |
| Approvals inbox (discounts, voids, cash variance, wastage) | Soon | 2 |
| All-businesses dashboard | Soon | 5 |

### 2. Team

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Staff | Team (`/app/staff/team`) | Live | 1 |
| Staff | Cards (`/app/staff/cards`) | Live | 1 |
| Staff | Phones (`/app/staff/phones`) | Live | 1 |
| Staff | Schedules and shifts | Soon | 1 |
| Staff | Leave | Soon | 1 |
| Staff | Documents | Soon | 1 |
| Attendance | Reports (`/app/attendance/reports`) | Live | 1 |
| Attendance | Corrections (`/app/attendance/corrections`) | Live | 1 |
| Attendance | Insights (`/app/attendance/questions`) | Live | 1 |
| Pay | Commission plans (`/app/commissions/plans`) | Live | 1 |
| Pay | Commission overrides (`/app/commissions/overrides`) | Live | 1 |
| Pay | Salaries (`/app/commissions/salaries`) | Live | 1 |
| Pay | Monthly statements | Soon | 1 |
| Pay | Payroll runs and payslips | Soon | 5 |
| Pay | Loans and advances | Soon | 5 |

### 3. Services and sales

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Services | Services (`/app/services`) | Live | 1 |
| Services | Sessions (`/app/services/sessions`) | Live | 1 |
| Services | Discounts (`/app/services/discounts`) | Live | 1 |
| Services | Discount approvals (`/app/services/approvals`) | Live | 1 |
| Services | Packages | Soon | 1 |
| Orders | Orders | Soon | 2 |
| Orders | Returns | Soon | 2 |
| Payments | Payments and refunds | Soon | 2 |
| Payments | Customer accounts (on-account sales) | Soon | 2 |
| Cash | Cash shifts | Soon | 2 |
| Cash | Paid in and paid out | Soon | 2 |
| POS | POS devices and PINs | Soon | 2 |
| POS | Receipts and printing | Soon | 2 |
| Restaurant | Tables and floor map | Soon | 3 |
| Restaurant | Kitchen screens and stations | Soon | 3 |
| Delivery | Delivery channels | Soon | 4 |
| Delivery | Delivery zones | Soon | 2 |

### 4. Catalog and stores

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Catalog | Products and variants | Soon | 2 |
| Catalog | Categories | Soon | 2 |
| Catalog | Options and modifiers | Soon | 2 |
| Catalog | Price lists | Soon | 2 |
| Catalog | Combos and bundles | Soon | 2 |
| Stores | Stock items | Soon | 3 |
| Stores | Locations | Soon | 3 |
| Stores | Suppliers | Soon | 3 |
| Stores | Purchases | Soon | 3 |
| Stores | Transfers | Soon | 3 |
| Stores | Stock counts | Soon | 3 |
| Stores | Adjustments and wastage | Soon | 3 |
| Production | Recipes | Soon | 3 |
| Production | Production orders | Soon | 3 |

### 5. Customers and marketing

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Customers | Customers | Soon | 1 |
| Customers | Tags and blocks | Soon | 2 |
| Customers | Ratings and reviews | Soon | 1 |
| Appointments | Calendar | Soon | 4 |
| Appointments | Resources (chairs, rooms) | Soon | 4 |
| Appointments | Waitlist | Soon | 4 |
| Appointments | Booking rules | Soon | 4 |
| Online | Company page (`/app/page`) | Live | 1 |
| Online | Online menu builder | Soon | 4 |
| Marketing | Business WhatsApp | Soon | 4 |
| Marketing | Campaigns | Soon | 4 |
| Marketing | Message templates | Soon | 4 |
| Marketing | Social media management | Soon | — |
| Loyalty | Loyalty points | Soon | 4 |
| Loyalty | Loyalty cards (wallet stamp cards) | Soon | 6 |
| Loyalty | Gift cards | Soon | 4 |
| Loyalty | Discount cards and codes | Soon | 4 |

"Social media management" is the owner's request of 2026-11-21 and is in neither PRD. Whether it is
listed or left out is NAV-L3, unanswered: `TODO(spec)`. It is counted below and dropped from the
release if the answer is to leave it out.

### 6. Reports and money

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Sales reports | Sales (by channel, type, method, hour, staff) | Soon | 5 |
| Sales reports | Products and returns | Soon | 5 |
| Sales reports | Payments and customer balances | Soon | 5 |
| Stock reports | Stock and cost of goods | Soon | 3 |
| Performance | Commissions and performance | Soon | 5 |
| Performance | Appointments report | Soon | 5 |
| Expenses | Expenses | Soon | 5 |
| Expenses | Recurring expenses | Soon | 5 |
| Expenses | Profit and loss per business | Soon | 5 |
| Exports | Scheduled reports | Soon | 5 |
| Exports | Accounting export | Soon | 5 |

### 7. Setup

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Business | Settings (`/app/settings`) | Live | 1 |
| Business | Data import (Excel) | Soon | 1 |
| Business | Notifications and alerts | Soon | 1 |
| Business | Tax and invoice template | Soon | 2 |
| Business | Working hours and order rules | Soon | 2 |
| Business | Payment methods and gateways | Soon | 2 |
| Access | Permissions (`/app/permissions`) | Live | 1 |
| Access | Approval limits | Soon | 2 |
| Access | Open reception (`/pos`) | Live | 1 |
| Plan | Subscription and billing | Soon | 5 |
| Developers | API keys and webhooks | Soon | 5 |
| Compliance | ZATCA e-invoicing (Saudi Arabia) | Soon | 6 |
| More business types | Laundry tickets | Soon | 6 |
| More business types | Grocery and retail (barcode, scale, offers) | Soon | 6 |
| More business types | Quotes and invoices (services companies) | Soon | 6 |
| More business types | Gym and education (memberships, classes) | Soon | 6 |
| More business types | Patient files (clinics) | Soon | 6 |

## Reception (`/pos`)

| Sub-menu | Page | State | Phase |
|---|---|---|---|
| Today | Reception home (`/pos`) | Live | 1 |
| Attendance | QR check-in (`/pos/qr`) | Live | 1 |
| Attendance | Card scan (`/pos/cards`) | Live | 1 |
| Sessions | Sessions (`/pos/sessions`) | Live | 1 |
| Sell | New sale | Soon | 2 |
| Sell | Open orders | Soon | 2 |
| Sell | Returns | Soon | 2 |
| Cash | My cash shift | Soon | 2 |
| Appointments | Today's bookings | Soon | 4 |
| Setup | Settings (`/pos/settings`) | Live | 1 |

## Staff (`/me`)

| Page | State | Phase |
|---|---|---|
| My dashboard (`/me`) | Live | 1 |
| Attend (`/me/attend`) | Live | 1 |
| My phone (`/me/phone`) | Live | 1 |
| My leave | Soon | 1 |
| My commissions | Soon | 1 |
| My schedule | Soon | 1 |
| Settings (`/me/settings`) | Live | 1 |

## Platform (`/admin`)

| Page | State | Phase |
|---|---|---|
| Dashboard (`/admin`) | Live | 1 |
| Connectors (`/admin/connectors`) | Live | 1 |
| Diagnose (`/admin/diagnose`) | Live | 1 |
| Settings (`/admin/settings`) | Live | 1 |
| Companies and subscriptions | Soon | 5 |
| Plans and feature flags | Soon | 5 |
| Support and health | Soon | 5 |

## Counts

Menu pages per area (child pages such as create and detail pages have no entry of their own):

| Area | Live | Soon | Total |
|---|---|---|---|
| Company management | 18 | 76 | 94 |
| Reception | 5 | 5 | 10 |
| Staff | 4 | 3 | 7 |
| Platform | 4 | 3 | 7 |
| All areas | 31 | 87 | 118 |

The 31 Live entries are the leaves of today's menu in `navigation.ts` (a group with children counts by its children).

## Top level in each style (`/app`)

| Section | A — Sidebar and tabs | B — Top bar and hubs | C — Rail and panel |
|---|---|---|---|
| 1. Home | Home | Today | Front desk › Now |
| 2. Team | Team | People | Team |
| 3. Services and sales | Sales | Sell | Front desk |
| 4. Catalog and stores | Catalog and stores | Stock | Stock |
| 5. Customers and marketing | Customers | Grow | Customers |
| 6. Reports and money | Reports | Business › Reports | Business › Reports |
| 7. Setup | Setup | Business › Setup | Business › Setup |
| Top-level count | 7 | 6 (Today, Sell, Stock, Grow, People, Business) | 5 (Front desk, Stock, Customers, Team, Business) |

- **A:** a section's sub-menus are its tabs and a sub-menu's pages are pills. On a phone the bottom
  bar holds four sections and More; the More sheet lists each other section with its sub-menus as
  direct links, so More, sub-menu, page is three taps.
- **B:** a section's sub-menus are the columns of its wide menu and the headings of its local list.
  On a phone, a drawer with one accordion per section.
- **C:** a section's sub-menus are the labels of its panel. On a phone the bottom bar holds the
  workspaces and the page finder sits in the top bar.
- `/pos`, `/me` and `/admin` are small: their sub-menus above are the top level, at most six
  entries each.

## The Under development page

- One page, opened by every Soon entry. It shows the entry's name, one line saying the page is
  under development, and a button back to the area's home. No date and no phase number.
- Its address is `/<area>/soon/<page>`, so it stays inside the area's layout and its session
  checks.
- A Soon entry gives no access to anything: it opens that page only.
- When a page is built, its entry becomes Live and points to the real address. An old Under
  development link then applies the page's own rule first: a user who may see the page is forwarded
  to it, a user who may not gets the not-found page.
- Who sees Soon entries is NAV-L2, unanswered. Whatever the answer, the same rule applies in the
  menu, in the page finder and to a direct link.
