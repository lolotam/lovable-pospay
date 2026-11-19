# 019 — commissions: core engine for the approved plan rules

Written 2026-11-19 11:51 Kuwait. Source of truth: `docs/PRD-phase1.ar.md` §6 (D-14, D-28, D-36,
D-37, D-38, D-50, D-55) and §12.1 (ق-2, ق-3, ق-5).

## Requirement

Phase 1's core goal (PRD §1) is a monthly commission statement computed automatically from the
recorded service sessions. `src/modules/commissions/` holds only a placeholder today.

This slice ships the **first, independent piece**: a pure, fully tested commission engine for the
plan rules the PRD already approves, the plan configuration tables it needs (migration `0024`),
and ports for the data it reads (sales lines, salary). It does **not** read `service_sessions`:
the session writer is changing in parallel (thread 018, migration `0023`) and net-after-discount
(D-14) is not stored yet. A later slice plugs real adapters into the ports.

Salon example: on 1 March the owner assigns the "Nails" plan to Huda (10% of all sales once her
sales reach 3× her salary). At the end of March the engine receives Huda's 42 net session amounts
(1,850.000 KWD in total) and her salary on 31 March (600.000) and returns 185.000 KWD.

## Business rules (cite PRD D-xx / ق-x)

Only rules marked ✅ in the PRD are implemented. Anything else is listed under "Open questions".

- **R1 (D-14).** Commission is computed on the **net line amount after discount**. Tips are not
  part of the base (D-36: tips are a separate column, outside this engine). The engine receives
  net amounts from a port; it never computes discounts.
- **R2 (D-28).** One pure function computes a staff member's commission for one period from that
  period's lines. The live estimate (later slice) is the same function on the draft period.
- **R3 (D-17).** A period is one calendar month. Which month a session belongs to is the branch's
  local date of the session (D-10); this is the sales port's job, not the engine's.
- **R4 (D-50).** A plan = an optional **base** (always added) + optional **tiers**. This slice
  supports **at most one tier** (multi-tier semantics → open question Q3).
- **R5 (D-50).** The accumulator is the **sales amount** in this slice (session-count accumulator →
  open question Q4).
- **R6 (D-50).** A tier threshold is either a **fixed amount** or a **multiple of the salary**; a
  salary-linked threshold uses the salary **on the last day of the period**.
- **R7 (D-55 §6.3).** A tier applies in one of two modes, both needed by the approved examples:
  - `excess` — the tier rate applies only to the part of the sales **above** the threshold
    (hair specialist, lash specialist).
  - `all_after` — once sales **reach** the threshold (≥), the tier rate applies to **all** sales
    of the period; below it, nothing (nail specialist). "Reach" is inclusive: ق-2 states that
    sales of exactly 1,800.000 with salary 600.000 earn 180.000.
- **R8 (D-55).** The base is a percentage of every session's net amount (massage therapist, 1%).
- **R9 (D-50).** Every part is switched on or off only by a **new plan version**. Versions are
  append-only; a correction is a new version, never an update.
- **R10 (D-38, partial).** A plan version and a staff plan assignment take effect from the
  **first day of a month** (`effective_month`). A change can therefore only cover a whole period;
  "from a specific date inside the month" is open question Q6. Since no statement exists yet, the
  D-38 condition "whole period only while the statement is draft" is enforced by the statements
  slice.
- **R11 (D-14 / D-38).** Attendance and ratings never change commission; the engine takes no
  attendance or rating input.
- **R12.** Rates are integer basis points (`10000` = 100%, `500` = 5%). Salary multiples are
  integer thousandths (`2000` = 2×). Money is `bigint` mills everywhere (1 KWD = 1000 mills).
- **R13 (rounding, provisional — open question Q1).** Each component (base, tier) is computed
  exactly over the whole period and rounded **down** to the mill once, using the existing kernel
  `percentOf` convention. Total = base + tier. The rounding lives in one function marked
  `TODO(spec)` so a different answer changes one place.
- **R14.** Package sale commission (`package_sale`) is disabled for the D-55 plans; this engine has
  no package-sale component.

## Edge cases

- No lines in the period → total 0 (with the plan still reported).
- No plan assigned for the period → result `NO_PLAN` (not an error, not 0 silently); the statement
  slice decides how to show it (open question Q8).
