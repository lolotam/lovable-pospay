# 016 — app structure: landing, workspaces, role areas and navigation

Approved by Waleed on 2026-11-18 (Kuwait). Depends on PR #7 (routes `/discounts`, invitations backend).

## Requirement

Today every visitor sees one sidebar with every page, sign-in returns to a static home page, and
nothing shows that the user is signed in. The app needs a clear structure:

1. A public landing page with one sign-in button.
2. After sign-in, the user lands in a **workspace** (one company + one role, or the platform).
3. Four separate areas, each with its own layout and sidebar:
   super admin (`/admin`), company management (`/app`), reception (`/pos`), staff (`/me`).
4. A workspace switcher, the signed-in user's name and a sign-out button in every area.
5. A reserved public path for the later page builder.

Salon example: Mona owns a salon, works as staff in a restaurant and manages a laundry branch.
She signs in once, picks "Salon — owner", and can switch to "Laundry — branch manager" from the
sidebar without signing in again.

## Business rules

- **R1 (PRD §3, D-46).** One account may hold several memberships across companies and several
  roles in one company. Each membership row is one workspace. A platform admin
  (`platform_admins`) has one extra workspace: "Platform".
- **R2.** After sign-in: zero workspaces → `/workspaces` with an explanatory empty state;
  exactly one → enter it directly; more than one → `/workspaces` chooser. The last chosen
  workspace is remembered and re-entered on the next sign-in if it still exists.
- **R3.** Area per role:

  | Workspace role | Home | Area |
  |---|---|---|
  | platform admin | `/admin` | `/admin/*` |
  | `owner`, `branch_manager`, `accountant`, `viewer` | `/app` | `/app/*` |
  | `reception` | `/pos` | `/pos/*` |
  | `staff` | `/me` | `/me/*` |

- **R4 (D-31, D-46).** Permissions = role defaults + per-person `allow`/`deny` rows in
  `permission_overrides`; a `deny` always wins. Only the owner edits overrides.
  Default matrix (✓ = granted by default):

  | Permission key | owner | branch_manager | reception | staff | accountant | viewer |
  |---|---|---|---|---|---|---|
  | `pos.access` | ✓ | — | ✓ | — | — | — |
  | `reports.view` | ✓ | ✓ | — | — | ✓ | ✓ |
  | `attendance.correct` | ✓ | ✓ | — | — | — | — |
  | `staff.manage` | ✓ | ✓ | — | — | — | — |
  | `services.manage` | ✓ | ✓ | — | — | — | — |
  | `discounts.manage` | ✓ | ✓ | — | — | — | — |
  | `permissions.manage` | ✓ | — | — | — | — | — |

  The owner is never affected by overrides. The branch manager opens `/pos` only when the owner
  grants `pos.access` to that person.
- **R5.** A branch manager with `memberships.branch_id` set sees data for that branch only;
  existing RLS already scopes writes, the dashboard cards follow the same scope.
- **R6 (PRD §2, §14).** Sales, payment, invoices and the cash drawer stay out of Phase 1. In this
  slice `/pos` is the reception workspace: attendance QR, card scanning and session recording
  (still gated by `serviceSessionRecordingAvailable`, D-44).
- **R7.** Staff sign in with email and password (existing). Sign-in with the bound phone passkey
  is a later slice (016-C); this slice only keeps `/me/phone` for binding.
- **R8.** `companies.business_type` (`salon`, `restaurant`, `laundry`, `other`) is display-only:
  it labels the workspace card. No behaviour depends on it.
- **R9.** `/s/$slug` is reserved for the public company page (page builder, later phase). It
  renders the not-found page for now.

## Route map

Old paths redirect (HTTP 307 on the server, `redirect()` in the router) to the new ones.

| New path | Old path | Sidebar group › item | Required |
|---|---|---|---|
| `/` | `/` | — (public landing) | — |
| `/sign-in`, `/reset-password` | same | — | — |
| `/workspaces` | — | — | signed in |
| `/admin` | — | Platform › Dashboard | platform admin |
| `/admin/connectors` | same | Platform › Connectors | platform admin |
| `/admin/diagnose` | same | Platform › Diagnose | platform admin |
| `/app` | — | Dashboard | `/app` role |
| `/app/attendance/reports` | `/reports` | Attendance › Reports | `reports.view` |
| `/app/attendance/corrections` | `/attendance-corrections` | Attendance › Corrections | `attendance.correct` |
| `/app/attendance/questions` | `/attendance-questions` | Attendance › Questions | `reports.view` |
| `/app/staff/cards` | `/cards` | Staff › Cards | `staff.manage` |
| `/app/staff/phones` | `/phone` (manager part) | Staff › Phones | `staff.manage` |
| `/app/services` | `/services` | Services › Catalog | `services.manage` |
| `/app/services/discounts` | `/discounts` | Services › Discounts | `discounts.manage` |
| `/app/settings` | `/settings` | Settings | `/app` role |
| `/pos` | — | Reception home | `pos.access` |
| `/pos/qr` | `/reception/qr` | Attendance QR | `pos.access` |
| `/pos/cards` | `/reception/cards` | Card scan | `pos.access` |
| `/pos/sessions` | `/sessions` | Sessions | `pos.access` + recording gate |
| `/me` | — | My dashboard | `staff` role |
| `/me/attend` | `/attend` | Check in / out | `staff` role |
| `/me/phone` | `/phone` (staff part) | My phone | `staff` role |
| `/me/settings`, `/pos/settings`, `/admin/settings` | `/settings` | Settings | area role |
| `/s/$slug` | — | — | reserved |

