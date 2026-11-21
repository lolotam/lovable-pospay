# 022 — permissions: three switchable navigation styles and the full app menu

Requested by Waleed on 2026-11-21 (Kuwait). Tier: Light for this spec and plan; the implementation
steps carry their own tiers in `plan.md`.

Companion files: `app-map.md` (every section, sub-menu and page, built or not), `plan.md`,
`owner-questions.ar.md`.

## Requirement

Every area of the app (`/admin`, `/app`, `/pos`, `/me`) is drawn by one shell,
`src/modules/permissions/ui/area-shell.tsx`: a sidebar of collapsible groups from md width, and on
phones a floating tab bar plus a drawer. The menu is data
(`src/modules/permissions/ui/navigation.ts`), filtered by permission, company role and feature
availability.

The owner wants three things:

1. **Three navigation styles**, listed by name, that any signed-in user can switch between at any
   time. The whole frame changes at once. Same colours, fonts and buttons in all three (Souk Tiles
   tokens in `src/styles.css`). The default is C.
   - **A — Sidebar and tabs.** A short sidebar of sections; a section's sub-menus are a tab row
     under the top bar; a sub-menu's pages are pills. Phone: a bottom bar of four sections plus
     More.
   - **B — Top bar and hubs.** Sections in a top bar, each opening a wide menu of its sub-menus and
     pages, with an overview page per section and a local list beside the page. Phone: a drawer
     with accordions.
   - **C — Rail and panel.** Workspaces on a narrow icon rail; a panel lists the current
     workspace's pages under sub-menu labels; a page finder (Ctrl+K) reaches every page by name.
     Phone: bottom tabs for the workspaces, the finder in the top bar.
2. **The choice is saved on the user's account**, so it follows them to another device.
3. **The menu names the whole product now**, phases 1 to 6: sales and POS, catalog and stores,
   customers and marketing, team, reports and money, setup. A page that is not built yet is marked
   "Soon" and opens an Under development page until it is finished. The list is `app-map.md`.

Salon example: Noor, a branch manager, opens the app and sees style C. She prefers a sidebar, opens
Appearance, picks "A — Sidebar and tabs", and the frame changes on the spot. Next day she signs in
on the reception tablet and still gets A. Under Customers she sees "Loyalty cards — Soon"; opening
it tells her the page is under development.

Out of this spec: the look of the pages themselves (page layouts are unchanged), any new business
feature, and the other project (`PayPos.systems`), which has its own spec and plan.

## Business rules (cite PRD D-xx / ق-x)

- **R1 (owner, 2026-11-21).** Three styles, A, B and C, ship together. The default is C.
- **R2 (owner, 2026-11-21).** Every signed-in user may change their own style. No permission key
  guards it.
- **R3 (owner, 2026-11-21).** The choice belongs to the user, not to a company or a role: it is the
  same in every workspace the user enters (PRD §3, D-46: one account, several memberships).
- **R4 (owner, 2026-11-21).** The three styles share colours and fonts; only the arrangement
  differs.
- **R5 (owner, 2026-11-21).** The menu lists every section and sub-menu of the product for phases 1
  to 6. A page not built yet opens an Under development page.
- **R6 (spec 016 R4, PRD §9, D-31).** For built pages, who sees an entry is unchanged: the
  permission key, the company role and feature availability that `visibleNavigation` applies today.
- **R7 (owner, 2026-11-21, NAV-L2).** A not-built entry is shown only to the business types and roles it
  is meant for, in the menu, in the page finder and to a direct link. Every workspace limit of an
  entry, business type and country alike, still applies after its page is built, together with the
  page's own permission, and in the same four places: the menu, the page finder, a direct link and
  the forward from an old Under development address. Platform entries are the exception: they are
  not filtered by business type or company role, because a platform workspace has neither.
- **R8 (PRD §2, §14).** This repository's PRD covers Phase 1 only and lists POS, payment, invoices,
  cash, stock, restaurants, delivery, loyalty and bookings as out of scope. The later-phase entries
  in `app-map.md` come from the product PRD kept in `lolotam/PayPos.systems` (`docs/PRD.md` §7 and
  §10). Their names are working names until each feature has its own spec here.
- **R9 (owner, 2026-11-21, NAV-L3).** "Social media management" is listed as a Soon entry under Marketing.
  It is in neither PRD and needs a spec before anything is built.
- **R10 (owner, 2026-11-21, NAV-L5).** The menu is one map shared with the other project
  (`lolotam/PayPos.systems`, spec 074): the same sections, sub-menus, page names, order and place in
  each style. Only the built-or-not state of a page may differ between the two.
- **R11 (owner, 2026-11-21, NAV-L5).** The menu follows the business selected in the workspace
  switcher: an owner with a salon and a restaurant sees each business's own entries after switching.
