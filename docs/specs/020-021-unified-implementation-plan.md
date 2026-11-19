# 020 + 021 Unified Implementation Plan

**Goal:** Deliver both specs in one cohesive implementation track so there is zero conflict across
shared files (`service_sessions`, `isolation.sql`, `navigation.ts`, `ar.json`/`en.json`):

- **Spec 020:** `docs/specs/020-session-controls/spec.md` — price surcharges with reason (Q3),
  manager approval for over-limit discounts by on-device 4-digit PIN (no lockout; every failed
  attempt logged) or by remote request approved in the app (Q1, D-44), duplicate session warning &
  confirmation (Q4), and permission-based audited session editing (`sessions.edit`, default owner &
  branch manager, grantable by owner to reception only, open anytime until the owner closes the
  month in `closed_commission_months`, Q5).
- **Spec 021:** `docs/specs/021-commissions-builder/spec.md` — multi-method commission engine
  (fixed %, fixed KWD/session, progressive brackets & `all_after` tiers by sales or session count,
  combinations), per-service & staff-service overrides (Q5; effective from the moment saved, paid
  even without a plan, written by owner or branch managers granted
  `commissions.overrides.manage`), branch-scoped effective-dated salaries
  (Q2), real `service_sessions` sales adapter, and the `/app/commissions/*` Plan Builder, Overrides
  & Salaries UI (D-35, Q7, Q8).

**Waleed decisions — 2026-11-19 (open questions):** both specs carry a section with this title
(020: approvers, no PIN lockout, remote approval, month close, client phone on rename, branch change,
`sessions.edit` roles; 021: override writers, fixed-after-N, no-plan overrides, override effective
time). The tasks below already apply them.

**Branch:** `feat/020-021-session-controls-and-commissions` from `main` — one unified PR per Waleed's
request to accelerate delivery.

**Roles & Execution Model (Waleed 2026-11-19):**
- **Spec & Plan / Coordinator:** writes and updates specs & plan, coordinates delegation, runs DB
  & verification gates, commits, opens PR.
- **Implementor (all coding tasks):** OpenCode `zai-coding-plan/glm-5.3-highspeed`
  (`variant: "high"`), delegated via `delegate_task` (does not commit).
- **Local Reviewer:** Claude Opus 5.5 (`medium`) running local review with the `code-review` and
  `debate-review` skills (multi-axis + security review against the local diff) — replaces GitHub
  review bots while bots are paused.

**Production deploy gate (CRITICAL):** AutoDeploy is on for `main`. Waleed MUST apply
`db/migrations/0025_session_controls.sql` and `db/migrations/0026_commission_methods_and_salaries.sql`
on production Postgres (with a `pg_dump` backup first) **before** merging this PR into `main`.

**Non-negotiable rules for every task (`app-architecture.md`):**
- `domain/` imports ONLY `@/shared/kernel/*` — zero React, pg, Zod runtime, or cross-module imports.
- `Date.now()`, `new Date()`, `randomUUID()` are forbidden in `domain/` **and** `use-cases/`
  (`app-architecture.md` §3): pass `now` in from the server function, as `recordSession` already does.
- Money is `bigint` mills (`Mills`); rates are `bigint` basis points (`10000n` = 100%); multiples
  are `bigint` thousandths (`1000n` = 1×). Parse decimal/percent strings with pure integer string
  math — **never** `Number(...) * 100` or floats.
- Arabic JSDoc on every export in `domain/`, `ports/`, and exported use cases.
- Files `< 400` lines, functions `< 60` lines. No closing comments, no `FIXME`, no commented-out code.
- Every UI string via `t("...")` in BOTH `src/i18n/ar.json` and `src/i18n/en.json`. Logical CSS
  only (`ms-/me-/ps-/pe-/start-/end-`, never `ml-/mr-/left-/right-`).
- `.server.ts` files live in `persistence/` and are dynamically imported inside server function
  handlers. Every SQL query runs through `withUser()`.
- Never touch `supabase/migrations/`. Never loosen or delete existing tests — rewrite only tests
  whose intended behavior explicitly changed (e.g., `PRICE_ABOVE_LIST` → Q3 surcharge allowed with
  reason).

---

## Execution Overview (Dependency Graph)

```text
Phase 1: Migrations 0025 & 0026 + isolation.sql  (DB foundation)
   ├── Phase 2A (Services / 020): Contracts → Domain → Ports & Use Cases → Persistence & Int. Tests → Server Fns
   ├── Phase 2B (Commissions / 021): Contracts → Domain → Ports & Use Cases → Persistence & Int. Tests → Server Fns
   └── (2A and 2B touch completely disjoint module folders and can run in parallel!)
Phase 3: Navigation, Routes, UI Screens & Component Tests (020 + 021) + i18n (ar/en)
Phase 4: Full Verification Gates (SQL double-apply, isolation, vitest + PG, tsc, eslint, node-server build) + User Journey Doc
```

---

## Phase 1: Database Migrations & Negative Isolation Tests

### Task 1.1 — Migration `0025_session_controls.sql`
**File:** create `db/migrations/0025_session_controls.sql` (fully idempotent).