- Salary-linked tier but no salary on the last day → `SALARY_REQUIRED` error; nothing is computed.
- A line with a negative amount → `INVALID_LINE` (returns are out of scope; ق-2 is pending).
- Plan version with neither base nor tier → rejected on save (`PLAN_EMPTY`).
- Rate outside `1..10000` bp, multiple ≤ 0, fixed threshold < 0, or a tier missing its threshold →
  rejected on save (`PLAN_INVALID`).
- Two versions for the same month → the higher `version` number wins (correction).
- An assignment or version dated in the middle of a month → rejected (`effective_month` must be the
  1st; SQL check and domain check).
- Sales exactly on the threshold: `excess` → 0 tier commission; `all_after` → full tier commission.

## Acceptance criteria (concrete numbers)

All amounts KWD with 3 decimals; the tests use mills. Rows 1–11 come from PRD §6.3 (D-55) and
ق-2; rows 12–13 check structure rules (base always added, salary on the last day), not a PRD
example. Rows marked (R13) depend on the provisional rounding.

| # | Plan (PRD) | Salary | Sales lines | Expected |
|---|---|---|---|---|
| 1 | Hair: 5% `excess` over 2× salary | 500.000 | total 1,000.000 | 0.000 (threshold 1,000.000) |
| 2 | Hair | 500.000 | total 999.999 | 0.000 |
| 3 | Hair | 500.000 | total 1,600.000 | 30.000 (= 5% × 600.000) |
| 4 | Hair (R13) | 500.000 | total 1,000.019 | 0.000 (exact 0.00095, rounded down) |
| 5 | Hair (R13) | 500.000 | total 1,000.020 | 0.001 |
| 6 | Nails: 10% `all_after` 3× salary | 600.000 | total 1,799.999 | 0.000 |
| 7 | Nails (ق-2 figure) | 600.000 | total 1,800.000 | 180.000 |
| 8 | Nails | 600.000 | total 2,500.000 | 250.000 |
| 9 | Lashes: 20% `excess` over fixed 5,000.000 | none needed | total 5,000.000 | 0.000 |
| 10 | Lashes | none needed | total 6,250.000 | 250.000 (= 20% × 1,250.000) |
| 11 | Massage: base 1% per session | none needed | 30.000 + 45.000 + 25.000 | 1.000 (0.300 + 0.450 + 0.250) |
| 11b | Massage (R13) | none needed | 12.345 + 7.655 | 0.200 (period rounding; per-session rounding would give 0.199) |
| 12 | Base 1% + hair tier (structure) | 500.000 | total 1,600.000 | base 16.000 + tier 30.000 = 46.000 |
| 13 | Hair, salary changes mid-month | 450.000 until 14 Feb 2027, 500.000 from 15 Feb | total 1,600.000 in Feb 2027 | uses 500.000 (salary on 28 Feb) → 30.000 |
| 14 | Hair tier, salary port returns nothing | — | any | `SALARY_REQUIRED` |
| 15 | Lashes, no lines | — | none | 0.000 |
| 16 | Staff without assignment | — | any | `NO_PLAN` |

Each acceptance row is one `test.each` row; row totals may be split across several lines in the
test to prove the engine sums lines (e.g. row 3 as 1,000.000 + 600.000).

## Schema changes (tables, RLS, grants, isolation test)

Migration `db/migrations/0024_commission_plans.sql` (idempotent, `create ... if not exists`,
`create or replace`, `drop policy if exists`). No change to `service_sessions` or any table of
another module. No salary table (salaries are owner-only under D-46; where they live is Q2).

```sql
create table if not exists public.commission_plans (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, id),
  unique (company_id, name)
);

create table if not exists public.commission_plan_versions (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  plan_id uuid not null,
  version integer not null check (version >= 1),
  effective_month date not null check (extract(day from effective_month) = 1),
  base_rate_bp integer check (base_rate_bp between 1 and 10000),
  tier_mode text check (tier_mode in ('excess','all_after')),
  tier_rate_bp integer check (tier_rate_bp between 1 and 10000),
  tier_threshold_mills bigint check (tier_threshold_mills >= 0),
  tier_salary_multiple_milli integer check (tier_salary_multiple_milli > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, id),
  unique (company_id, plan_id, version),
  foreign key (company_id, plan_id) references public.commission_plans(company_id, id),
  check (base_rate_bp is not null or tier_mode is not null),
  check ((tier_mode is null) = (tier_rate_bp is null)),
  check (tier_mode is null
         or (tier_threshold_mills is null) <> (tier_salary_multiple_milli is null)),
  check (tier_mode is not null
         or (tier_threshold_mills is null and tier_salary_multiple_milli is null))
);

create table if not exists public.staff_commission_plans (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  plan_id uuid not null,
  effective_month date not null check (extract(day from effective_month) = 1),
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  primary key (company_id, id),
  foreign key (company_id, staff_id) references public.staff_members(company_id, id),
  foreign key (company_id, plan_id) references public.commission_plans(company_id, id)
);
```

