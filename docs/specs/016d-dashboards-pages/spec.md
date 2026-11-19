# 016-D — dashboards: charts on the role dashboards, public company page builder at `/s/$slug`

## Requirement

Two parts, delivered as two PRs:

- **D1. Dashboard charts.** The `/app`, `/me` and `/admin` dashboards gain small charts built
  from data PosPay already records. Spec 016 shipped cards and quick links only ("no charts").
- **D2. Page builder.** The owner builds one public page for the company from ready blocks and
  publishes it at `/s/<slug>`. Today `/s/$slug` is reserved and renders not-found (spec 016 R9).

Both follow Souk Tiles and are fully responsive at 375, 768 and 1280 px, light and dark, RTL.

## Business rules

### D1 charts

- **C1.** Charts read only existing tables: `attendance_records`, `staff_members`,
  `service_sessions`, `companies`, `"user"`. No new table.
- **C2.** Time zone: days are the branch's local date (`attendance_records.work_date`;
  for sessions `(occurred_at at time zone branches.timezone)::date`).
- **C3.** Branch scope follows `overviewBranchScope` (spec 016 R5): a branch manager tied to a
  branch sees that branch only; owner, accountant and viewer see all branches.
- **C4.** `/app` charts need `reports.view` (and SQL `report_reader`). Without it the dashboard
  shows the existing cards only.
- **C5.** Session charts appear only while `serviceSessionRecordingAvailable` is true (D-44).
  Today it is false, so D1 ships the attendance charts and keeps the session charts hidden.
- **C6.** Money is `bigint` mills on the server and is formatted with the company currency on
  the client. Never float in SQL or in transport (send as string).
- **C7.** Range selector: 7, 14 or 30 days, default 14, kept in the URL search
  (`?range=14`). Days with no data appear as 0, not as gaps.

Charts per dashboard:

| Dashboard | Chart | Data |
|---|---|---|
| `/app` | Attendance per day (stacked bars: on time, late, forgotten) | `attendance_records` by `work_date`, `status`, `late_minutes > 0` |
| `/app` | Average late minutes per day (line) | `avg(late_minutes) filter (where late_minutes > 0)` |
| `/app` | Top 5 latest staff in the range (horizontal bars) | `sum(late_minutes)` by staff |
| `/app` (C5) | Sessions and revenue per day (bars + line) | `service_sessions` count and `sum(price_mills)` |
| `/me` | My last 30 days (calendar strip: present, late, absent day) | own `attendance_records` |
| `/admin` | New companies and new users per week, last 12 weeks (line) | `companies.created_at`, `"user"."createdAt"` |

### D2 page builder

- **P1.** One page per company. Only the owner edits and publishes it.
- **P2.** Slug: lowercase `a-z`, `0-9` and `-`, 3 to 40 characters, unique across all
  companies, not in the reserved list (`admin`, `app`, `pos`, `me`, `api`, `s`, `sign-in`,
  `invite`, `pospay`, `www`). Changing the slug frees the old one; the old URL then shows
  not-found.
- **P3.** Blocks, in an order the owner chooses (move up / move down), each can be hidden:
  `hero` (title, subtitle), `about` (text up to 1,000 characters), `services` (pulled live from
  `service_catalog`, active items only, name and price; the owner picks "show prices" yes/no),
  `branches` (name, address text, opening hours text, map link), `contact` (WhatsApp number,
  phone, Instagram handle), `cta` (button label + WhatsApp message), `gallery` (up to 6 images
  with alt text). The `hero` also takes an optional background image, and the page an optional
  logo. At most 12 blocks per page. All text is plain text; no HTML is stored or rendered.
- **P4.** Two languages: every text field has `ar` and `en`; the public page shows Arabic by
  default with a toggle; an empty English field falls back to Arabic.
- **P5.** Draft and published: edits save to `draft`; "publish" copies draft to `published`.
  The public route reads `published` only. "Unpublish" makes `/s/<slug>` show not-found again.
- **P6 (Waleed, 2026-11-19).** Images are stored in Cloudflare R2 through its S3 API.
  - Configuration comes from env only: `STORAGE_ENDPOINT`, `STORAGE_REGION` (`auto`),
    `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` (same names as the
    staging stack). Values live in Dokploy, never in the repo or in browser code.
  - Production uses its own bucket (`pospay-production`), not `pospay-staging`. Until it is
    configured, upload controls are hidden when `STORAGE_BUCKET` is unset (feature off, the page
    still works without images).
  - Upload goes browser -> server function -> R2 (no presigned URL, no bucket CORS). Only the
    owner uploads. Accepted: PNG, JPEG, WebP, checked by magic bytes, not by file name; max
    2 MB per file; max 20 stored images per company.
  - Object key: `companies/<company_id>/pages/<uuid>.<ext>`. The browser never chooses the key.
  - Every upload is a row in `company_assets`; a page document may only reference asset ids of
    its own company, checked on save.
  - Images are served by the app at `/media/<asset_id>`: the server reads R2 and streams the
    bytes with the stored content type, `Cache-Control: public, max-age=31536000, immutable`
    and `X-Content-Type-Options: nosniff`. Only assets referenced by a published page, or
    requested by the owner in the editor, are served; anything else returns 404.
  - Deleting an image removes the R2 object and the row; an image still used by the draft or the
    published page cannot be deleted (`ASSET_IN_USE`).