- [ ] Tables & columns:
  - `public.manager_pins(company_id, user_id, pin_hash, updated_at)` (no attempt counter, no lock)
    — `revoke all from public, pospay_app`, `enable row level security` (no permissive policy).
  - `public.manager_pin_attempts(company_id, id, branch_id, session_id, approver_user_id, requested_by, user_agent, attempted_at)`
    — append-only log of wrong PINs; `grant select` only; RLS `select` for owner or
    `discount_approver(company_id, branch_id, current_app_user())`.
  - `public.discount_approval_requests(company_id, id, branch_id, session_id, service_id, list_price_mills, requested_price_mills, discount_reason, requested_by, created_at, expires_at, status, decided_by, decided_at, approval_id)`
    — `grant select` only; RLS `select` for `requested_by = current_app_user()` or
    `discount_approver(company_id, branch_id, current_app_user())` (Spec 020 schema).
  - `public.discount_approvals(company_id, id, branch_id, session_id, service_id, list_price_mills, approved_price_mills, approver_user_id, requested_by, created_at, expires_at, consumed_at, source, request_id)`
    — `revoke all from public, pospay_app`, `grant select to pospay_app`, RLS `select` for
    `discount_manager(company_id) or requested_by = current_app_user()`.
  - `alter table public.service_sessions` add `approved_by`, `approved_at`, `approval_id` (FK to
    `discount_approvals`), `updated_at`, `updated_by`; index `service_sessions_duplicate_check`;
    partial unique index `service_sessions_approval_once (company_id, approval_id) where approval_id
    is not null` (DB-enforced single use).
  - `public.closed_commission_months(company_id, period_month, closed_by, closed_at, note)`
    — append-only (`grant select, insert` only), RLS `select` for `is_member(company_id)`, RLS
    `insert` for `has_company_role(company_id, 'owner') and closed_by = current_app_user()`.
  - Update `public.role_default_permission`: `create or replace` restating the whole 0018 `case`
    (`db/migrations/0018_app_structure.sql`) and adding `'sessions.edit'` to the `branch_manager`
    list only (`owner` already returns `true`; other roles default `false` and can be granted
    `allow` via `permission_overrides`).
  - `public.service_session_edits(company_id, id, session_id, edited_by, edited_at, edit_reason, before_snapshot, after_snapshot)`
    — `grant select` only to `pospay_app`, RLS `select` via the security-definer helper
    `session_edits_visible(company_id, session_id)` (the table has no `branch_id`, and a plain
    subquery on `service_sessions` would be filtered by `sessions_report`).
- [ ] Security-definer functions (`revoke all from public`, `grant execute to pospay_app`):
  - `discount_approver(_company, _branch, _user)`
  - `session_editor(_company, _branch)` (`owner`, OR `has_permission(_company, 'sessions.edit')`
    with a `branch_manager` or `reception` membership covering `_branch`)
  - `month_close_status(_company, _period_month)` (days remaining across branches, owner only)
  - `is_month_closed(_company, _branch, _at)` (checks branch-local calendar month in
    `closed_commission_months`)
  - `valid_discount_approval(_company, _approval, _branch, _session, _service, _list_price, _price, _approver, _approved_at)`
  - `has_manager_pin(_company)`
  - `set_manager_pin(_company, _pin)` (`set search_path = public, extensions, pg_catalog`, bcrypt
    `crypt(_pin, gen_salt('bf', 10))`, audit `manager_pin.set`, never logs PIN)
  - `list_branch_approvers(_company, _branch)` (only approvers that have a PIN)
  - `verify_manager_pin_approval(_company, _branch, _session_id, _service_id, _list_price_mills, _price_mills, _approver, _pin, _user_agent)`
    (authorises caller and approver first — Spec 020 Rule B3; no lockout; a wrong PIN inserts
    `manager_pin_attempts` + audit `manager_pin.failed` and returns `invalid` without raising so
    `withUser()` commits it; a match creates a single-use `discount_approvals` row, `source = 'pin'`)
  - `request_discount_approval(...)`, `decide_discount_approval(_company, _request_id, _approve)`,
    `list_pending_discount_approvals(_company)` (Spec 020 Rule B4; approve creates a
    `discount_approvals` row with `source = 'remote'`, valid 5 minutes)
  - `consume_discount_approval(_company, _approval_id)` (requester only, session row must exist)
  - `has_similar_session(_company, _branch, _service_id, _staff_id, _client_phone, _occurred_at, _exclude_id)`
  - `list_editable_sessions(_company, _from, _until, _limit)` (sessions in branches where caller
    satisfies `session_editor`, masked phone `right(c.phone, 3)`, `month_closed`, `can_edit`,
    `edit_count`)
  - `update_recorded_session(...)` (`FOR UPDATE`, validates `session_editor` on old & new branches,
    blocks edits if old OR new branch-local month is closed with `PERIOD_CLOSED`, checks
    assignment/price/approval, appends `service_session_edits` with no raw phone, updates editable
    columns, writes `audit_log` `session.edited`; resolves the client itself because
    `upsert_session_client` requires `session_writer`).
  - `session_edits_visible(_company, _session)` (RLS helper for `service_session_edits`).
- [ ] Replace RLS policy `sessions_insert` on `public.service_sessions` exactly as listed in Spec 020
  "Updated RLS policy `sessions_insert`": restate every 0014 predicate except
  `price_mills <= list_price_mills`, block inserts into closed months via
  `not public.is_month_closed(company_id, branch_id, occurred_at)`, require `updated_*` null,
  require the three approval columns to be all null or all non-null and backed by
  `valid_discount_approval(...)`, and allow price ≥ list, OR within `discount_cap`, OR an approved
  over-limit price. Confirm `pospay_app` has NO `UPDATE` grant on `service_sessions`, and no write
  grant on `discount_approvals`, `discount_approval_requests` or `manager_pin_attempts`.

