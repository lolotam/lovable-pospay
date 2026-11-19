# 016-D Implementation Plan

**Goal:** deliver `docs/specs/016d-dashboards-pages/spec.md` as two PRs: D1 dashboard charts,
D2 company page builder at `/s/$slug`.

**Executors:** Lovable implements each PR end to end (UI, server functions, SQL files, tests).
Claude Code reviews, runs `bun run test` against `pospay_test` and the SQL suites, fixes, opens the
PR and handles bots. Waleed approves and applies `0021` / `0022` in production before the matching
PR merges (autoDeploy is on: a merge to `main` deploys at once).

**Rules for every task:** Souk Tiles tokens and shell, mobile-first, logical CSS, every string via
`t()` in `ar.json` and `en.json`, Arabic JSDoc on domain/ports, files under 400 lines, functions
under 60, `.server.ts` imported dynamically inside handlers, every query through `withUser()`,
money as `bigint` mills (string in transport). Verify each screen at 375, 768 and 1280 px, light
and dark, RTL.

**Branches:** `feat/016d-dashboard-charts`, `feat/016d-page-builder`. One PR each, into `main`.

---

## D1 — dashboard charts (PR 1)

### Task 1: Migration 0021

**Files:** create `db/migrations/0021_dashboard_charts.sql`; modify `db/tests/isolation.sql`.

- [ ] `attendance_daily`, `late_leaders`, `session_daily`, `platform_growth` exactly as the spec
  "Schema changes": `language sql stable security definer set search_path=public`,
  `generate_series(_from, _to, '1 day')` left-joined so empty days return zeros, each guarded by
  `report_reader(_company, _branch)` (or `is_super_admin()`), `revoke`/`grant` lines,
  `create or replace` so it runs twice.
- [ ] Isolation: owner of A calling with company B → 0 rows; staff without `reports.view` → 0.
- [ ] Claude Code: apply twice on `pospay_test`, run the SQL suites.

### Task 2: Contracts and domain

**Files:** modify `src/modules/permissions/contracts.ts`; create
`src/modules/permissions/domain/chart-range.ts` and `chart-range.test.ts`.

- [ ] Add `chartRangeSchema`, `attendanceDaySchema`, `companyChartsSchema` from the spec.
- [ ] `rangeDates(range, today)` → `{ from, to }` inclusive local dates; `parseRange(search)`
  defaults to 14 for anything not 7/14/30.
- [ ] Tests with `test.each` for 7/14/30, invalid input → 14, month boundary.

### Task 3: Persistence, use cases, server functions

**Files:** create `src/modules/permissions/persistence/charts.server.ts`,
`src/modules/permissions/use-cases/load-company-charts.ts` (+ test),
`src/modules/permissions/functions/charts.functions.ts` (+ test).

- [ ] Reads call the SQL functions only; the branch comes from `companyOverviewScope`.
- [ ] `sessions` is `null` unless `serviceSessionRecordingAvailable`.
- [ ] `getCompanyChartsFn`, `getMyAttendanceStripFn`, `getPlatformGrowthFn`; `FORBIDDEN` when the
  SQL guard returns nothing for a caller without access.
- [ ] Integration test on `pospay_test`: 14 rows with zero padding; branch manager scope;
  revenue sums stay exact as strings.

### Task 4: Chart components and dashboards

**Files:** create `src/modules/permissions/ui/charts/attendance-chart.tsx`,
`late-trend-chart.tsx`, `late-leaders.tsx`, `my-attendance-strip.tsx`, `growth-chart.tsx`,
`chart-card.tsx`, `range-picker.tsx` and tests; modify `src/modules/permissions/ui/dashboard.tsx`,
`overview.tsx`, `src/routes/app/index.tsx`, `src/routes/me/index.tsx`,
`src/routes/admin/index.tsx`, i18n files.

- [ ] Use the existing `src/components/ui/chart.tsx` (Recharts 2). Colors from the existing
  `--chart-1..5` tokens in `src/styles.css` (light and dark); never a hard-coded color.
- [ ] `ChartCard`: title, range picker, loading keeps the last data, empty state with a link.
- [ ] Layout: phone one column, tablet 2 columns, desktop 3 columns under the existing stat cards.
  Legends below the chart under 768 px. `late-leaders` renders as a list under 768 px.
- [ ] Accessibility: each chart has a visually hidden table of the same numbers.
- [ ] Route search `range` validated with `chartRangeSchema` (default 14).
- [ ] Tests: 14 bars from a fixture; empty state; charts hidden without `reports.view`; session
  chart hidden while recording is unavailable.

### Task 5: Close D1

- [ ] `roadmap.md` line; verification notes with the 3 viewport checks; PR body lists `0021`.

---

## D2 — page builder (PR 2)

### Task 6: Migration 0022

**Files:** create `db/migrations/0022_company_pages.sql`; modify `db/tests/isolation.sql`.

- [ ] `company_pages` table, RLS owner-only select/insert/update, grants to `pospay_app`
  (no delete), reserved-slug check, `public_company_page(_slug)` and `slug_available(_slug)`
  security definer functions as the spec says, `create ... if not exists` / `create or replace`.