- **R12 (owner, 2026-11-21, NAV-L5).** The Approvals inbox is a working page under Home from the first
  release, in the same place in every style. It lists the kinds of approval that exist (discount
  approvals today) and that the user may open: each kind keeps the rule of its own menu entry
  (`discounts.manage` for discount approvals), and its count is fetched only when that rule passes.
  Each kind links to its existing page; later kinds are added as they are built. The inbox entry
  shows one count, the sum over the kinds listed, taken from the reads that exist
  (`pendingApprovals` today). A read that fails is not a zero: the inbox entry then shows a mark that
  the count is unavailable instead of a number, and the failed kind's row says so, so a partial sum
  is never shown as the total. Each kind also stays in its own section with its own badge.
- **R13 (workspace data, 2026-11-21).** The workspace names only four business types today (`salon`,
  `restaurant`, `laundry`, `other` in `businessTypeSchema`) and no country. Until it carries more
  (`plan.md` step 4b), an entry limited to a business type or a country the workspace cannot name is
  hidden, and a workspace stored as `other` sees only the entries open to every business type. The
  rule hides; it never shows an entry to a business it is not meant for. The stored type is also
  not verified: spec 016 uses it for display only and migration 0018 defaults it to `salon`, so a
  company never classified looks like a salon. Until step 4b confirms each company's type, the
  stored value filters Under development entries only, where a wrong match shows a placeholder and
  nothing else, and no built page is opened or closed by business type.
- **R14 (owner, 2026-11-21, NAV-L9).** The three styles are released first with the choice kept on
  each device; saving it on the account follows in a later step.

## Edge cases

- The stored choice is not A, B or C: the app shows C.
- A user who never chose signs in on a browser where another user chose A: they see C.
- A session expires without sign-out and a different user signs in: they see their own choice, or C.
- The account value cannot be read at sign-in: the user signs in normally and starts on C.
- The user picks A and then B before the first save has finished: the account ends with B.
- Switching style while on an overview page that only the old style has: the user lands on the
  first page of that section they may see, or on the area's home if there is none.
- An area with few entries (`/admin` and `/me` have four each): all three styles still apply; a
  section with one page shows no tab row or sub-menu.
- The reception area (`/pos`) is used on a shared tablet by several receptionists: each sees their
  own style after signing in.
- A not-built page is built later: an old link to its Under development address applies the page's
  own rule and the entry's business-type and country limits first, then forwards a user who may see
  it and shows not-found to one who may not.
- Permission and role checks hide every page of a section: the section is not shown, in every
  style.
- The discount-approvals badge (`pendingApprovals`) keeps working in every style.
- Other open tabs keep their frame until their next navigation or reload.

## Acceptance criteria (concrete numbers)

1. With no saved choice, every area opens in style C.
2. Each area has an Appearance page, under Setup in the Management and Reception areas and as an
   entry of its own in Staff and Platform, which have no sections, and the same choice in the user
   menu. It is today's
   Settings page (`src/modules/permissions/ui/settings-page.tsx`, reached at `/app/settings`,
   `/pos/settings`, `/me/settings` and `/admin/settings`), which already holds the light and dark
   switch and is listed in the menu as Appearance. It lists exactly three styles by name and marks
   the current one. Picking another changes the frame without a full page reload and without
   changing the address.
3. A user with the `staff` role and no extra permission can open `/me/settings` and change the
   style.
4. After a reload the first frame drawn is the style remembered on that device; no other style is
   shown first.
5. After the account step ships: a user who chose A in one browser sees A after signing in on
   another.
6. Every page in `app-map.md` is in the menu of its area in each of the three styles, for the business
   types and roles it is meant for. Every entry
   marked Soon carries a visible "Soon" mark that does not rely on colour alone, and opens the
   Under development page with that entry's name, in Arabic and English, with no date and no phase
   number.
7. Every page that is not a child page appears exactly once in each style, and exactly one
   top-level entry is marked current on every page.
8. The top level has at most 7 entries in any style and any area.
9. From any page, any other page of the same area is reached in at most 3 clicks or taps, at 375,
   768 and 1280 px.
10. At 375, 768 and 1280 px, in Arabic (RTL) and English, light and dark, no page scrolls sideways.
11. Every interactive target is at least 44 px in both directions.
12. Menus, drawers, sheets and the page finder keep keyboard focus inside while open and return it
    to the control that opened them; icon-only controls have an accessible name.
13. No colour token, font or button variant in `src/styles.css` or `src/components/ui/button.tsx`
    changes.
14. Every visible string comes from `src/i18n/ar.json` and `en.json` through `t()`.
15. For built pages, the set of entries each role sees is the same as before this change.

## Schema changes (tables, RLS, grants, isolation test)

One table, added by the account step only (`plan.md` step 7). Nothing before that step touches the
database.

- **Table `user_preferences`**: `user_id text primary key` referencing the Better Auth user,
  `nav_style text null` with a check that it is `'A'`, `'B'` or `'C'` when set, `updated_at
  timestamptz not null default now()`.