### Task 1.2 — Migration `0026_commission_methods_and_salaries.sql`
**File:** create `db/migrations/0026_commission_methods_and_salaries.sql` (fully idempotent).

- [ ] Alter `public.commission_plan_versions`:
  - Add `base_fixed_mills bigint check (base_fixed_mills > 0)` and
    `tier_accumulator text check (tier_accumulator in ('sales_amount', 'session_count'))`.
  - Drop the 4 anonymous 0024 table checks with a `pg_constraint` loop (`contype = 'c'`,
    `conname ~ '^commission_plan_versions_check[0-9]*$'`), exactly as Spec 021 schema says.
  - Backfill existing `tier_mode is not null` rows to `tier_accumulator = 'sales_amount'`.
  - Add named constraints: `commission_plan_versions_has_rule`,
    `commission_plan_versions_tier_pair`, `commission_plan_versions_session_excess`.
- [ ] Create `public.commission_plan_tiers` (append-only, `tier_order 1..20`, `rate_bp` XOR
  `fixed_mills`, exactly one of `threshold_mills` / `threshold_salary_multiple_milli` /
  `threshold_session_count`, `fixed_mills` only for `threshold_session_count`), idempotent backfill
  from pre-0026 single-tier versions, `grant select, insert` only, RLS `commission_plan_manager` (insert also requires the parent version to be created in the same transaction, Spec 021 schema).
- [ ] Create `public.service_commission_overrides` (append-only, `rate_bp` `0..10000` /
  `fixed_mills >= 0` / `'clear'`, `effective_from timestamptz default clock_timestamp()` set by the
  database, `staff_id` nullable), `grant select, insert` only. RLS `select`:
  `commission_plan_manager` for service-wide, `commission_plan_assigner` for staff-specific. RLS
  `insert`: `created_by = current_app_user()`, `effective_from between now() and clock_timestamp()`,
  and the new helpers `commission_override_manager(_company)` (service-wide) /
  `commission_staff_override_manager(_company, _staff)` (staff), which require owner or a branch
  manager holding `commissions.overrides.manage` (Spec 021 Rule O4).
- [ ] Create `public.staff_salaries` (append-only, `salary_mills > 0`, `effective_date`,
  `recorded_by`, `recorded_at = clock_timestamp()`), helper `public.salary_manager(_company,
  _staff)`, `grant select, insert` only, branch-scoped RLS on BOTH `select` and `insert`.

### Task 1.3 — Update `db/tests/isolation.sql`
**File:** modify `db/tests/isolation.sql`.

- [ ] Append contiguous block (ids `20000000-0000-4000-8000-…`, never the existing `20000000-0000-0000-0000-…` ids) for Spec 020 acceptance #6 (cross-tenant refusal on all
  new RPCs, 0-row reads on `service_session_edits`, `discount_approvals`,
  `discount_approval_requests`, `manager_pin_attempts`, and `closed_commission_months`, no
  `pospay_app` writes to the approval/request/attempt tables, Branch 2 manager cannot read or decide
  Branch 1 requests, reception reads only its own requests, branch manager cannot close a month,
  `UPDATE`/`DELETE` refused on
  `closed_commission_months`, zero grants on `manager_pins`, spoofed `approved_by` rejected by
  `sessions_insert` for over-limit AND within-cap prices, approval replayed for another service
  refused, a second row reusing an `approval_id` refused, cross-branch manager approval/edit refused,
  direct `UPDATE service_sessions` denied, and the positive case that a non-report-reader holding
  `sessions.edit` reads its branch's `service_session_edits`).
- [ ] Append contiguous block (ids `21000000-0000-4000-8000-…`) for Spec 021 acceptance #32 (cross-tenant isolation on
  `commission_plan_tiers`, `service_commission_overrides`, `staff_salaries`; Branch 1 manager
  blocked from Branch 2 salaries and staff-specific overrides; reception reads 0 rows; `UPDATE` and
  `DELETE` denied on all 3 tables; adding a tier to a version committed earlier is refused; an
  override with a past `effective_from` is refused; a branch manager without
  `commissions.overrides.manage` cannot insert overrides, and with it cannot insert a Branch 2 staff
  override).
- [ ] Both blocks go inside the existing transaction, **before** the final `reset role; rollback;`
  and `\echo 'isolation: PASS'` lines of `db/tests/isolation.sql`.
- [ ] Verify: on a fresh disposable `pospay_test`, first `CREATE ROLE anon NOLOGIN; CREATE ROLE
  authenticated NOLOGIN;` (as `.github/workflows/ci.yml` does), apply every file in
  `db/migrations/` in name order (`0001`–`0026`; note there are two `0021_*` files), re-apply `0025`
  & `0026`, then run `db/tests/isolation.sql` — must output `isolation: PASS`.

---

## Phase 2A: Services Module Backend (`020-session-controls`)

### Task 2A.1 — Contracts, Permissions Key & Domain
**Files:**
- Modify `src/modules/permissions/contracts.ts`, `domain/permission-matrix.ts`,
  `domain/permission-admin-types.ts`, `domain/override-states.ts`, and their unit tests
- Modify `src/i18n/ar.json` and `src/i18n/en.json` (`permissionAdmin.sessions.edit`,
  `permissionAdmin.commissions.overrides.manage`)
- Modify `src/modules/services/contracts.ts`
- Modify `src/modules/services/domain/discount.ts` and `discount.test.ts`
- Create `src/modules/services/domain/pin.ts` and `pin.test.ts`

