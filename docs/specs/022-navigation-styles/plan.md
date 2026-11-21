# 022 Implementation Plan

**Goal:** deliver `docs/specs/022-navigation-styles/spec.md` and `app-map.md`: three switchable
navigation styles (default C) in all four areas, the choice saved on the account, and a menu that
names the whole product with an Under development page for what is not built.

**Executors:** the manager assigns each PR under the tiers of `CLAUDE.md`. This plan does not pick
a lane.

**Rules for every task:** Souk Tiles tokens only, no change to `src/styles.css` tokens or to
`src/components/ui/button.tsx`; mobile-first; logical CSS; every string via `t()` in `ar.json` and
`en.json`; Arabic JSDoc on domain and ports; files under 400 lines, functions under 60; `.server.ts`
imported dynamically inside handlers; every query through `withUser()`. Verify each screen at 375,
768 and 1280 px, light and dark, RTL and LTR, in each style. No new dependency: `cmdk`,
`@radix-ui/react-navigation-menu`, `vaul` and the shadcn `tabs`, `sheet`, `sidebar` and `command`
components are already in the repo.

**No staging:** a merge to `main` deploys to production. Steps 1 to 4 change nothing a user can
see, so they can merge one by one. Step 5 is the visible release.

## Steps

| # | PR | Tier | Touches | Done when |
|---|---|---|---|---|
| 0 | Spec and plan | Light | This folder, `roadmap.md` | Merged. Done by the PR that adds this folder |
| 1 | Menu data for the whole product | Medium | `src/modules/permissions/ui/navigation.ts` (split by area if it passes 400 lines), `src/i18n/ar.json`, `en.json` | Each entry carries its section, sub-menu and state (`live` or `soon`), and each `soon` entry the business types and roles that see it; the roles are added to the shared source in `lolotam/PayPos.systems`, which generates the Roles column, and `app-map.md` is never edited by hand. Built pages get their place in the shared map as data only (for example discounts under Sales, attendance reports under Reports): today's groups, their order and the phone shortcuts stay what the shell renders until step 5. `visibleNavigation` filters only by `requires` and `needsRecording` today, so this step makes it drop `soon` entries explicitly. A page marked New in the map (the Approvals inbox) is `soon` until step 5 adds its route. Every page of `app-map.md` has one entry. A snapshot per role and area, taken before the change, shows the same entries in the same groups and order afterwards. Label keys exist in both languages. Nothing changes on screen |
| 2 | Style A frame | Medium | `src/modules/permissions/ui/` (new frame component and its parts) | Rendered tests: current section, tab row, pills, phone bottom bar with More, RTL. Not wired to any route |
| 3 | Style B frame | Medium | same folder | Rendered tests: wide menu open and closed, overview page, local list, phone drawer, focus kept inside and returned. Not wired |
| 4 | Style C frame | Medium | same folder | Rendered tests: rail, panel hidden and shown, page finder filters and opens a page, phone bottom tabs. Not wired |
| 4b | Workspace business type and country | Own tier card | `businessTypeSchema` in `src/modules/permissions/contracts.ts`, the company's stored business type, a country value, the session context | Its own spec first: it decides the list of business types, where the country is stored and whether a migration is needed. Not required for step 5: until it merges, spec R13 hides what the workspace cannot name, which includes the two Kuwait-only Qayd entries |
| 5 | **Release: the three styles, the style choice and Under development** | Heavy recommended: it decides who may open a direct or old address, which is an authorization change (`CLAUDE.md`); the tier card settles it | `area-shell.tsx` (picks the frame), `user-menu.tsx`, `settings-page.tsx` (becomes the Appearance page: the style choice beside the theme switch; its attendance-card policy block on `/app/settings`, the `policy` prop, stays as it is), new `soon/$page` route in each area, `contracts.ts` (`navStyle` in the session context), the `setNavStyle` server function writing the device copy only, the post-sign-in return allowlist (it accepts only exact menu destinations today), `workspace-cookie.server.ts` neighbour for the style cookie, the sign-in path (sign-out leaves the device copy in place), `docs/user-journeys/` | Spec acceptance criteria 1 to 4 and 6 to 15. Default C. The Approvals inbox under Home is a working page: it lists the kinds of approval the user may open and shows one count (spec R12), and its entry turns from `soon` to `live` in this step. Workspace limits follow spec R7 and R13, and Platform entries are not filtered by business type or company role. The choice is kept on each device, one entry per user (spec, Contract): sign-out keeps it and another user never gets it. A signed-out user who opens an Under development address returns to it after signing in. A failed approvals read shows the count as unavailable, never as zero (spec R12). Soon entries are shown by business type and role (NAV-L2), with a test per business type and per role |
| 6 | Page finder and overview polish | Light or Medium by size | frames | Anything found at 375 px in step 5 that needs its own change. Skipped if nothing is found |
| 7 | Save the choice on the account | Heavy | `db/migrations/0027_user_preferences.sql`, `db/tests/isolation.sql`, `src/modules/permissions/` (port, persistence, use case; `setNavStyle`, which exists from step 5, gains the account write), sign-in path | Spec acceptance criterion 5 and the account tests. NAV-L1 is answered: the `user_preferences` table. The step extends `setNavStyle` to write the account as well. Migration applied to production before the merge with a `pg_dump` backup and a receipt, and the PR merges only after Waleed's card (CLAUDE.md, Heavy) |

