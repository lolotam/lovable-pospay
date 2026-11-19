# 019 Implementation Plan

**Goal:** deliver `docs/specs/019-commissions-core/spec.md` as one PR: commission engine for the
approved plan rules (D-50, D-55), plan configuration tables (migration `0024`), ports and a plan
repository. No UI, no server functions, no `service_sessions` adapter.

**Executors:** Kimi (K3.1 Pro) implements tasks 1–5 without committing. Claude Code (acting for
Lovable) reviews the diff, recomputes the acceptance rows by hand, runs the gates, fixes findings,
commits, opens the PR and handles bots. Waleed applies `0024` in production before the PR merges
(autoDeploy is on: a merge to `main` deploys at once).

**Rules for every task:** `domain/` imports only `@/shared/kernel/*` (no Zod, no pg, no clock, no
uuid, no other module); Arabic JSDoc on every export in `domain/` and `ports/`; money is `bigint`
mills, never `number`; rates are `bigint` basis points; files under 400 lines, functions under 60;
no closing comments, no `FIXME`; `.server.ts` only in `persistence/`; every query through
`withUser()`; unknown rules are `TODO(spec)` and never guessed. Do not touch `service_sessions`,
the `services` module, `supabase/migrations/`, or migration numbers other than `0024`.

**Branch:** `feat/019-commissions-core`, one PR into `main`.

---

### Task 1: Migration 0024

**Files:** create `db/migrations/0024_commission_plans.sql`; modify `db/tests/isolation.sql`.

- [ ] Tables `commission_plans`, `commission_plan_versions`, `staff_commission_plans` exactly as
  the spec "Schema changes", with the resolution index.
- [ ] `commission_plan_manager(uuid)` and `commission_plan_assigner(uuid, uuid)`:
  `language sql stable security definer set search_path=public`, `revoke all ... from public`,
  `grant execute ... to pospay_app`, `create or replace`.
- [ ] `grant select, insert` only; `enable row level security`; `drop policy if exists` then
  `create policy` for select and insert per the spec, insert checks `created_by` /
  `assigned_by = public.current_app_user()`.
- [ ] Isolation: one contiguous block appended before the final `rollback` of
  `db/tests/isolation.sql` covering the cases listed in the spec. Use fixture ids that start with
  `19000000-` so they never clash with other threads.
- [ ] Claude Code: apply twice on `pospay_test`, run `db/tests/isolation.sql`.

### Task 2: Domain engine

**Files:** create `src/modules/commissions/domain/plan.ts` (types + `validatePlanVersion` +
`isMonthStart`), `src/modules/commissions/domain/period.ts` (`CommissionPeriod {year, month}`,
`lastDayOfPeriod`, `periodStart`), `src/modules/commissions/domain/compute-commission.ts`
(`computeCommission(rules, lines, salaryMills)` and `roundCommission`), and tests next to each.

- [ ] `computeCommission`:
  - reject any line with `netMills < 0n` → `CommissionError("INVALID_LINE")`;
  - `qualifyingSalesMills` = sum of lines;
  - base numerator = sales × `baseRateBp`;
  - threshold = fixed mills, or `salary × multipleMilli / 1000` (salary-linked with
    `salaryMills === null` → `CommissionError("SALARY_REQUIRED")`);
  - `excess`: tier numerator = `max(0, sales − threshold) × rateBp`;
    `all_after`: `sales >= threshold ? sales × rateBp : 0`;
  - each numerator goes through `roundCommission` once (floor to the mill via kernel
    `percentOf`-style division, marked `TODO(spec)` Q1); total = base + tier.
- [ ] `validatePlanVersion` returns `PLAN_EMPTY` / `PLAN_INVALID` reasons from the spec edge
  cases; `isMonthStart` checks day 1.
- [ ] Tests: one `test.each` table holding spec acceptance rows 1–12 and 15 (plans built from the
  four D-55 examples with constants named after them), lines split across several sessions in at
  least rows 3, 7 and 11; `SALARY_REQUIRED`; `INVALID_LINE`; validation table; last-day table
  (2027-01 → 31, 2027-02 → 28, 2028-02 → 29, 2027-04 → 30).

### Task 3: Ports

**Files:** create `src/modules/commissions/ports/sales-source.ts`,
`src/modules/commissions/ports/salary-source.ts`,
`src/modules/commissions/ports/plan-repository.ts`.

- [ ] Interfaces from the spec "Contract". `plan-repository.ts` also defines
  `ResolvedPlan { planId, planName, versionId, version, rules: PlanRules }` and the input types for
  `createPlan(name)`, `addVersion(planId, effectiveMonth, rules)`,
  `assign(staffId, planId, effectiveMonth)`, `resolve(staffId, period)`.

### Task 4: Use case

**Files:** create `src/modules/commissions/use-cases/compute-staff-commission.ts` and test.

- [ ] `computeStaffCommission(deps, { companyId, staffId, period })` → `{ status: "no_plan" }` or
  `{ status: "ok", plan: ResolvedPlan, result: CommissionResult }`.
- [ ] Calls `salaryOn(lastDayOfPeriod(period))` only when the tier is salary-linked.
- [ ] Tests with in-memory fakes: spec rows 13, 14, 16; salary port not called for the lash and
  massage plans; date argument is the last day.

### Task 5: Persistence and module API

**Files:** create `src/modules/commissions/persistence/commission-plan.server.ts` and
`commission-plan.integration.test.ts`; create `src/modules/commissions/index.server.ts`; modify
`src/modules/commissions/index.ts`.

- [ ] `pgCommissionPlanRepository(db, userId, companyId)` implements `CommissionPlanRepository`;
  each write validates with `validatePlanVersion` / `isMonthStart`, inserts, and writes the
  matching `audit_log` row in the same `withUser()` transaction; `addVersion` sets `version` to
  `max(version)+1` for the plan under `pg_advisory_xact_lock` on the plan id.
- [ ] `resolve` implements the resolution rule from the spec in one query; `bigint` columns are
  read as strings and converted with `BigInt(...)`.
- [ ] `index.ts` exports browser-safe types and `computeStaffCommission`; `index.server.ts` exports
  the pg repository.
- [ ] Integration test (skipped without `POSPAY_TEST_DATABASE_URL`, refuses any URL that is not
  `127.0.0.1/pospay_test`; loads `0001_tenancy_foundation`, `0002_attendance`,
  `0024_commission_plans` explicitly; fixture ids `19000000-...`; cleans its rows in `afterAll`):
  cases listed in the spec "Tests".

### Task 6: Close

- [ ] Gates: `bun run test` with `POSPAY_TEST_DATABASE_URL`, `tsc --noEmit -p .`, `eslint .`
  (baseline 0 errors / 8 warnings), `NITRO_PRESET=node-server bun run build`.
- [ ] PR body lists `0024` as the migration Waleed applies first, and the open questions.