- Index `staff_commission_plans(company_id, staff_id, effective_month desc, assigned_at desc)`.
- Resolution for month `M`: the assignment row with the greatest `(effective_month, assigned_at)`
  where `effective_month <= M`; then that plan's version with the greatest
  `(effective_month, version)` where `effective_month <= M`.
- Helper functions (`language sql stable security definer set search_path=public`, `revoke all
  ... from public`, `grant execute ... to pospay_app`):
  - `commission_plan_manager(_company uuid)` = `has_company_role(_company,'owner') or
    has_company_role(_company,'branch_manager')` (D-38: the manager changes plans; see Q7).
  - `commission_plan_assigner(_company uuid, _staff uuid)` = owner, or a `branch_manager`
    membership whose `branch_id` is null or equals the staff member's `branch_id`.
- Grants: `select, insert` on the three tables to `pospay_app`. **No `update`, no `delete`**
  (append-only, R9).
- RLS (enable on all three):
  - `commission_plans` / `commission_plan_versions`: select and insert when
    `commission_plan_manager(company_id)`; insert also requires `created_by =
    current_app_user()`.
  - `staff_commission_plans`: select when `commission_plan_manager(company_id)`; insert when
    `commission_plan_assigner(company_id, staff_id)` and `assigned_by = current_app_user()`.
  - Reception, staff, accountant and viewer read nothing (D-46: reception and staff see only
    their own commission amounts, which come with the statements slice).
- Writes add an `audit_log` row (`commission_plan.created`, `commission_plan.version_added`,
  `commission_plan.assigned`) in the same transaction.
- `db/tests/isolation.sql`: **one contiguous block** (thread 018 edits the same file) that seeds a
  B plan, version and assignment, then proves: owner A reads 0 rows of B in all three tables and
  cannot insert a row for company B; branch manager of B branch 1 cannot assign B staff of another
  branch; a B `reception` member reads 0 rows; `update` and `delete` fail with permission denied.

## Contract (Zod input/output)

No server function in this slice, so no Zod contract yet; the plan builder UI slice (D-35) adds
`src/modules/commissions/contracts.ts`. Domain validation (`validatePlanVersion`) guards the
repository input instead. Money crosses the port as `bigint` mills; when it is sent to a client
later it travels as a string.

Domain types (in `src/modules/commissions/domain/`):

```ts
type TierMode = "excess" | "all_after";
type TierThreshold =
  | { kind: "fixed"; mills: Mills }
  | { kind: "salary_multiple"; multipleMilli: bigint };
interface PlanTier { mode: TierMode; rateBp: bigint; threshold: TierThreshold }
interface PlanRules { baseRateBp: bigint | null; tier: PlanTier | null }
interface SalesLine { sessionId: string; netMills: Mills }
interface CommissionResult {
  qualifyingSalesMills: Mills;
  thresholdMills: Mills | null;
  baseMills: Mills;
  tierMills: Mills;
  totalMills: Mills;
}
```

Ports (in `src/modules/commissions/ports/`):

- `CommissionSalesSource.listLines(companyId, staffId, period)` → `SalesLine[]` — net after
  discount, tips excluded, one performer, sessions whose branch-local date falls in the period.
  No production adapter in this slice.
- `SalarySource.salaryOn(companyId, staffId, date)` → `Mills | null` — salary on that date. No
  production adapter in this slice (Q2).
- `CommissionPlanRepository` — `createPlan`, `addVersion`, `assign`, `resolve(staffId, month)`;
  implemented in `persistence/commission-plan.server.ts` through `withUser()`.

## Permissions (who can, who cannot)