- [ ] Wire `"sessions.edit"` into `permissions`: `permissionKeySchema`, the `ALL` and `MANAGER`
  arrays in `permission-matrix.ts` (feeding `ROLE_DEFAULTS.owner` / `.branch_manager`),
  `EDITABLE_PERMISSIONS` and the literal default object in `toStates` (`override-states.ts`), the
  `EditablePermission` union (`permission-admin-types.ts`), the i18n label
  `permissionAdmin.sessions.edit`, and tests. Add `"commissions.overrides.manage"` the same way
  but to `ALL` only (not `MANAGER`; Spec 021 Rule O4) in this same task, because both keys touch the
  same files and Zod 4 records are exhaustive.
- [ ] Add `PERMISSION_ROLES` in `override-states.ts` (`"sessions.edit": ["branch_manager",
  "reception"]`, `"commissions.overrides.manage": ["branch_manager"]`): the permissions page hides
  a key for a member without one of its roles, `saveMemberOverrides` refuses a non-default state
  with `PERMISSION_NOT_APPLICABLE`, and `effectivePermissions` drops the key for such a member.
- [ ] Add Zod schemas & DTO types in `services/contracts.ts` per Spec 020 (`pinCodeSchema`,
  `managerApprovalInput` (`kind: "pin" | "remote"`), updated `recordSessionInput`,
  `RecordSessionResult` (incl. `approval_unavailable`, no `pin_locked`), remote-approval inputs and
  DTOs, `FailedPinAttemptDto`, `setManagerPinInput`, `closeMonthInput` (with
  `confirmUnfinishedMonth`), `MonthCloseStatusDto`, `editSessionInput`, `EditSessionResult`,
  `EditableSessionDto`, `ClosedMonthDto`, `SessionEditHistoryDto`, `listEditableSessionsInput`).
- [ ] Update `checkDiscount` in `discount.ts`:
  - `priceMills < 0n` → `"INVALID_PRICE"`.
  - `priceMills === listMills` → `null`.
  - `priceMills > listMills` → requires non-empty reason (Q3), else `"DISCOUNT_REASON_REQUIRED"`.
  - `priceMills < listMills` → requires non-empty reason, else `"DISCOUNT_REASON_REQUIRED"`; if
    within `capPercent` → `null`; else → `"DISCOUNT_OVER_LIMIT"`.
  - Rewrite existing `PRICE_ABOVE_LIST` assertions in `discount.test.ts` to Q3 behavior; keep ق-1
    `100.000 / 10% / 90.000 / 85.000` assertions.
- [ ] `pin.ts`: `isValidPin(pin)` (`^\d{4}$`) with unit tests (no lockout constants).
- [ ] `approval.ts`: pure `approvalRequestState(request, now)` → `waiting` / `approved` /
  `rejected` / `expired`, and `approvalMatches(request, payload)` for the `mismatch` check, with
  unit tests.

### Task 2A.2 — Ports & Use Cases
**Files:**
- Modify `src/modules/services/ports/session-repository.ts`
- Create `src/modules/services/ports/manager-pin-repository.ts`
- Modify `src/modules/services/use-cases/record-session.ts` and `record-session.test.ts`
- Create `src/modules/services/use-cases/edit-session.ts` and `edit-session.test.ts`
- Create `src/modules/services/use-cases/close-month.ts` and `close-month.test.ts`
- Create `src/modules/services/use-cases/set-manager-pin.ts` and `set-manager-pin.test.ts`
- Create `src/modules/services/ports/discount-approval-repository.ts`
- Create `src/modules/services/use-cases/discount-approval.ts` and `discount-approval.test.ts`