- **P7.** The public page is server-rendered, has `<title>`, description, `og:*` from the hero,
  `robots: index` only while published, and a canonical URL `https://app2.pospay.systems/s/<slug>`.
- **P8.** The public read goes through a `security definer` SQL function that returns only the
  published JSON for one slug; anonymous visitors never touch tenant tables directly.

## Edge cases

- D1: a company with no attendance in the range → each chart shows an empty state with a link to
  `/app/attendance/reports`, not an empty axis.
- D1: a branch manager with `reports.view` denied → no charts, existing cards stay.
- D1: range changes keep the previous chart visible while loading (no layout jump).
- D1: very small phones (360 px) → charts stack in one column, legends move under the chart,
  bars stay at least 8 px wide; the top-5 list becomes a list, not bars.
- D2: slug already taken → inline error `SLUG_TAKEN` while typing (debounced check) and on save.
- D2: a service removed from the catalog disappears from the public page at the next request.
- D2: publish with zero visible blocks → refused with `PAGE_EMPTY`.
- D2: two owners editing at once → save carries `version`; a stale version gets `PAGE_CONFLICT`
  and the editor reloads.
- D2: unknown slug, unpublished page, or a deleted company → the existing not-found page with
  `robots: noindex`.

## Acceptance criteria (concrete numbers)

1. `/app` for an owner with 10 attendance records over 14 days shows 14 bars, the sums per day
   match `/app/attendance/reports` for the same range.
2. A branch manager tied to branch A sees only branch A in every `/app` chart.
3. Switching range 14 → 30 changes the URL to `?range=30` and the chart to 30 bars.
4. `/me` shows 30 cells for the signed-in staff member only.
5. `/admin` shows 12 weekly points; a non-admin calling its server function gets `FORBIDDEN`.
6. All charts render at 375, 768 and 1280 px without horizontal scroll, in light and dark.
7. The owner creates a page with slug `glow-salon`, adds hero + services + contact, publishes;
   an anonymous visitor at `/s/glow-salon` sees the three blocks in that order with live prices.
8. Unpublish → `/s/glow-salon` returns the not-found page with `noindex`.
9. A `branch_manager` cannot open the editor or call the save or publish functions.
10. Lighthouse on the public page at 375 px: performance ≥ 90, accessibility ≥ 95.

## Schema changes (tables, RLS, grants, isolation test)

D1, migration `db/migrations/0021_dashboard_charts.sql` (functions only):

- `public.attendance_daily(_company uuid, _branch uuid, _from date, _to date)` returns
  `table(day date, on_time int, late int, forgotten int, avg_late numeric)`; `security definer`,
  checks `report_reader(_company, _branch)`, returns every day in the range with zeros.
- `public.late_leaders(_company uuid, _branch uuid, _from date, _to date)` returns top 5
  `(staff_id uuid, name text, late_minutes bigint)`, same check.
- `public.session_daily(...)` returns `(day date, sessions int, revenue_mills bigint)`, same
  check (used only when C5 allows).
- `public.platform_growth(_weeks int)` returns `(week date, companies bigint, users bigint)`
  only when `is_super_admin()`.
- All: `revoke all ... from public; grant execute ... to pospay_app;`.

D2, migration `db/migrations/0022_company_pages.sql`:

```sql
create table if not exists public.company_pages (
  company_id uuid primary key references public.companies(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  draft jsonb not null default '{"blocks":[]}'::jsonb,
  published jsonb,
  published_at timestamptz,
  version integer not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
```

- RLS: select/insert/update only `has_company_role(company_id,'owner')`; no delete grant.
- `company_assets` table: `company_id uuid`, `id uuid default gen_random_uuid()`,
  `object_key text not null unique`, `content_type text` (png, jpeg or webp),
  `byte_size integer check (byte_size between 1 and 2097152)`, `alt jsonb`, `created_by text`,
  `created_at timestamptz`; primary key `(company_id, id)`; RLS owner-only select, insert and
  delete; grants to `pospay_app`; isolation cases like `company_pages`.
- `public.public_asset(_id uuid)` returns `(object_key, content_type)` only when the asset is
  referenced by a published page (security definer, used by `/media/<id>`).
- `public.public_company_page(_slug text)` returns `jsonb` (`published` plus company name and
  live active services), `security definer`, granted to `pospay_app`; returns null when not
  published.
- `public.slug_available(_slug text)` returns boolean for the owner editor.
- Reserved slugs are checked in SQL too (`check (slug <> all (array[...]))`).
- `db/tests/isolation.sql`: owner of A cannot read or update B's row; a branch manager of A
  cannot read A's draft; `public_company_page` returns null for an unpublished page.

## Contract (Zod input/output)

D1 in `src/modules/permissions/contracts.ts` (dashboard owns it):

