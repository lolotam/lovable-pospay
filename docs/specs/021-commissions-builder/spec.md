# 021 — commissions: multi-method engine, salaries, service overrides, sales adapter, and plan builder UI

Written 2026-11-19 (Kuwait) from `main` at `1f601a2`. Reserved migration:
`db/migrations/0026_commission_methods_and_salaries.sql` (follows `0024_commission_plans.sql` and
`0025_session_controls.sql`).

## Requirement

Slice 019 delivered the initial pure commission engine (base percentage + single sales tier) and
migration `0024` (`commission_plans`, `commission_plan_versions`, `staff_commission_plans`). On
2026-11-19 Waleed resolved every open question in `docs/specs/019-commissions-core/spec.md`
(Q1–Q8) and requested a **multi-method menu** in the plan builder so owners and branch managers
can build and combine commission methods visually (D-35, D-50).

This slice delivers the complete commission configuration and calculation layer:

1. **Multi-method commission engine (Waleed 2026-11-19, Q1, Q3, Q4, Q6, Q8):**
   - Method 1 — Fixed percentage of qualifying sales (`baseRateBp`).
   - Method 2 — Fixed amount per qualifying session (`baseFixedMills`).
   - Method 3 — Multiple tiers / brackets after a threshold:
     - **Progressive brackets** (`excess`, tax-like, Q3) or **retroactive step-up** (`all_after`,
       D-55 Nails).
     - Threshold as a **fixed KWD amount**, a **multiple of salary** (last day of month), or a
       **session count** (Q4 — rate or fixed amount applies to sessions after the Nth).
   - Method 4 — **Combinations** of any of the above (e.g., base 1% + sales brackets, or base
     2.000/session + 10% after 20 sessions).
   - Rounding locked to **floor to the mill once per period per component** (Q1; removes
     `TODO(spec)`).
2. **Per-service and per-staff-service overrides (Q5, D-37):**
   - Replaces the plan for matching lines (percentage OR fixed amount per session, including 0).
   - Overridden lines do **not** count toward plan thresholds or plan base components.
   - Priority (D-50): staff+service override → service override → plan.
   - Staff with no plan still earn matching overrides; their other lines earn `0` and the
     **«بدون خطة»** flag stays (Waleed decision 3).
   - An override takes effect from the moment it is saved (date and time), not from a month start
     (Waleed decision 4).
   - Writers: the owner, and branch managers the owner granted the new permission
     `commissions.overrides.manage` on `/app/permissions` (default off; Waleed decision 1).
3. **Effective-dated staff salaries (Q2):**
   - Owners record/read salaries for all staff; branch managers record/read salaries **only for
     staff of their own branch** (RLS-enforced).
   - Append-only effective-date history; `pgSalarySource` reads the salary on the last day of the
     period.
4. **Real sales adapter over `service_sessions`:**
   - `pgCommissionSalesSource` reads net `price_mills` (after discount, tips excluded) for one
     performer in a calendar month resolved in the **branch's local timezone** (D-10), ordered
     deterministically by `occurred_at ASC, recorded_at ASC, id ASC` (D-50).
5. **Plan Builder, Staff Assignment, Overrides & Salaries UI (`/app/commissions/*`, D-35, Q7, Q8):**
   - Visual block builder (no written formulas) with live KWD example calculator, append-only plan
     versioning, month-start staff assignments (Q6), clear **«بدون خطة»** (`NO_PLAN`, Q8) status
     for unassigned staff, service overrides screen (gated by `commissions.overrides.manage`), and
     branch-scoped salaries screen.

## Business rules (cite PRD D-xx / Waleed 2026-11-19)

### A. Multi-method commission engine

- **M0 (domain shape — breaking change to the 019 types).** Today `src/modules/commissions/domain/plan.ts`
  has `PlanRules = { baseRateBp: bigint | null; tier: PlanTier | null }` with
  `PlanTier = { mode; rateBp; threshold: TierThreshold }` and
  `TierThreshold = { kind: "fixed"; mills } | { kind: "salary_multiple"; multipleMilli }`.
  This slice replaces `tier` with `tierSchedule` (no compatibility alias):
  ```ts
  interface SalesTier { rateBp: bigint; threshold: TierThreshold }          // existing TierThreshold
  interface SalesTierSchedule {
    accumulator: "sales_amount"; mode: TierMode;
    thresholdKind: "fixed" | "salary_multiple";                            // every tier.threshold.kind must equal it
    tiers: SalesTier[];
  }
  interface SessionCountTier {
    afterSessions: number;                                                 // integer >= 0
    reward: { kind: "rate_bp"; rateBp: bigint } | { kind: "fixed_mills"; mills: Mills };
  }
  interface SessionCountTierSchedule { accumulator: "session_count"; mode: "excess"; tiers: SessionCountTier[] }
  type TierSchedule = SalesTierSchedule | SessionCountTierSchedule;
  interface PlanRules { baseRateBp: bigint | null; baseFixedMills: Mills | null; tierSchedule: TierSchedule | null }
  ```
  Dependents that must move in the same change: `domain/compute-commission.ts`,
  `domain/plan.ts` (`validatePlanVersion`), `use-cases/compute-staff-commission.ts`
  (`needsSalary`), `persistence/commission-plan.server.ts` (`versionParameters`, `mapTier`),
  `index.ts` exports (`PlanTier` is removed or re-pointed; export the new types),
  `SalesLine` in `domain/plan.ts` (gains a required `occurredAt: Date`, needed by Rule O5; the
  019 fixtures add it as part of the type-only rewrite), and the fixtures
  in `compute-commission.test.ts`, `plan.test.ts`, `compute-staff-commission.test.ts`,
  `commission-plan.integration.test.ts`. Rewriting those fixtures to the new shape is a
  type-only change: inputs and expected numbers stay identical, so no 019 behavior is loosened.