- [ ] Extend `SessionRepository` with `isMonthClosed`, `hasSimilarSession`, `listBranchApprovers`,
  `verifyManagerPin`, `consumeApproval`, `getSessionForEdit`, `updateSession`, `closeMonth`,
  `listClosedMonths`, `monthCloseStatus`, and optional `approvedBy` / `approvalId` on `NewSession`
  (no `approvedAt`: `insertSession` writes `approved_at` with a SQL subquery reading the approval
  row's `created_at`, never SQL `now()` — a remote approval is created in an earlier transaction).
  `ManagerPinRepository` holds only the caller's own PIN (`setPin`, `hasPin`) and lists failed
  attempts. `DiscountApprovalRepository`: `requestApproval`, `getRequest`, `listPending`,
  `decide`.
- [ ] Update `recordSession`:
  - Returns `RecordSessionResult` (`saved` | `duplicate_warning` | `pin_required` | `pin_invalid` |
    `approval_unavailable`).
  - Order (same as Spec 020 Rule C2): `claimRequest` → assignment & `canWrite` → time & future →
    `isMonthClosed` (throw `PERIOD_CLOSED` if the session's branch-local month is closed) → price &
    reason check (throw every error except `DISCOUNT_OVER_LIMIT`, which is deferred) → duplicate
    check (if `!confirmDuplicate`) → if over-limit: without approval return `pin_required` with
    branch approvers; with `kind: "pin"` call `verifyManagerPin` (if invalid return `pin_invalid`
    cleanly so the attempt row commits); with `kind: "remote"` load the request and return
    `approval_unavailable` (`pending` / `rejected` / `expired` / `used` / `mismatch`) unless it is
    approved, unexpired, unused and matches the payload → upsert client → insert session → consume
    approval → audit (recording
    `approvedBy`, `duplicateConfirmed`).
  - `recordAvailableSession<T extends { id: string }>` no longer fits the result union
    (`duplicate_warning` etc. have no `id`); loosen its type parameter.
- [ ] Implement `editSession`:
  - Must NOT call `canWrite` or `upsertClient` (both need `session_writer`; an editor may not be a
    writer) — client and branch checks run inside `update_recorded_session`.
  - Validates `editReason`, loads existing session, enforces `session_editor` permission & open
    month on both old and new timestamps (`PERIOD_CLOSED`), resolves service/staff/branch
    (preserving `listPriceMills` if `serviceId` unchanged), refuses a changed `clientName` without
    `clientPhone` (`CLIENT_PHONE_REQUIRED`), checks price/reason and reuses existing `approvedBy`
    only if `serviceId`, `priceMills` and branch are unchanged; a branch move with a price still
    over the editor's cap, or a newly over-limit price, needs a fresh approval (PIN or remote) from
    the **new** branch's approvers, else `pin_required`; calls `updateSession`.
- [ ] Implement `closeMonth` (validates `YYYY-MM-01` month start, owner-only in RLS, refuses a
  not-ended month without `confirmUnfinishedMonth` → `MONTH_NOT_ENDED_CONFIRMATION_REQUIRED`, writes
  `commission_month.closed` audit) and `setManagerPin` (validates 4-digit PIN format).
- [ ] Implement `discount-approval.ts` use cases: request (only after `pin_required` conditions
  hold), get status (requester), list pending (approvers), decide (approve/reject; maps
  `APPROVAL_REQUEST_CLOSED`).
- [ ] Unit tests with in-memory fakes covering every branch and edge case.

### Task 2A.3 — Persistence, Server Functions & Real-DB Integration Tests
**Files:**
- Modify `src/modules/services/persistence/session.server.ts`
- Create `src/modules/services/persistence/manager-pin.server.ts`
- Create `src/modules/services/persistence/discount-approval.server.ts`
- Create `src/modules/services/persistence/session-controls.integration.test.ts`
- Modify `src/modules/services/persistence/session.integration.test.ts` and
  `session-idempotency.integration.test.ts`
- Modify `src/modules/services/functions/session.functions.ts` and `discount.functions.ts`
- Modify `src/modules/services/index.ts` and `index.server.ts`

- [ ] Wire all new `0025` SQL functions in `session.server.ts` and `manager-pin.server.ts`.
  - **CRITICAL:** verify that when `recordSession` or `editSession` returns `pin_invalid`,
    `withUser()` does NOT throw — it commits the `manager_pin_attempts` row + audit and returns the
    structured status to the client. Pass the request `user-agent` (via `getRequestHeaders()`,
    truncated to 200 chars) from the server function down to `verify_manager_pin_approval`.
- [ ] Add server functions:
  - `setManagerPinFn`, `getManagerPinStatusFn`, `listFailedPinAttemptsFn` (in
    `discount.functions.ts`).
  - `requestDiscountApprovalFn`, `getDiscountApprovalRequestFn`, `listPendingDiscountApprovalsFn`,
    `decideDiscountApprovalFn` (new `approval.functions.ts`); no `pos.access` wrapper — gate in SQL
    (`session_writer` / `session_editor` for request & status, `discount_approver` for list &
    decide).
  - `getMonthCloseStatusFn` (owner) next to `closeMonthFn`.
  - `listEditableSessionsFn`, `editSessionFn`, `listSessionEditsFn`, `listClosedMonthsFn`,
    `closeMonthFn` (in `session.functions.ts`). Do NOT wrap these in
    `withPermission(..., "pos.access", ...)` like `recordSessionFn`: branch managers lack
    `pos.access` by default. Gate on `sessions.edit` (and owner for `closeMonthFn`) via the SQL
    helpers.
  - Update existing `recordSessionFn` return type to `RecordSessionResult` (and update existing
    tests in `session.functions.test.ts` & `session.integration.test.ts` cleanly).
- [ ] Write `session-controls.integration.test.ts` (fixture ids `20000000-0000-4000-8000-…` — not the `20000000-0000-0000-0000-…` ids already used by `db/tests/platform-isolation.sql` and `correct-attendance.integration.test.ts` — double-apply
  `0025`, `afterAll` cleanup) testing Spec 020 acceptance criteria #1–#5 and #7 on real
  `pospay_test`, including proving that 6 wrong PINs each commit a `manager_pin_attempts` row and
  the 7th correct PIN still saves (no lockout), the remote approve / reject / expire flow (expire a
  request or approval by updating `expires_at` as the migration owner before `set role
  pospay_app`), a remote request working when no approver has a PIN, owner
  granting `sessions.edit` lets reception edit an older open-month session (and a grant to a
  staff-only member is refused), a rename without phone is refused, a not-ended month needs
  `confirmUnfinishedMonth`, and closing the month blocks edits for reception, branch manager, AND
  owner with `PERIOD_CLOSED`.

---

## Phase 2B: Commissions Module Backend (`021-commissions-builder`)

### Task 2B.1 — Contracts & Multi-Method Domain Engine
**Files:**
- Create `src/modules/commissions/contracts.ts`
- Modify `src/modules/commissions/domain/plan.ts` and `plan.test.ts`
- Create `src/modules/commissions/domain/parse.ts` and `parse.test.ts`
- Modify `src/modules/commissions/domain/compute-commission.ts` and `compute-commission.test.ts`

- [ ] `parse.ts` (pure integer string parsing, zero floats):
  - `parsePercentToBp(text)` (`"5"` → `500n`, `"12.5"` → `1250n`, `"0.25"` → `25n`, rejects invalid)
  - `parseMultipleToMilli(text)` (`"2"` → `2000n`, `"2.5"` → `2500n`, `"3.250"` → `3250n`)
  - KWD strings: reuse `parseKwd` from `@/shared/kernel/money` (no new parser)
- [ ] Expand `plan.ts`:
  - `PlanRules`: `{ baseRateBp: bigint | null; baseFixedMills: Mills | null; tierSchedule: TierSchedule | null }`
    exactly as Spec 021 rule M0 (replaces `tier`; no compatibility alias). Move every dependent
    listed in M0 in the same task and rewrite the 019 fixtures to the new shape with identical
    inputs and expected numbers (type-only change, allowed by the "never loosen tests" rule).
  - `SalesLine`: `{ sessionId: string; serviceId?: string; occurredAt: Date; netMills: Mills }`
    (optional `serviceId` keeps the existing 019 fixtures valid; `occurredAt` is required per Spec
    021 M0, so the 019 fixtures gain it as part of the type-only rewrite).
  - `ServiceOverrideHistory`: per `(staffId | null, serviceId)` the rows `{ effectiveFrom: Date;
    override: ServiceOverride | { kind: "clear" } }`; pure `resolveOverride(history, staffId,
    serviceId, occurredAt)` applies Spec 021 Rules O1/O2/O5 (latest `effectiveFrom <= occurredAt`).
  - `ServiceOverride`: `{ kind: "rate_bp"; rateBp: bigint } | { kind: "fixed_mills"; mills: Mills }`.
  - `CommissionResult`: add `qualifyingSessionCount`, `overrideSalesMills`, `overrideSessionCount`,
    `baseRateMills`, `baseFixedMills`, `overrideMills` while keeping `qualifyingSalesMills`,
    `thresholdMills`, `baseMills`, `tierMills`, `totalMills` with the meanings in Spec 021 rule M0b.
  - `validatePlanVersion`: enforces non-empty (`PLAN_EMPTY`), 1–20 tiers, strictly ascending
    thresholds, valid rates/mills, session-count mode must be `"excess"`.
- [ ] Update `compute-commission.ts`:
  - Remove `TODO(spec)` Q1 comment (floor per component per period is now finalized).
  - Accept `rules: PlanRules | null` (Spec 021 M0c: `null` = no plan, only override lines pay).
  - Partition lines into overridden (`resolveOverride` per line at `line.occurredAt`) vs
    qualifying lines.
  - Compute `overrideMills`, `baseRateMills`, `baseFixedMills`, `tierMills` (progressive `excess`
    brackets, multi-tier `all_after`, and `session_count` brackets with `rate_bp` or `fixed_mills`).
  - Preserve ALL 019 acceptance rows 1–15 and add rows 17–29, 33 and 34 in
    `compute-commission.test.ts`.

### Task 2B.2 — Ports & Use Cases
**Files:**
- Modify `src/modules/commissions/ports/plan-repository.ts`
- Create `src/modules/commissions/ports/override-repository.ts`
- Create `src/modules/commissions/ports/salary-repository.ts`
- Modify `src/modules/commissions/use-cases/compute-staff-commission.ts` and test
- Create `src/modules/commissions/use-cases/manage-plans.ts` and test
- Create `src/modules/commissions/use-cases/manage-overrides.ts` and test
- Create `src/modules/commissions/use-cases/manage-salaries.ts` and test

- [ ] Extend `CommissionPlanRepository` with `listPlansWithLatestVersions` and
  `listStaffAssignments` (showing every eligible staff member with active plan or `null` for
  «بدون خطة» Q8).
- [ ] `ServiceOverrideRepository`: `saveOverride` (no effective date — the DB sets
  `effective_from`), `listOverrides`, `overrideHistory(companyId, staffId, periodEnd)` (every row for
  the staff member and service-wide rows with `effective_from < periodEnd`; resolution per line
  happens in the domain).
- [ ] `SalaryRepository` (extends/pairs with `SalarySource`): `recordSalary`, `listStaffSalaries`
  (branch-scoped via RLS).
- [ ] Update `computeStaffCommission`: takes optional `overrides` port, resolves salary only when
  `tierSchedule?.accumulator === "sales_amount" && tierSchedule.thresholdKind === "salary_multiple"`,
  passes the override history into `computeCommission`. With no plan it still computes override
  lines and returns `{ status: "no_plan", result }` (Spec 021 M0c); update the 019 row-16 test to
  that shape (`totalMills = 0n`) — the only intended 019 expectation change.
- [ ] `manageOverrides` returns `FORBIDDEN` unless the caller is owner or a branch manager holding
  `commissions.overrides.manage` (and, for a staff override, covering that staff member's branch).

### Task 2B.3 — Persistence, Adapters, Server Functions & Integration Tests
**Files:**
- Modify `src/modules/commissions/persistence/commission-plan.server.ts` and
  `commission-plan.integration.test.ts`
- Create `src/modules/commissions/persistence/service-override.server.ts`
- Create `src/modules/commissions/persistence/salary.server.ts`
- Create `src/modules/commissions/persistence/sales-source.server.ts`
- Create `src/modules/commissions/persistence/commissions-builder.integration.test.ts`
- Create `src/modules/commissions/functions/plans.functions.ts`, `overrides.functions.ts`,
  `salaries.functions.ts`
- Modify `src/modules/commissions/index.ts` and `index.server.ts`

- [ ] Update `pgCommissionPlanRepository`:
  - `addVersion` inserts into `commission_plan_versions` + batch-inserts `commission_plan_tiers`
    inside the same advisory-locked transaction (the tiers insert policy only accepts tiers of a
    version created in the current transaction; never pass an explicit `created_at`).
  - `resolve` reads `commission_plan_versions` + its ordered `commission_plan_tiers` (with legacy
    column fallback).
- [ ] Implement `pgServiceOverrideRepository`, `pgSalaryRepository` (also implementing
  `SalarySource`), and `pgCommissionSalesSource` (branch-local calendar month via
  `branches.timezone`, ordered `occurred_at, recorded_at, id`, returning `occurredAt` per line).
- [ ] Add server functions authenticating via `requireUserId()`, validating with Zod `contracts.ts`,
  and running inside `withUser()`.
- [ ] Write `commissions-builder.integration.test.ts` (fixture ids `21000000-0000-4000-8000-…`, double-apply
  `0026`, `afterAll` cleanup) verifying acceptance #30–#31 on real `pospay_test` (including Kuwait
  UTC+3 month boundary, branch-scoped salary RLS, service override resolution + `'clear'`,
  mid-day override effect (acceptance #33 — insert the fixed-`effective_from` override fixture as
  the migration owner before `set role pospay_app`), no-plan override pay (#34), override
  permission (#35),
  and legacy 0024 backfill resolution).

---

## Phase 3: Navigation, Routes, UI Screens & i18n

### Task 3.1 — Navigation & Route Registration
**Files:**
- Modify `src/modules/permissions/ui/navigation.ts`, `navigation.test.ts`, `area-guard.test.ts`
- Create `src/routes/app/services/sessions.tsx`
- Create `src/routes/app/services/approvals.tsx`
- Create `src/routes/app/commissions/plans.tsx`
- Create `src/routes/app/commissions/overrides.tsx`
- Create `src/routes/app/commissions/salaries.tsx`

- [ ] Add `/app/services/sessions` under `nav.group.services` with `requires: "sessions.edit"` and a
  new label key (e.g. `nav.manageSessions`; `nav.sessions` is already used by `/pos/sessions`).
  Visible to `owner` and `branch_manager` (only they hold `sessions.edit` in the `app` area;
  reception edits from `/pos/sessions`).
- [ ] Add `/app/services/approvals` under `nav.group.services` (`nav.discountApprovals`, `requires:
  "discounts.manage"`) with a pending-count badge refreshed by polling (10 s).
- [ ] Add `nav.group.commissions` (`Percent` / `Coins` icon) with 3 children:
  - `/app/commissions/plans` (`nav.commissionPlans`)
  - `/app/commissions/overrides` (`nav.commissionOverrides`, `requires:
    "commissions.overrides.manage"`)
  - `/app/commissions/salaries` (`nav.salaries`)
  Visible ONLY when `role === "owner" || role === "branch_manager"` (matching Q2 & Q7).
  `visibleNavigation` has no generic role gate (it only hard-codes `/app/permissions` and
  `/app/page` by `group.to`), and this group has no `to`, so add an explicit mechanism (e.g. an
  optional `roles` field on `NavGroup` checked in `visibleNavigation`).
- [ ] Update `navigation.test.ts`, `area-guard.test.ts`, and `permissions-page.test.tsx` to cover
  `sessions.edit`, `commissions.overrides.manage` (hidden toggles for non-applicable roles) and all
  new routes for every role.

### Task 3.2 — Services UI (`020-session-controls`)
**Files:**
- Modify `src/modules/services/ui/sessions-page.tsx` (split into small focused components `< 400`
  lines each: `session-pin-dialog.tsx`, `session-duplicate-dialog.tsx`, `session-edit-dialog.tsx`,
  `recent-sessions-list.tsx`)
- Create `src/modules/services/ui/manage-sessions-page.tsx` (sessions table + edit history drawer
  + owner-only "Close Month" lock action)
- Modify `src/modules/services/ui/discounts-page.tsx` (add `ManagerPinCard` 4-digit PIN setup and
  a failed PIN attempts list)
- Create `src/modules/services/ui/approvals-page.tsx` (remote-approval inbox) and
  `src/modules/services/ui/remote-approval-status.tsx` (reception waiting panel)
- Create UI tests: `sessions-page.test.tsx`, `discounts-page.test.tsx`, `approvals-page.test.tsx`,
  `manage-sessions-page.test.tsx`

- [ ] `/pos/sessions`:
  - Always show price adjustment fields (even at `discountCap === 0`) with clear label for both
    surcharge and discount + mandatory reason.
  - Duplicate warning modal with exact Arabic prompt «فيه جلسة مشابهة، أكيد تبين تحفظين؟» and
    confirm button (`confirmDuplicate: true`).
  - Approval modal when server returns `pin_required`, with two options (keep "ask remotely"
    enabled even when the PIN approver list is empty):
    - PIN: select approver from branch list + 4-digit OTP/PIN input (`input-otp`); shows a plain
      "wrong PIN" message on `pin_invalid` (no attempt counter, no lock).
    - Ask remotely: sends the request, then polls status every 3 s and shows **waiting** (countdown
      to 5 minutes), **approved** (approver name; save enabled), **rejected**, or **expired**; on
      save, `approval_unavailable` shows the matching message.
  - Editable recent sessions list below form (shown when caller has `sessions.edit`) with masked
    phone (`•••123`), closed-month badge when locked, and Edit dialog (mandatory `editReason`;
    `clientPhone` optional but required when the client name changes).
- [ ] `/app/services/discounts`: add "My Manager PIN" card (set/update 4-digit PIN, shows
  configured status badge, never echoes PIN) and a "Failed PIN attempts" list (approver, requester,
  device user-agent, time in branch local time).
- [ ] `/app/services/approvals`: pending requests (branch, service, list & requested price, reason,
  requester, time left — never the client phone) with approve / reject buttons; polls every 10 s.
- [ ] `/app/services/sessions`: date-range filter, branch sessions table, Edit dialog (open months
  only; disabled with «الشهر مغلق» badge once closed), Edit History modal showing timestamped
  before/after diffs & reasons, and (for **owner** only) "Close Month" (`إغلاق الشهر`) writing to
  `closed_commission_months`: a month that has ended uses a normal confirmation; a month that has
  not ended shows a strong confirmation (irreversible warning, days remaining from
  `getMonthCloseStatusFn`, button enabled only after the owner types the month `YYYY-MM`) and sends
  `confirmUnfinishedMonth: true`.

### Task 3.3 — Commissions UI (`021-commissions-builder`)
**Files:**
- Create `src/modules/commissions/ui/plans-page.tsx`
- Create `src/modules/commissions/ui/plan-method-builder.tsx` (visual block builder for the 4
  methods + brackets editor)
- Create `src/modules/commissions/ui/plan-preview-card.tsx` (live interactive preview calling pure
  `computeCommission`)
- Create `src/modules/commissions/ui/staff-plan-assignments.tsx` (staff list with «بدون خطة» badge
  + assign from 1st of month)
- Create `src/modules/commissions/ui/overrides-page.tsx`
- Create `src/modules/commissions/ui/salaries-page.tsx`
- Create UI tests: `plans-page.test.tsx`, `overrides-page.test.tsx`, `salaries-page.test.tsx`

- [ ] Visual method menu checkboxes/blocks in `plan-method-builder.tsx`:
  1. Fixed percentage of sales (`%`)
  2. Fixed amount per session (`KWD`)
  3. Brackets / Tiers after threshold — toggle accumulator (`Sales amount` vs `Session count`),
     mode (`Progressive brackets` vs `All sales after threshold`), threshold type (`Fixed KWD` vs
     `Salary multiple`), add/remove bracket rows (1..20).
  4. Combine freely — live preview card computes exact KWD breakdown as the owner edits!
- [ ] Staff assignment list highlights unassigned staff with a clear **«بدون خطة»** badge (Q8),
  showing override earnings next to it when the staff member has matching overrides.
- [ ] Overrides page supports service-wide AND staff-specific overrides (`%` or fixed KWD/session
  or clear back to plan), effective from the moment of saving (no date input); history lists each
  row's `effective_from` in branch local time. Staff choices are limited to the caller's branch
  for a branch manager.
- [ ] Salaries page lists only staff the caller is allowed to manage (owner: all branches; branch
  manager: own branch), shows current salary + history, and records effective-dated updates.

### Task 3.4 — Internationalization (`ar.json` & `en.json`)
**Files:** modify `src/i18n/ar.json` and `src/i18n/en.json`.

- [ ] Add all new keys (flat dotted strings) with prefixes `sessions.*`, `pin.*`, `commissions.*`,
  `salaries.*`, `approvals.*`, `nav.*`, `permissionAdmin.sessions.edit`, and
  `permissionAdmin.commissions.overrides.manage` in BOTH `ar.json` and `en.json` with
  identical key sets. Parity is enforced by the typing in `src/i18n/index.ts` (`MessageKey =
  keyof typeof ar`, `en` typed against it), so `tsc` fails on a missing English key; there is no
  separate parity test.
- [ ] Update `sessions.price` and `sessions.reason` / `sessions.DISCOUNT_REASON_REQUIRED` copy so
  it covers both discounts and price raises clearly.

---

## Phase 4: Verification Gates & Delivery

- [ ] **Route generation:** run Vite/TanStack router build so `src/routeTree.gen.ts` updates cleanly
  for the 5 new routes.
- [ ] **SQL gates (disposable `pospay_test`):**
  1. Apply migrations `0001`–`0026`; re-apply `0025` and `0026` a second time (idempotency check).
  2. Run `db/tests/isolation.sql` → `isolation: PASS`.
- [ ] **Automated test & quality gates:**
  1. `POSPAY_TEST_DATABASE_URL=... bun run test` (0 failures, 0 unexpected skips).
  2. `bun run tsc --noEmit` (0 errors; same command as CI).
  3. `bun run lint` (0 errors, no new warnings beyond existing baseline).
  4. `NITRO_PRESET=node-server bun run build` (clean production build).
- [ ] **Documentation & PR:**
  1. Write `docs/specs/020-session-controls/verification.md` and
     `docs/specs/021-commissions-builder/verification.md` with exact command outputs.
  2. Add user journey manual-test guide `docs/user-journeys/<PR#>-<slug>.md` (Arabic test steps,
     same pattern as `26-session-recording.md`) for Waleed to click through on staging/production
     after applying `0025` and `0026`.
  3. Open PR into `main`, link PR, resolve CI + local review rounds (max 3 rounds; GitHub review
     bots are paused), and hold merge until Waleed confirms `0025` + `0026` are applied in
     production.