Sidebar rules: a group with sub-items is collapsible and opens when one of its children is
active; items the workspace cannot use are not rendered; on phones the sidebar becomes a drawer
opened from a top bar that also shows the workspace name. `/attend` keeps working as a redirect
because printed QR codes point at it.

## Dashboards in this slice

Simple cards and quick links only, no charts.

- `/admin`: number of companies, number of users, connector status summary, link to diagnose.
- `/app`: staff present today, open attendance exceptions, staff count, quick links by permission.
- `/pos`: three large buttons (QR, card scan, sessions when available).
- `/me`: today's attendance state and the check-in button, phone binding state.

## Edge cases

- Signed-out visitor opens any area path → redirect to `/sign-in?redirect=<path>`; after sign-in
  return there if the active workspace allows it, otherwise to the workspace home.
- Signed-in user opens an area the active workspace does not allow → the "no access" screen with
  a button to the workspace home. No data request is made.
- Remembered workspace no longer exists (membership removed) → cookie cleared, R2 applies again.
- The switch request names a company or role the user does not hold → `FORBIDDEN`, cookie unchanged.
- A `deny` override on a default permission hides the item and blocks the route on the next request.
- A platform admin with no company membership has exactly one workspace and lands on `/admin`.
- Signed-in user opens `/` → landing still renders, the button reads "Open dashboard".
- `redirect` query accepts same-origin relative paths only.

## Acceptance criteria

1. `pospay.systems@gmail.com` (platform admin only) signs in and lands on `/admin`; the sidebar
   shows Platform items only, the account name and a working sign-out.
2. A user with memberships `owner` in company A and `staff` in company B sees 2 cards on
   `/workspaces`; choosing A opens `/app`, switching to B opens `/me`; a new sign-in reopens B.
3. A `reception` user opening `/app/attendance/reports` gets the no-access screen and the
   reports server function is not called.
4. A `branch_manager` without overrides gets no `/pos` item and `/pos/qr` is refused; after the
   owner adds `allow pos.access`, both work; after `deny reports.view`, Reports disappears and
   `/app/attendance/reports` is refused.
5. `/reports`, `/reception/qr`, `/attend?…` redirect to their new paths with the query preserved.
6. At 390, 820 and 1280 px in light and dark mode there is no horizontal overflow and every
   sidebar item is reachable.
7. Company A's owner cannot read or write company B's `permission_overrides`
   (`db/tests/isolation.sql`).

## Schema changes

Migration `0018_app_structure.sql` (idempotent):

- `alter table public.companies add column if not exists business_type text not null default 'salon' check (business_type in ('salon','restaurant','laundry','other'))`.
- `public.has_permission(_company uuid, _permission text) returns boolean` — `security definer`,
  `search_path = public`, execute revoked from `public` and granted to `pospay_app`. Returns
  false on any `deny`; true for owner; otherwise role default or an `allow`. The default matrix
  lives in the function and is mirrored by the domain function, with a test comparing both.
- No new table: `permission_overrides` already has RLS and grants. Add its negative case to
  `db/tests/isolation.sql` if missing.
- Platform dashboard counts come from a `security definer` function guarded by `is_super_admin()`.

Existing table policies are not changed in this slice; `has_permission` is used by server
functions first and moves into policies slice by slice.

## Contract (Zod)

```ts
WorkspaceDto = { kind: "platform" } |
  { kind: "company"; companyId: string; companyName: string; businessType: BusinessType;
    role: CompanyRole; branchId: string | null; branchName: string | null }
SessionContextDto = { user: { id: string; name: string; email: string };
  workspaces: WorkspaceDto[]; active: WorkspaceDto | null; permissions: PermissionKey[] }
SelectWorkspaceInput = { kind: "platform" } | { kind: "company"; companyId: uuid; role: CompanyRole }
```

Server functions in `src/modules/permissions/functions/`: `getSessionContext()` (returns `null`
when signed out), `selectWorkspace(input)`, `signOut` stays on the Better Auth client. The active
workspace is stored in an HttpOnly, SameSite=Lax, Secure cookie `pospay-ws` and re-validated
against the database on every `getSessionContext()`.

## Permissions

- Anyone signed in: read their own session context, select one of their own workspaces.
- Owner only: read and write `permission_overrides` (management page is slice 016-C).
- Guards: each area layout route calls `getSessionContext()` in `beforeLoad` and throws
  `redirect` or renders no-access; each server function keeps its own check. RLS stays the
  final gate.

## Tests

- Domain (`permissions/domain`): default matrix per role, deny wins over allow and default,
  owner immune, area-for-role mapping, landing decision for 0/1/many workspaces, safe redirect
  path validation.
- Integration on `pospay_test`: `has_permission` equals the domain result for every role × key;
  `selectWorkspace` refuses foreign company/role; stale cookie is cleared.
- SQL: isolation case for `permission_overrides`; migration applied twice.
- UI behaviour: sidebar items for a given `SessionContextDto`; redirects for old paths.

## Delivery split

- **016-A (Lovable, frontend):** landing page, `/workspaces`, the four layouts with sidebars,
  sub-menus, mobile drawer, switcher, user menu and sign-out, moving existing pages to the new
  paths, redirects, dashboard shells, i18n keys. Reads a typed `SessionContextDto`.
- **016-B (backend):** migration 0018, `permissions` module (domain, use cases, persistence,
  functions), route guards, tests, production migration after approval.
- **016-C (later):** `/app/permissions` management page, staff passkey sign-in, real dashboard data
  beyond the cards above, invitation acceptance page.

## Open questions

None. D-07 role names remain provisional in the PRD and are used as they exist in `company_role`.