- **M0b (`CommissionResult` compatibility).** Keep `qualifyingSalesMills`, `thresholdMills`,
  `baseMills`, `tierMills`, `totalMills` with these meanings so 019 rows 1–15 pass unchanged:
  `baseMills = baseRateMills + baseFixedMills`; `thresholdMills` = the resolved threshold of the
  first (lowest) sales-amount tier, or `null` when there is no sales-amount schedule. New fields:
  `baseRateMills`, `baseFixedMills`, `overrideMills`, `qualifyingSessionCount`,
  `overrideSalesMills`, `overrideSessionCount`.
- **M0c (no plan with overrides — Waleed decision 3).** `computeCommission` accepts
  `rules: PlanRules | null`. With `null`, every plan component (`baseRateMills`, `baseFixedMills`,
  `tierMills`, `thresholdMills`) is `0n` / `null`, override lines are paid per Rule O3, and every
  other line earns `0`. `computeStaffCommission` returns `{ status: "no_plan"; result:
  CommissionResult }` (the 019 shape `{ status: "no_plan" }` gains `result`). This is the only
  intended change to a 019 expectation: the row-16 use-case test now expects
  `{ status: "no_plan", result }` with `totalMills = 0n` when there are no overrides.

- **M1 (Q1 — Rounding).** Period-level floor rounding (`numerator / 10000n` in `bigint`) once per
  component (`baseRate`, `tier`, `overrideRate`). Fixed-mills components are exact integers.
  `totalMills = baseRateMills + baseFixedMills + tierMills + overrideMills`.
- **M2 (Method 1 — Base percentage).** Optional `baseRateBp` (`1..10000` bp). Applied to
  `qualifyingSalesMills` (all non-overridden lines in the period).
- **M3 (Method 2 — Base fixed per session).** Optional `baseFixedMills` (`> 0n` mills). Applied as
  `BigInt(qualifyingLines.length) * baseFixedMills`.
- **M4 (Method 3a — Sales-amount tiers, Q3 & D-55).** Optional `tierSchedule` with
  `accumulator: "sales_amount"`, `mode: "excess" | "all_after"`, `thresholdKind: "fixed" |
  "salary_multiple"`, and `tiers: SalesTier[]` (1 to 20 tiers, strictly ascending thresholds).
  - Resolved threshold for tier `i`:
    - `fixed` → `tier.threshold.mills` (`>= 0n`).
    - `salary_multiple` → `(salaryMills * tier.threshold.multipleMilli) / 1000n` (`multipleMilli > 0n`); if
      `salaryMills === null` → `CommissionError("SALARY_REQUIRED")`.
  - **`excess` (Q3 progressive brackets):**
    - For each bracket `i` from `0` to `k - 1`, lower bound is `t_i`, upper bound is `t_{i+1}` (or
      `∞` for last bracket).
    - Qualifying slice for bracket `i`:
      `slice_i = max(0n, min(qualifyingSalesMills, upper_i) - t_i)`.
    - Exact tier numerator = `sum(slice_i * tier_i.rateBp)`.
    - `tierMills = roundCommission(numerator)` (one floor division for the tier component).
  - **`all_after` (D-55 Nails / retroactive step-up):**
    - Find the highest bracket `i` where `qualifyingSalesMills >= t_i`.
    - If found: `tierMills = roundCommission(qualifyingSalesMills * tier_i.rateBp)`.
    - Otherwise: `tierMills = 0n`.
- **M5 (Method 3b — Session-count tiers, Q4).** Optional `tierSchedule` with
  `accumulator: "session_count"`, `mode: "excess"`, and `tiers: SessionCountTier[]` (1 to 20
  tiers, strictly ascending `afterSessions >= 0`).
  - Qualifying lines are already ordered per D-50 (`occurredAt ASC, recordedAt ASC, sessionId ASC`).
  - Each tier `i` covers sessions with 1-based index `idx` in
    `(afterSessions_i, afterSessions_{i+1}]` (or `(afterSessions_{k-1}, ∞)` for last tier).
  - Each tier has EITHER `reward: { kind: "rate_bp"; rateBp: bigint }` (`1..10000`) OR
    `reward: { kind: "fixed_mills"; mills: Mills }` (`> 0n`).
  - Rate-based session brackets sum `line.netMills * rateBp` into one numerator and round down once
    via `roundCommission`; fixed-based session brackets add `mills` directly per matching session.
- **M6 (Method 4 — Combinations & non-empty validation).** A plan version may combine any subset of
  `baseRateBp`, `baseFixedMills`, and `tierSchedule`, provided at least one is present (otherwise
  `PLAN_EMPTY`). Maximum 20 tiers per version. Any invalid rate/mills/non-strictly-ascending
  threshold returns `PLAN_INVALID`.