Steps 2, 3 and 4 do not depend on each other. Step 5 needs 1 to 4, not 4b. Step 7 needs 5.

Between step 5 and step 7 the choice is kept per device only. The owner accepted that order for this
project on 2026-11-21 (NAV-L9).

## Where things go

- **Menu data** stays in the `permissions` module, which already owns the shell, the workspace
  switcher and the session context. Entries keep their `requires`, `roles` and `needsRecording`
  rules untouched.
- **Frames** are UI of the `permissions` module (`src/modules/permissions/ui/`). They import shadcn
  primitives from `src/components/ui/` and nothing from other modules except what `area-shell.tsx`
  imports today.
- **The style value** reaches every area through `SessionContextDto`, which each area's route
  already loads before rendering, so the first frame is right without a boot script.
- **The style choice** is on the Appearance page of each area, which is today's Settings page
  (`src/modules/permissions/ui/settings-page.tsx`), listed in the menu as Appearance, plus the same
  control in the user menu. No new route.
- **Under development** is one component rendered by `/<area>/soon/$page`.

## Risks

| Risk | Mitigation |
|---|---|
| Step 1 changes who sees a built page | Snapshot of `visibleNavigation` per role and area, taken before the change and compared after |
| A page is added later to one style only | One list of entries and three arrangements; the step 1 test fails when an entry is missing from an arrangement |
| 17 pages under one section do not fit a phone | The full map was not prototyped. Step 5 is checked at 375 px in each style; a sub-menu may collapse behind its heading |
| A "Soon" entry promises something that is dropped or renamed | Names are working names; the task that decides removes or renames the entry, and its old address shows not-found |
| A shared reception tablet passes one person's style to the next | The device copy holds one entry per user id; sign-in reads only the entry of the user who signed in |
| A page is renamed or moved in one project only | `app-map.md` is generated from `app-map.shared.mjs` in `lolotam/PayPos.systems` (spec 074) and is not edited by hand; a change goes there first, then one docs PR in each repository |
| The release deploys to production with a visible change for every user | Step 5 lands only after the checks at three widths in both languages |
| Lovable edits the same shell files in parallel | Coordinate with the manager before steps 2 to 5; `area-shell.tsx` changes only in step 5 |

## Not verified

- The three styles were prototyped for the other project's admin pages only. Nothing in this plan
  has been prototyped with this app's pages or its four areas.
- Whether `SessionContextDto` is loaded on every route of every area before render was read from
  `area-shell.tsx` and the route folders, not traced route by route.
- The exact sign-in and sign-out hooks to extend for the cookie were not read.