- [ ] `public_company_page` joins live `service_catalog` rows that are active for the
  `services` block and returns prices as text mills.
- [ ] Isolation cases from the spec.

### Task 6b: R2 page images (Waleed 2026-11-19)

- Implement fetch-based S3 storage with `aws4fetch` in `object-storage.server.ts`.
- Extend 0022 with owner-only asset RLS, public published-reference lookup, and isolation cases.
- Add image signature/limit/reference rules and tests; serialize asset writes and page saves
  per company in `withUser()` to prevent quota/reference races. Compensate failed uploads.
- Add owner upload/list/delete functions and `/media/$assetId`, without presigned URLs.
- Wire image library, bilingual alt fields, logo/hero selection and six-image galleries into
  editor and shared public preview. Hide controls when storage is disabled.
- Run serial non-SQL tests, lint, responsive fixture checks; DB/RLS and real R2 acceptance
  remain with Claude Code. Do not execute SQL or change environment/production resources.

### Task 7: Pages module domain and contracts

**Files:** create `src/modules/pages/contracts.ts`, `index.ts`, `domain/page-document.ts`,
`domain/page-document.test.ts`, `domain/slug.ts`, `domain/slug.test.ts`.

- [ ] Schemas from the spec; `RESERVED_SLUGS`; `normalizeSlug(input)` lowercases and trims.
- [ ] `moveBlock(doc, id, direction)`, `toggleBlock`, `addBlock(type)` with default empty text,
  `visibleBlocks(doc)`; `assertPublishable(doc)` throws `PAGE_EMPTY`.
- [ ] Tests: reserved slugs and length bounds with `test.each`; move up at index 0 is a no-op;
  13th block refused.

### Task 8: Persistence, use cases, server functions

**Files:** create `src/modules/pages/persistence/page.server.ts`, `use-cases/save-draft.ts`,
`use-cases/publish-page.ts` (+ tests), `functions/page.functions.ts` (+ test).

- [ ] Save: `update ... set draft=$doc, slug=$slug, version=version+1 where company_id=$1 and
  version=$expected` (insert on first save); 0 rows → `PAGE_CONFLICT`; unique violation →
  `SLUG_TAKEN`.
- [ ] Publish copies `draft` to `published`, sets `published_at`; unpublish sets both null.
- [ ] `getPublicPageFn` uses `withUser("")` and `public_company_page`.
- [ ] Each owner write inserts an `audit_log` row (`page.saved`, `page.published`,
  `page.unpublished`).
- [ ] Integration tests from the spec.

### Task 9: Editor

**Files:** create `src/routes/app/page.tsx`, `src/modules/pages/ui/page-editor.tsx`,
`block-editor.tsx`, `block-list.tsx`, `slug-field.tsx`, `page-preview.tsx` and tests; modify
`src/modules/permissions/ui/navigation.ts` (item "company page", owner only), i18n files.

- [ ] Route `beforeLoad`: owner role only, else redirect to `/app`.
- [ ] Phone: tabs "edit" / "preview"; block list with move up/down, hide, delete; each block opens
  a sheet with its fields, Arabic and English side by side on tablet and up, stacked on phone.
  Sticky bar: save draft, publish, status (draft / published at time).
- [ ] Desktop: editor (start) + live preview (end) rendered with the same component as the public
  page.
- [ ] Slug field checks availability after 400 ms of no typing.
- [ ] Tests: add/hide/reorder updates the preview; publish disabled with no visible block;
  `PAGE_CONFLICT` reloads.

### Task 10: Public page

**Files:** replace `src/routes/s/$slug.tsx`; create `src/modules/pages/ui/public-page.tsx`,
`blocks/*.tsx` and tests.

- [ ] Loader calls `getPublicPageFn`; null → `notFound()` (existing not-found with `noindex`).
- [ ] `head()` from the hero: title, description, `og:*`, canonical, `robots: index` only when
  published.
- [ ] Blocks render as text only (React escaping, no `dangerouslySetInnerHTML`). WhatsApp links
  `https://wa.me/<number>?text=<encoded message>`; map links open in a new tab with
  `rel="noopener noreferrer"`.
- [ ] Language toggle `?lang=en`, Arabic default, empty English falls back to Arabic, `dir`
  follows the language.
- [ ] Mobile-first layout, no app shell, Souk Tiles tokens; Lighthouse ≥ 90 / ≥ 95 at 375 px.
- [ ] Tests: renders blocks in order; hidden blocks absent; `<script>` text shows literally;
  English fallback.

### Task 11: Close D2

- [ ] `roadmap.md` line; verification notes; PR body lists `0022` and the open questions.

---

## Gates per PR (Claude Code)

`node_modules/.bin/tsc.exe --noEmit -p .`, `npx eslint .` (0 errors),
`POSPAY_TEST_DATABASE_URL=... bun run test`, SQL suites via `docker exec -i pospay-016-verify psql`,
`NITRO_PRESET=node-server bun run build`, then PR, CI and bot review on the final head.