- **M7 (Q6 — Effective month).** Plan versions and plan assignments take effect from the **1st day
  of a calendar month** only (`extract(day from effective_month) = 1`). Service overrides do not
  follow this rule; they take effect from the moment they are saved (Rule O5, Waleed decision 4).
- **M8 (Q7 — Who creates/assigns).** Owners and branch managers create/edit plans and versions
  (`commission_plan_manager`); owners assign any staff, branch managers assign only staff of their
  own branch (`commission_plan_assigner`). Unchanged from migration `0024`.
- **M9 (Q8 — Unassigned staff; Waleed decision 3).** Staff with no resolved plan for the period
  return `{ status: "no_plan", result }` (Rule M0c) and display **«بدون خطة»** / `"No plan"` in the
  UI (never silently `0`). When they have matching overrides (staff+service or service-wide), the
  UI shows the override earnings next to the «بدون خطة» flag; lines without an override earn `0`.

### B. Per-service & staff-service overrides (Q5, D-37, D-50)

- **O1. Priority.** Resolved **per sales line** `(companyId, staffId, serviceId, line.occurredAt)`:
  1. Latest `service_commission_overrides` row where `staff_id = staffId` and
     `effective_from <= line.occurredAt` (ordered by `effective_from desc, id desc`). If it is
     `rate_bp` / `fixed_mills`, use it; if it is `'clear'`, go to step 2.
  2. Else latest row where `staff_id IS NULL` (service-wide) and `effective_from <= line.occurredAt`.
     If it is `rate_bp` / `fixed_mills`, use it; if it is `'clear'` (or there is none), go to step 3.
  3. Else none (line uses the staff member's plan, or earns `0` with no plan — Rule M0c).
- **O2. Append-only clearing.** An override row with `override_kind = 'clear'` cancels an earlier
  override from its `effective_from`: a staff-level `'clear'` removes the staff override so the
  service-wide override (if any) applies; a service-wide `'clear'` removes the service override so
  the plan applies.
- **O3. Calculation (Q5).** When an active override (`rate_bp` `0..10000` or `fixed_mills >= 0n`)
  applies to a line:
  - The line is **excluded** from the plan's `qualifyingSalesMills`, `qualifyingSessionCount`, base
    rate, base fixed, and all tier thresholds.
  - If `rate_bp`: adds `line.netMills * rateBp` to `overrideRateNumerator` (rounded down once via
    `roundCommission`).
  - If `fixed_mills`: adds `fixedMills` to `overrideFixedMills`.
  - `overrideMills = roundCommission(overrideRateNumerator) + overrideFixedMills`.
- **O4. Permissions (Waleed decision 1).** New permission key `commissions.overrides.manage`.
  - The owner always holds it. It is off by default for `branch_manager`, and the owner may grant
    it (`allow`) to a branch manager on `/app/permissions`. It applies only to `branch_manager`
    members: the toggle is hidden for any other member, and `saveMemberOverrides` refuses a
    non-default state with `PERMISSION_NOT_APPLICABLE` (the `PERMISSION_ROLES` map from spec 020
    Rule D1 gains `"commissions.overrides.manage": ["branch_manager"]`).
  - Wire it exactly like `sessions.edit` in spec 020 Rule D1: `permissionKeySchema`
    (`contracts.ts`), the `ALL` array only — **not** `MANAGER` — in `domain/permission-matrix.ts`,
    `EDITABLE_PERMISSIONS` and the `toStates` literal (`domain/override-states.ts`), the
    `EditablePermission` union (`domain/permission-admin-types.ts`), i18n
    `permissionAdmin.commissions.overrides.manage` in both locales, and every literal full-key
    overrides object (Zod 4 exhaustive record). `public.role_default_permission` needs no change
    (it already returns `true` for every key for `owner` and only lists explicit keys for
    `branch_manager`).
  - Holders write **service-wide** overrides (`staff_id IS NULL`, company-wide effect):
    `public.commission_override_manager(company_id)`.
  - Holders write **staff** overrides only for staff of their own branch(es):
    `public.commission_staff_override_manager(company_id, staff_id)`.
  - Reading overrides is unchanged (`commission_plan_manager` for service-wide rows,
    `commission_plan_assigner` for staff rows), so every branch manager's commission calculation
    still sees the overrides that apply to their staff.
- **O5. Effective time (Waleed decision 4).** An override takes effect from the moment it is
  saved: `effective_from timestamptz` is set by the database (`clock_timestamp()`) and cannot be
  sent by the client (no backdating, no scheduling). A sales line uses the override history as it
  stood at the line's `occurred_at`: rows with `effective_from <= occurred_at` apply, later rows do
  not. Both are absolute instants, so the comparison does not depend on time zone; screens show
  `effective_from` in the branch's local time (`branches.timezone`). Sessions before the change keep
  the old value, sessions from the change onward get the new value, and old rows are never updated
  or deleted. `occurred_at` is entered to the minute (`HH:MM`), so a session recorded for the same
  minute in which the override was saved (e.g. `14:00` vs `14:00:37`) gets the old value. Commissions
  are computed from current session data, so editing a session's `occurredAt` re-resolves its
  override against the history.

### C. Effective-dated staff salaries (Q2)

- **S1. History.** `staff_salaries` is append-only (`select, insert` only; no `update`, no
  `delete`). Each entry has `staff_id`, `salary_mills > 0`, `effective_date` (any valid calendar
  date), `recorded_by`, `recorded_at` (`clock_timestamp()`).
- **S2. Resolution.** `salaryOn(companyId, staffId, date)` returns the `salary_mills` of the row
  with greatest `(effective_date, recorded_at)` where `effective_date <= date`, or `null` if none.
  For monthly commission calculation, `date = lastDayOfPeriod(period)` (PRD D-50, 019 row 13).
- **S3. Branch-scoped RLS (Q2).** Helper `public.salary_manager(_company uuid, _staff uuid)` =
  `owner`, OR `branch_manager` whose membership has `branch_id is null or branch_id =
  staff.branch_id`. BOTH `select` AND `insert` on `staff_salaries` require `salary_manager` (and
  `insert` checks `recorded_by = current_app_user()`). Branch 1 manager CANNOT read or write
  Branch 2 salaries. Reception, staff, accountant, and viewer read `0` rows.
- **S4. Audit.** Every salary insert writes `audit_log` (`staff_salary.recorded`).

### D. Real sales adapter (`pgCommissionSalesSource`)

- **D1.** Reads `public.service_sessions` joined with `public.branches` for `(company_id,
  staff_id)` where `s.occurred_at at time zone b.timezone` falls in `[periodStart, periodStart + 1
  month)`.
- **D2.** Returns `{ sessionId, serviceId, occurredAt: s.occurred_at, netMills: BigInt(price_mills) }` ordered by
  `s.occurred_at ASC, s.recorded_at ASC, s.id ASC` (D-50).
- **D3.** Runs through `withUser()`, relying on `sessions_report` RLS (`report_reader`), so
  branch managers only read sessions of their own branch and cross-tenant reads return `0` rows.

### E. UI routes and UX (`/app/commissions/*`)

- Added to a new `nav.group.commissions` in `src/modules/permissions/ui/navigation.ts`, visible only
  when the active company role is `owner` or `branch_manager` (matching `0024` / Q7). There is no
  permission key for this, and `visibleNavigation` today only role-gates two hard-coded group paths
  (`/app/permissions`, `/app/page`), so it must gain an explicit role gate for this group (e.g. an
  optional `roles` field on `NavGroup`). `pageAllowed` reuses `visibleNavigation`, so the route
  guard follows automatically; server functions still check `commission_plan_manager` /
  `commission_plan_assigner` / `salary_manager` and return `FORBIDDEN` themselves, because RLS alone
  returns `0` rows instead of an error:
  1. `/app/commissions/plans` — Plan list, visual block **Plan Builder** (select methods from menu:
     Fixed %, Fixed KWD/session, Progressive Brackets / Step-Up Tiers by Sales or Session Count,
     combine freely), live interactive KWD preview (enter sample sales / sessions / salary → see
     instant breakdown using the pure `computeCommission` domain function!), add new append-only
     version, and **Staff Plan Assignment** table showing every eligible staff member's current
     plan or **«بدون خطة»** badge (`NO_PLAN`, Q8) plus assign-from-month-start form.
  2. `/app/commissions/overrides` — List & add per-service and per-staff-service commission
     overrides (`%` or fixed KWD per session, or clear back to plan), effective from the moment of
     saving; history shows each row's `effective_from` in branch local time. The nav item has
     `requires: "commissions.overrides.manage"`, so a branch manager without the grant does not see
     it; the server functions also return `FORBIDDEN`.
  3. `/app/commissions/salaries` — List branch-scoped staff with their current salary + expandable
     history, and record new effective-dated salary form.

## Edge cases

| Case | Result |
|---|---|
| Plan version with all methods empty | Rejected: `PLAN_EMPTY` |
| Two brackets with equal or descending thresholds (e.g. `2000`, `2000` or `2000`, `1000`) | Rejected: `PLAN_INVALID` |
| Session-count schedule with `mode = "all_after"` | Rejected: `PLAN_INVALID` (and SQL check constraint) |
| Sales-amount tier with `fixedMills` reward | Rejected: `PLAN_INVALID` (sales tiers use `rateBp`) |
| Salary-multiple tier when staff has no salary recorded on or before last day of month | `CommissionError("SALARY_REQUIRED")` |
| Staff has service override on all sessions in the month, and also has a plan | `qualifyingSalesMills = 0n`, `tierMills = 0n`, `baseMills = 0n`, `overrideMills = computed override`, `totalMills = overrideMills` |
| Staff has service override with `rateBp = 0n` (0% promotional service) | Line earns `0.000` and does NOT count toward plan thresholds |
| Staff has NO plan assigned and no override matches | `{ status: "no_plan", result }` with `totalMills = 0n` («بدون خطة», Q8) |
| Staff has NO plan assigned, but a staff+service or service-wide override matches some lines | `{ status: "no_plan", result }`: override lines paid, other lines `0`, `totalMills = overrideMills`; UI shows «بدون خطة» plus the override earnings |
| Override saved at 14:00 branch time; sessions at 10:00 and 15:00 the same day | 10:00 session uses the previous value (or the plan); 15:00 session uses the new override |
| Client sends an `effectiveFrom` / backdated value | Not in the contract; a forced SQL insert with `effective_from` in the past is refused by RLS (`42501`) |
| Branch manager without `commissions.overrides.manage` saves an override | `FORBIDDEN`; nav item hidden; RLS refuses a forced insert (`42501`) |
| Branch manager granted `commissions.overrides.manage` saves a staff override for staff of another branch | `FORBIDDEN` / RLS `42501` |
| Owner tries to grant `commissions.overrides.manage` to a reception or staff member | Toggle hidden; forced save returns `PERMISSION_NOT_APPLICABLE` |
| Legacy `0024` plan version row (single tier in `commission_plan_versions`) resolved after `0026` | Migration `0026` backfills it into `commission_plan_tiers` and sets `tier_accumulator = 'sales_amount'`; resolves identically to 019 |
| Session on `2027-02-28T23:30+03:00` (Kuwait) vs UTC `2027-02-28T20:30Z`, and `2027-03-01T01:00+03:00` (UTC `2027-02-28T22:00Z`) | First belongs to Feb 2027, second belongs to Mar 2027 (branch-local month, D-10) |
| Two salaries on the same `effective_date` | Greater `recorded_at` wins (latest correction) |
| Branch 1 manager tries to view or insert salary for Branch 2 staff | Blocked by RLS (`0` rows read / `42501` on insert) |
| Reception / staff / accountant / viewer visits `/app/commissions/*` | Denied (`NoAccess`) and server functions return `FORBIDDEN` |

## Acceptance criteria (concrete numbers)

All 019 rows 1–16 MUST continue to pass unchanged (row 16 only changes shape to
`{ status: "no_plan", result }` with `totalMills = 0n`, Rule M0c), PLUS the following new concrete
cases:

| # | Scenario | Inputs | Expected (KWD) |
|---|---|---|---|
| 17 | **Fixed amount per session (Method 2)** | `baseFixedMills = 2.000`, 14 sessions (any net amounts) | `baseFixed = 28.000`, `total = 28.000` |
| 18 | **Q3 Progressive sales brackets (`excess`)** | Fixed thresholds: `5%` from `1,000.000`, `8%` from `2,000.000`; sales `3,000.000` | `50.000 + 80.000 = 130.000` |
| 19 | **Q3 Progressive sales brackets (3 tiers, partial)** | `5%` from `1,000`, `8%` from `2,000`, `12%` from `4,000`; sales `4,500.000` | `50.000 + 160.000 + 60.000 = 270.000` |
| 20 | **Q3 Progressive salary-multiple brackets** | Salary `500.000`; `5%` from `2×` (`1,000`), `10%` from `4×` (`2,000`); sales `2,500.000` | `50.000 + 50.000 = 100.000` |
| 21 | **Multi-tier `all_after`** | `5%` at `1,000`, `10%` at `2,000`; sales `1,500.000` → `75.000`; sales `2,000.000` → `200.000` | `75.000` / `200.000` |
| 22 | **Q4 Session-count bracket (%)** | `10%` after `20` sessions; 25 sessions × `30.000` | `5 × 30.000 × 10% = 15.000` |
| 23 | **Q4 Session-count ordering (different prices)** | `10%` after `2` sessions; 3 sessions ordered by time: `100.000`, `50.000`, `30.000` | Session #3 (`30.000`) × 10% = `3.000` |
| 24 | **Q4 Multi-bracket session-count (%)** | `10%` after `20`, `15%` after `30`; 35 sessions × `30.000` | `300 × 10% + 150 × 15% = 52.500` |
| 25 | **Q4 Session-count fixed reward** | `2.500`/session after `10` sessions; 13 sessions | `3 × 2.500 = 7.500` |
| 26 | **Method 4 Combination (Waleed example)** | `baseFixed = 2.000`/session + `10%` after `20` sessions; 25 sessions × `30.000` | `baseFixed 50.000 + tier 15.000 = 65.000` |
| 27 | **Method 4 Combination (base % + progressive brackets)** | `baseRate = 2%` + `5%` from `1,000`, `8%` from `2,000`; sales `3,000.000` | `baseRate 60.000 + tier 130.000 = 190.000` |
| 28 | **Q5 Per-service override (%) replaces plan & excluded from threshold** | Plan: `10%` `all_after` `1,000.000`. Service B override: `15%`. Lines: Service A `900.000` + Service B `200.000` | Qualifying = `900.000` (< `1,000` → tier `0.000`), override = `200.000 × 15% = 30.000`, total = `30.000` |
| 29 | **Q5 Per-service override (fixed) + staff-service precedence** | Service B company override `3.000`/session; Staff Huda override on Service B `5.000`/session; 2 sessions of Service B each; both staff have a plan assigned | Huda gets `10.000`; another staff member gets `6.000` |
| 30 | **Q2 Effective-dated salary on real DB** | Huda salary `450.000` (`2027-01-01`), raised to `500.000` (`2027-02-15`). Hair plan (`5%` excess over `2×` salary), Feb 2027 sales `1,600.000` | `pgSalarySource` returns `500.000` on `2027-02-28` → `30.000`; on `2027-01-31` returns `450.000` |
| 31 | **Real DB end-to-end (`pgCommissionSalesSource` + `pgSalarySource` + `pgCommissionPlanRepository`)** | Recorded `service_sessions` in `Asia/Kuwait` timezone, effective salary, multi-bracket plan, and service override | Matches exact KWD total; boundary session at `2027-03-01T00:30+03:00` counted in March, not February |
| 32 | **Isolation (`db/tests/isolation.sql`)** | Company A owner reads `0` rows from B's `commission_plan_tiers`, `service_commission_overrides`, `staff_salaries` and cannot insert into B; Branch 1 manager cannot read/insert Branch 2 `staff_salaries` or Branch 2 staff-specific overrides; reception reads `0` rows from all 3 tables; `UPDATE`/`DELETE` refused on all 3 tables; inserting a tier for a version committed in an earlier transaction is refused (`42501`); an override insert with a past `effective_from` is refused (`42501`); a Branch 1 manager **without** `commissions.overrides.manage` cannot insert any override, and **with** it cannot insert a Branch 2 staff override (`42501`) |
| 33 | **Override effective from the moment of change (Waleed decision 4)** | Branch `Asia/Kuwait`. Plan `10%`. Service B override `15%` saved `2027-03-10 14:00` local. Huda: Service B `100.000` at `10:00` and Service B `100.000` at `15:00` the same day | 10:00 line uses the plan (`10.000` in plan base); 15:00 line uses the override (`overrideMills = 15.000`); total `25.000` |
| 34 | **No plan, override still pays (Waleed decision 3)** | Huda has no plan. Service B override `3.000`/session. Lines: 2 × Service B, 1 × Service A | `{ status: "no_plan" }`, `overrideMills = 6.000`, `totalMills = 6.000`; UI shows «بدون خطة» with `6.000` |
| 35 | **Override permission (Waleed decision 1)** | Branch 1 manager without the grant → save override | `FORBIDDEN`; after the owner grants `commissions.overrides.manage`: service-wide override saved; staff override for a Branch 1 staff saved; for a Branch 2 staff → `FORBIDDEN` |

## Schema changes — `db/migrations/0026_commission_methods_and_salaries.sql` (idempotent)

- **Alter `public.commission_plan_versions`:**
  - `add column if not exists base_fixed_mills bigint check (base_fixed_mills > 0)`
  - `add column if not exists tier_accumulator text check (tier_accumulator in ('sales_amount', 'session_count'))`
  - Drop the 4 anonymous table-level check constraints from `0024` with an idempotent `do $$` loop
    over `pg_constraint` where `conrelid = 'public.commission_plan_versions'::regclass`,
    `contype = 'c'` and `conname ~ '^commission_plan_versions_check[0-9]*$'` (anchored regex, so
    column checks such as `commission_plan_versions_base_rate_bp_check` and the new named
    constraints never match). Expected names: `commission_plan_versions_check`, `_check1`,
    `_check2`, `_check3`; the loop must drop exactly 4 on a 0024 database (assert it in the
    integration test), because a silent no-op would leave the old single-tier pair checks rejecting
    every multi-tier version.
  - Backfill existing rows with `tier_mode is not null` to `tier_accumulator = 'sales_amount'`
    (requires running as migration owner, before adding the new constraints).
  - Add named check constraints (only if missing):
    - `commission_plan_versions_has_rule`: `check (base_rate_bp is not null or base_fixed_mills is not null or tier_mode is not null)`
    - `commission_plan_versions_tier_pair`: `check ((tier_mode is null) = (tier_accumulator is null))`
    - `commission_plan_versions_session_excess`: `check (tier_accumulator <> 'session_count' or tier_mode = 'excess')`
- **New table `public.commission_plan_tiers` (append-only):**
  - `(company_id uuid, id uuid default gen_random_uuid(), version_id uuid not null, tier_order smallint not null check (tier_order between 1 and 20), rate_bp integer check (rate_bp between 1 and 10000), fixed_mills bigint check (fixed_mills > 0), threshold_mills bigint check (threshold_mills >= 0), threshold_salary_multiple_milli integer check (threshold_salary_multiple_milli > 0), threshold_session_count integer check (threshold_session_count >= 0), primary key (company_id, id), unique (company_id, version_id, tier_order))`.
  - FK `(company_id, version_id) references public.commission_plan_versions(company_id, id)`.
  - `check (num_nonnulls(rate_bp, fixed_mills) = 1)`.
  - `check (num_nonnulls(threshold_mills, threshold_salary_multiple_milli, threshold_session_count) = 1)`.
  - `check (fixed_mills is null or threshold_session_count is not null)`.
  - Idempotent backfill from any pre-0026 `commission_plan_versions` row where `tier_mode is not null`
    and no row exists in `commission_plan_tiers` for `(company_id, version_id)`.
  - Grants: `select, insert` ONLY to `pospay_app`.
  - RLS `select`: `public.commission_plan_manager(company_id)`.
  - RLS `insert`: `public.commission_plan_manager(company_id) and exists (select 1 from
    public.commission_plan_versions v where v.company_id = commission_plan_tiers.company_id and
    v.id = commission_plan_tiers.version_id and v.created_at = now())` — tiers may only be added in
    the same transaction that created their version, so a committed (historical) version can never
    gain extra tiers. `0024` gives `created_at` the default `now()`, so `addVersion` must not pass an
    explicit `created_at`.
- **New table `public.service_commission_overrides` (append-only):**
  - `(company_id uuid, id uuid default gen_random_uuid(), service_id uuid not null, staff_id uuid, effective_from timestamptz not null default clock_timestamp(), override_kind text not null check (override_kind in ('rate_bp', 'fixed_mills', 'clear')), rate_bp integer check (rate_bp between 0 and 10000), fixed_mills bigint check (fixed_mills >= 0), created_by text not null, created_at timestamptz not null default clock_timestamp(), primary key (company_id, id))`.
  - FK `(company_id, service_id) references public.service_catalog(company_id, id)`.
  - FK `(company_id, staff_id) references public.staff_members(company_id, id)`.
  - Check constraints ensuring `rate_bp` is non-null iff `override_kind = 'rate_bp'`, `fixed_mills`
    is non-null iff `override_kind = 'fixed_mills'`, and both null when `'clear'`.
  - Index `(company_id, service_id, staff_id, effective_from desc, id desc)`.
  - `effective_from` is never sent by the application (Rule O5); `created_at` keeps the audit time.
  - Grants: `select, insert` ONLY to `pospay_app`.
  - RLS `select`: `(staff_id is null and public.commission_plan_manager(company_id)) or
    (staff_id is not null and public.commission_plan_assigner(company_id, staff_id))` — the same
    split as `insert`, so a Branch 1 manager reads `0` Branch 2 staff-specific rows (acceptance #32).
  - RLS `insert`: `created_by = public.current_app_user()` AND `effective_from between now() and clock_timestamp()` (no backdating, no future scheduling) AND `(staff_id is null and public.commission_override_manager(company_id) or staff_id is not null and public.commission_staff_override_manager(company_id, staff_id))`.
  - Helpers (`stable security definer set search_path = public`; `revoke all from public`, `grant execute to pospay_app`):
    - `public.commission_override_manager(_company uuid) returns boolean` = `has_company_role(_company, 'owner')` OR (caller holds a `branch_manager` membership in `_company` AND `has_permission(_company, 'commissions.overrides.manage')`).
    - `public.commission_staff_override_manager(_company uuid, _staff uuid) returns boolean` = owner, OR (`commission_override_manager(_company)` AND a `branch_manager` membership covering the staff member's branch — the same branch scope as `commission_plan_assigner`).
- **New table `public.staff_salaries` (append-only):**
  - `(company_id uuid, id uuid default gen_random_uuid(), staff_id uuid not null, salary_mills bigint not null check (salary_mills > 0), effective_date date not null, recorded_by text not null, recorded_at timestamptz not null default clock_timestamp(), primary key (company_id, id))`.
  - FK `(company_id, staff_id) references public.staff_members(company_id, id)`.
  - Index `(company_id, staff_id, effective_date desc, recorded_at desc)`.
  - Helper `public.salary_manager(_company uuid, _staff uuid) returns boolean` (`stable security definer set search_path = public` — identical branch scope to `commission_plan_assigner`; `revoke all from public`, `grant execute to pospay_app`).
  - Grants: `select, insert` ONLY to `pospay_app`.
  - RLS `select`: `public.salary_manager(company_id, staff_id)`.
  - RLS `insert`: `public.salary_manager(company_id, staff_id) and recorded_by = public.current_app_user()`.
- **Updated `db/tests/isolation.sql`:** one contiguous block with fixture ids `21000000-0000-4000-8000-…` proving
  every isolation assertion in acceptance #32.

## Contract (Zod input/output)

In `src/modules/commissions/contracts.ts`:

- `companyScope = z.object({ companyId: z.string().uuid() })`
- `monthStartSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/)`
- `isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
- `kwdAmountSchema = z.string().regex(/^\d{1,12}(\.\d{1,3})?$/)`
- `percentInputSchema = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/)` (converted to integer bp `0..10000`
  without floats via pure integer string parser in domain!)
- `salaryMultipleSchema = z.string().regex(/^\d{1,3}(\.\d{1,3})?$/)` (converted to integer
  `multipleMilli` without floats!)
- `planRulesInputSchema`:
  - `baseRatePercent: percentInputSchema.optional()`
  - `baseFixedKwd: kwdAmountSchema.optional()`
  - `tierSchedule: z.discriminatedUnion("accumulator", [salesTierScheduleSchema, sessionCountTierScheduleSchema]).optional()`
- `createPlanWithVersionInput`: `companyScope` + `{ name, effectiveMonth, rules }`
- `addPlanVersionInput`: `companyScope` + `{ planId, effectiveMonth, rules }`
- `assignPlanInput`: `companyScope` + `{ staffId, planId, effectiveMonth }`
- `saveServiceOverrideInput`: `companyScope` + `{ serviceId, staffId: z.string().uuid().nullable().optional(), override: discriminatedUnion("kind", ["rate_bp", "fixed_mills", "clear"]) }` (no effective date: the database sets `effective_from`, Rule O5)
- `StaffCommissionResult`: `{ status: "ok"; plan; result } | { status: "no_plan"; result }` (Rule M0c)
- In `src/modules/permissions/`: add `"commissions.overrides.manage"` per Rule O4.
- `recordSalaryInput`: `companyScope` + `{ staffId, salaryKwd: kwdAmountSchema, effectiveDate: isoDateSchema }`
- DTOs (`CommissionPlansScreenDto`, `ServiceOverridesScreenDto`, `StaffSalariesScreenDto`): all
  money fields serialized as decimal/mills strings, never JS `number`.

## Permissions (who can, who cannot)

| Action | owner | branch_manager | reception / staff / accountant / viewer | other company |
|---|---|---|---|---|
| View & create plans / add versions | ✓ | ✓ | — | — |
| Assign plan to staff | ✓ | ✓ own branch | — | — |
| Read service-wide overrides | ✓ | ✓ | — | — |
| Read staff-specific overrides | ✓ | ✓ own branch | — | — |
| Write service-wide overrides | ✓ | only with `commissions.overrides.manage` (granted by owner) | — | — |
| Write staff-specific overrides | ✓ | only with `commissions.overrides.manage`, own branch staff | — | — |
| Hold `commissions.overrides.manage` | always | grantable (default off) | never (not grantable) | — |
| Read & record staff salaries (Q2) | ✓ all staff | ✓ own branch only | — | — |
| Read sales lines for commission calculation | ✓ all branches | ✓ own branch only | — | — |

## Tests

- **Domain (`src/modules/commissions/domain/`):**
  - `compute-commission.test.ts`: ALL 019 rows 1–15 preserved + new rows 17–29, 33 (per-line override by `occurredAt`) and 34 (`rules = null`) (`test.each`).
  - `override.test.ts`: per-line resolution (O1/O5): staff row beats service row, `'clear'` falls through, rows with `effective_from` after the line are ignored, tie broken by `id`.
  - `plan.test.ts`: validation of all 4 methods, combinations, ascending bracket enforcement,
    `PLAN_EMPTY`, `PLAN_INVALID`, integer percent-to-bp & multiple-to-milli parsers (zero floats!).
- **Use cases (fake ports):**
  - `compute-staff-commission.test.ts`: resolves plan + overrides + salary (called only when
    `salary_multiple` is present); no plan returns `{ status: "no_plan", result }` (row 16 with `totalMills = 0n`; row 34 with override earnings).
  - `manage-plans.test.ts`, `manage-overrides.test.ts` (no effective date accepted; `FORBIDDEN` without the permission), `manage-salaries.test.ts`.
  - Permissions module: `commissions.overrides.manage` default off for `branch_manager`, on for `owner`, `PERMISSION_NOT_APPLICABLE` for other roles.
- **Integration (`POSPAY_TEST_DATABASE_URL`, fixture ids `21000000-0000-4000-8000-…`, double-apply `0026`):**
  - Multi-tier plan creation, legacy 0024 version backfill resolution, service & staff-service
    override resolution and `'clear'`, mid-day override effect (acceptance #33: the override row
    with a fixed `effective_from` of `2027-03-10 14:00` local is inserted as the migration owner
    before `set role pospay_app`, since the app path cannot set it; a separate case saves through
    the app and checks `effective_from` equals the save time), backdated insert refused, override permission (acceptance #35), branch-scoped salary recording/reading, real
    `pgCommissionSalesSource` timezone boundary test (Kuwait UTC+3), end-to-end
    `computeStaffCommission` over real `service_sessions` + `staff_salaries` (acceptance #30–#31).
- **UI component tests:**
  - `plans-page.test.tsx`: method picker toggles, adding/removing brackets, live preview calculator
    matches exact KWD output, «بدون خطة» badge shown for unassigned staff (with override earnings when present).
  - `overrides-page.test.tsx`: no effective-date input; history shows `effective_from` in branch local time.
  - `salaries-page.test.tsx`: recording effective-dated salary and viewing history.
  - `navigation.test.ts` & `area-guard.test.ts`: `/app/commissions/*` visible to `owner` and
    `branch_manager`, hidden/blocked for `reception`, `staff`, `accountant`, `viewer`;
    `/app/commissions/overrides` hidden for a branch manager without `commissions.overrides.manage`.
- **SQL:** `0026` applied twice on `pospay_test`; `db/tests/isolation.sql` passes.

## Waleed decisions — 2026-11-19 (open questions)

1. **Who writes overrides:** the owner always. The owner can grant the new permission
   `commissions.overrides.manage` to any branch manager on `/app/permissions` (default off).
   Holders manage service-wide overrides (company-wide) and staff overrides for staff of their own
   branch(es) (Rule O4).
2. **Fixed amount per session after the Nth session:** yes, part of the methods menu (Rule M5,
   acceptance #25).
3. **Staff with no plan but a matching override:** they earn the override (staff+service or
   service-wide) for those lines; other lines earn `0`; the statement still flags «بدون خطة»
   (`NO_PLAN`) next to the override earnings (Rules M0c, M9; acceptance #34).
4. **Override effective date:** from the moment of the change (date and time), not the month
   start. Sessions before the change use the old value, sessions from the change onward use the
   new value, compared by `occurred_at` against `effective_from`; history stays immutable
   (Rule O5; acceptance #33).

## Still to confirm

- Overrides cannot be backdated or scheduled for a future time (Rule O5 sets `effective_from` to
  the save time). Confirm that no backdating is needed for corrections.

## Out of scope (next slice — Monthly Statements)

- Monthly statement lifecycle (draft → branch manager review → owner approval within 5 days,
  reminders on days 3 & 5 — D-17, D-54).
- Returns & post-approval corrections (D-14, ق-2).
- Shared sessions splitting (ق-3) and package session rounding (ق-5).
- Tips column on statement (D-36) and staff self-view live estimate (`/me/commission`, D-28, D-46).