```ts
export const chartRangeSchema = z.union([z.literal(7), z.literal(14), z.literal(30)]);
export const attendanceDaySchema = z.object({
  day: z.iso.date(), onTime: z.number().int(), late: z.number().int(),
  forgotten: z.number().int(), avgLate: z.number().nullable(),
});
export const companyChartsSchema = z.object({
  attendance: z.array(attendanceDaySchema),
  lateLeaders: z.array(z.object({ staffId: z.uuid(), name: z.string(), lateMinutes: z.number().int() })),
  sessions: z.array(z.object({ day: z.iso.date(), sessions: z.number().int(), revenueMills: z.string() })).nullable(),
});
```

D2 in a new module `src/modules/pages/contracts.ts`:

```ts
const text = (max: number) => z.object({ ar: z.string().max(max), en: z.string().max(max) });
export const pageBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.uuid(), type: z.literal("hero"), hidden: z.boolean(), title: text(80), subtitle: text(160) }),
  z.object({ id: z.uuid(), type: z.literal("about"), hidden: z.boolean(), body: text(1000) }),
  z.object({ id: z.uuid(), type: z.literal("services"), hidden: z.boolean(), showPrices: z.boolean() }),
  z.object({ id: z.uuid(), type: z.literal("branches"), hidden: z.boolean(), items: z.array(z.object({
    name: text(80), address: text(200), hours: text(200), mapUrl: z.url().startsWith("https://").or(z.literal("")),
  })).max(10) }),
  z.object({ id: z.uuid(), type: z.literal("contact"), hidden: z.boolean(),
    whatsapp: z.string().regex(/^[0-9]{8,15}$/).or(z.literal("")),
    phone: z.string().regex(/^[0-9]{8,15}$/).or(z.literal("")),
    instagram: z.string().regex(/^[A-Za-z0-9._]{0,30}$/) }),
  z.object({ id: z.uuid(), type: z.literal("cta"), hidden: z.boolean(), label: text(40), message: text(200) }),
  z.object({ id: z.uuid(), type: z.literal("gallery"), hidden: z.boolean(), images: z.array(z.object({
    assetId: z.uuid(), alt: text(120) })).max(6) }),
]);
export const pageDocumentSchema = z.object({
  logoAssetId: z.uuid().nullable(),
  heroImageAssetId: z.uuid().nullable(),
  blocks: z.array(pageBlockSchema).max(12),
});
export const slugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/);
```

Server functions: `getCompanyChartsFn({ companyId, range })`, `getMyAttendanceStripFn()`,
`getPlatformGrowthFn()`; `getPageDraftFn`, `savePageDraftFn({ slug, document, version })`,
`checkSlugFn({ slug })`, `publishPageFn({ version })`, `unpublishPageFn()`,
`getPublicPageFn({ slug })` (no session needed), `uploadPageImageFn(FormData)`,
`listPageImagesFn()`, `deletePageImageFn({ assetId })`; server route `/media/$assetId`.

## Permissions (who can, who cannot)

| Action | owner | branch_manager | accountant / viewer | staff | platform admin | anonymous |
|---|---|---|---|---|---|---|
| `/app` charts | ✓ | ✓ own branch, needs `reports.view` | ✓ | — | — | — |
| `/me` strip | own | own | own | ✓ own | — | — |
| `/admin` growth | — | — | — | — | ✓ | — |
| Edit / publish page | ✓ | — | — | — | — | — |
| View published page | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Tests

- D1 SQL on `pospay_test`: `attendance_daily` returns 14 rows with zeros on empty days; branch
  scope; `report_reader` refusal; `platform_growth` refused for non-admin; migration twice.
- D1 domain: range parsing and padding; mills string formatting.
- D1 UI: chart renders the right number of bars from a fixture; empty state; hidden when
  `reports.view` is missing; session chart hidden while C5 is false.
- D2 domain: slug validation including reserved words (`test.each`); block schema rejects
  over-length fields and a 13th block; text renders as text (an `<script>` string shows
  literally).
- D2 integration: owner saves draft, publishes, anonymous `public_company_page` returns it;
  stale `version` → `PAGE_CONFLICT`; `SLUG_TAKEN`; cross-company and branch-manager refusals.
- D2 storage: R2 client mocked at the boundary; a `.png` name with JPEG bytes is stored as
  JPEG, a `.png` name with HTML bytes is refused; 2 MB + 1 byte refused; 21st image refused;
  saving a document with another company's asset id refused; `/media/<id>` returns 404 for an
  asset not on a published page; deleting an in-use image returns `ASSET_IN_USE`.
- D2 UI: editor adds, hides and reorders blocks; preview equals the public render; public page
  falls back to Arabic for an empty English field.

## Open questions → owner-questions.ar.md

Defaults below apply unless Waleed changes them:

1. The public company page is not listed in PRD Phase 1 scope (§2). This spec treats it as an
   approved Phase 1 addition on Waleed's request (2026-11-19).
2. Images: Cloudflare R2 (decided 2026-11-19, P6). Waleed creates the `pospay-production`
   bucket and an API token scoped to it, and approves adding the five `STORAGE_*` values to the
   production app in Dokploy.
3. Public pages live under `app2.pospay.systems/s/<slug>`; custom domains are a later slice.