- **Not a tenant table.** The choice follows the person across companies (R3), so there is no
  `company_id`. This is the same class as the platform tables, which also have none
  (`app-architecture.md` §1).
- **RLS**: enabled. Select, insert and update for role `pospay_app` only where `user_id` is the
  current app user. No delete policy.
- **Grants**: `select, insert, update` to `pospay_app`.
- **Isolation test**: a case in `db/tests/isolation.sql`: user X can neither read nor change user
  Y's row.
- **Migration**: `db/migrations/0027_user_preferences.sql` (the next free number on 2026-11-21;
  renumber if another migration lands first), idempotent, expand only.
- The owner chose this table over a column on the Better Auth `user` table on 2026-11-21 (NAV-L1):
  every app query in this repo goes through `withUser()` and RLS, and Better Auth owns its own
  table.

## Contract (Zod input/output)

- `navStyleSchema = z.enum(["A", "B", "C"])` in `src/modules/permissions/contracts.ts`.
- `sessionContextSchema` gains `navStyle: navStyleSchema` (the style to draw, already resolved to a
  default), so every area's loader has it before the first render.
- Server function `setNavStyle` in `src/modules/permissions/functions/`: input
  `{ navStyle: "A" | "B" | "C" }`, output `{ navStyle }`. It requires a signed-in user. From step 5 it writes the device copy only;
  step 7 extends the same function to also write that user's row through `withUser()`. The
  Appearance page and the user menu both call it, so step 5 has a save path without the table.
- Device copy: a cookie `pospay_nav_style`, written and read on the server next to the existing
  workspace cookie (`src/modules/permissions/persistence/workspace-cookie.server.ts`). It holds one
  style per user who chose on that device, keyed by user id and capped at the ten most recent, so a
  shared tablet never shows one person's style to the next and a returning user finds their own.
  From step 5 it is the only store: sign-out leaves it in place, and sign-in reads the entry of the
  user who signed in, or C when there is none. From step 7 the account is the source and the entry
  is refreshed from it at every sign-in.
- Errors: an invalid value is rejected by the Zod schema; no session is rejected as on the other
  permissions functions.

## Permissions (who can, who cannot)

- **Can change their own style:** every signed-in user, in every area, including `staff` and
  `reception`.
- **Cannot:** anyone for another user. There is no admin override of a user's style.
- No permission key is added to the matrix of spec 016 R4.
- Built pages: unchanged (R6). Not-built pages: by business type and role (R7).

## Tests

- **Navigation data:** every page of `app-map.md` has one entry in its area; every entry that is
  not a child appears once in each style's arrangement; exactly one top-level entry is current for
  every route; every label key exists in `ar.json` and `en.json`; the entries each role sees for
  built pages match a snapshot taken before the change.
- **Rendered, per style:** the current entry is visibly marked; a Soon entry shows its mark; a
  section with no visible page is absent; the approvals badge shows its count.
- **Switching:** picking a style changes the visible frame and keeps the route; the default is C;
  an unknown stored value shows C; a `staff` user can switch.
- **Device copy:** user X picks A, signs out and signs in again on the same device: A; user Y signs
  in on that device: C, or Y's own choice; the eleventh user drops the oldest entry; from step 7 a
  sign-in refreshes the entry from the account and a failed account read keeps the device entry;
  the server-rendered frame matches it.
- **Return after sign-in:** a signed-out user who opens an Under development address is returned to
  it after signing in; an unknown page id goes to the area's home.
- **Account (step 7):** read with nothing saved; write then read; invalid value rejected; no
  session rejected; choosing A then B with the first save delayed ends with B; the isolation case
  in `db/tests/isolation.sql`.
- **Under development page:** shows the entry's name in both languages; an unknown address shows
  not-found; an old address of a built page forwards or shows not-found by the page's own rule and the entry's
  workspace limits, including after a switch to a business the entry is not meant for.
- **Approvals inbox:** a user without `discounts.manage` sees no discount-approvals row and triggers
  no count read; a user with it sees the row and the same number on the inbox entry.
- **Widths:** 375, 768 and 1280 px, RTL and LTR, light and dark, each style, each area.

## Open questions → owner-questions.ar.md

- None open. NAV-L1 was answered on 2026-11-21: the `user_preferences` table.
- Answered on 2026-11-21: NAV-L2 (by business type and role), NAV-L3 (listed as Soon), NAV-L4 (all
  four areas, confirmed on its own card), NAV-L5 (one map shared with the other project), NAV-L6
  (thirteen entries added), NAV-L7 (stock entries for every business type), NAV-L8 (Customer call
  added), NAV-L9 (styles first, the account later) and NAV-L10 (the two Qayd entries, Kuwait only).
- How an owner gets a second business type on the same account is a subscription question:
  `TODO(spec)`, not part of this spec.