| Action | owner | branch_manager | reception | staff | accountant / viewer | other company |
|---|---|---|---|---|---|---|
| Create plan / add version | ✓ | ✓ | — | — | — | — |
| Read plans and versions | ✓ | ✓ | — | — | — | — |
| Assign plan to staff | ✓ | ✓ own branch (or company-wide manager) | — | — | — | — |
| Read assignments | ✓ | ✓ | — | — | — | — |
| Compute commission (use case) | through the ports; exposed by the statements slice | | | | | — |

## Tests

- Domain (`src/modules/commissions/domain/*.test.ts`, vitest, no DB): one `test.each` table with
  acceptance rows 1–15; validation cases for every `PLAN_INVALID` / `PLAN_EMPTY` reason;
  `effective_month` must be the 1st; last-day-of-month helper (31 Jan, 28 Feb 2027, 29 Feb 2028,
  30 Apr).
- Use case (`use-cases/compute-staff-commission.test.ts`, in-memory fakes of the three ports):
  rows 13, 14, 16; the salary port is asked for the last day of the month; the salary port is
  **not** called when the plan has no salary-linked tier; resolution picks the latest version and
  assignment.
- Integration (`persistence/commission-plan.integration.test.ts`, `POSPAY_TEST_DATABASE_URL`
  only, loads migrations `0001`, `0002`, `0024` explicitly, unique fixture ids with prefix
  `19000000-`): owner creates plan + version, branch manager assigns own-branch staff, other-branch
  manager refused, reception reads 0 rows, `update` refused, audit rows written, `resolve` returns
  the corrected version.
- SQL: `0024` applied twice on `pospay_test`; `db/tests/isolation.sql` passes.

## Open questions for Waleed

Nothing below is implemented. Defaults are what this slice does today.

1. **Q1 Rounding.** Commission percentages produce fractions of a fils. Round down or to the
   nearest fils? Once per period (default: down, once per component) or per session? Example:
   massage 1% on 12.345 + 7.655 → 0.200 per period, 0.199 per session.
2. **Q2 Salary source.** Salaries are owner-only (D-46) and stored nowhere yet. Who records them,
   where, and with what history (needed for "salary on the last day of the period")? Example: Huda's
   salary rises from 450 to 500 on 15 February — the February threshold uses 500.
3. **Q3 Several tiers.** "Each tier replaces the one before" (D-50): in `excess` mode, is it
   brackets (5% from 1,000 to 2,000, 8% above 2,000) or one rate on everything above the highest
   reached threshold? This slice allows one tier.
4. **Q4 Session-count accumulator (D-50).** When the threshold counts sessions, what does the rate
   apply to — the sales of sessions after the Nth, all sales, or a fixed amount per session?
5. **Q5 Service and staff commission values (D-37).** Is the per-service value a percentage or a
   fixed amount? Does it replace the plan for that line or add to it? Does a service that "does
   not count in thresholds" still earn the base rate?
6. **Q6 Mid-period plan change "from a date" (D-38).** How do thresholds split when a plan changes
   on the 15th — two half-month thresholds, or one month threshold with lines priced by the plan
   of their day? This slice accepts changes from the 1st of a month only.
7. **Q7 Who edits plans.** Plans are company-wide. May any branch manager create or change them,
   or only the owner (managers only assign)? Default: owner and branch managers.
8. **Q8 Staff without a plan.** Show 0 or flag "no plan" on the statement? Default: `NO_PLAN`.
9. **Pending client decisions (not implemented):** ق-2 correction after approval, ق-3 shared
   sessions, ق-5 package rounding (the engine takes each session's net amount as given).

## Next slices (out of scope here)

1. Sales adapter over `service_sessions` after 018 lands (net after discount, branch-local month).
2. Salary records and the salary adapter (after Q2).
3. Returns and corrections (D-14, ق-2): reverse in the same draft period, correction line in the
   next period after approval; per-session attribution using the D-50 order (session time, then
   recording time).
4. Shared sessions (ق-3), package session values (ق-5), service/staff overrides (D-37, Q5).
5. Monthly statement: draft, manager review, owner approval within 5 days, reminders on days 3
   and 5 (D-17, D-54), tips column (D-36), audit of approver and time (acceptance §12 #3).
6. Plan builder screen from blocks (D-35) with server functions and Zod contracts.
7. Staff "my commission" live estimate (D-28, D-46).
