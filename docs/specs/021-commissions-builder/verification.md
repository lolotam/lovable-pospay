# 021 Verification — multi-method commissions, salaries, overrides, plan builder UI

2026-11-20, branch `feat/020-021-session-controls-and-commissions`, head `bf1e9ad`.
Gates run by the Phase 4A implementer on a fresh disposable container.

## Gate environment

```
docker run -d --name pospay-020-final \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pospay_test \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 127.0.0.1:55520:5432 postgres:16-alpine
# roles anon + authenticated created, db/migrations copied into the container
```

`POSPAY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55520/pospay_test`

## Local gates (all exit 0)

| Gate | Command | Exit | Output |
|---|---|---|---|
| Migrations `0001`–`0026` in order | `docker exec pospay-020-final psql -U postgres -d pospay_test -v ON_ERROR_STOP=1 -q -f <each of 27 files>` | 0 | `ALL_MIGRATIONS_OK` (only idempotency `NOTICE: … does not exist, skipping` lines) |
| Second apply of `0025` + `0026` | same psql form, files re-applied | 0 | `SECOND_APPLY_OK` (notices `relation … already exists, skipping` — `0026` proved idempotent) |
| SQL suites | `db/tests/invitations.sql`, `db/tests/isolation.sql`, `db/tests/phone-isolation.sql`, `db/tests/platform-isolation.sql` | 0 | `invitations PASS`, `isolation: PASS`, `phone isolation: PASS`, `PASS platform isolation` |
| Typecheck | `bun run tsc --noEmit` | 0 | (no output) |
| Lint | `bunx eslint .` | 0 | `✖ 8 problems (0 errors, 8 warnings)` — the pre-existing baseline |
| Test suite | `bun run test` | 0 | `Test Files  125 passed \| 1 skipped (126)` · `Tests  893 passed \| 7 skipped (900)` · `Duration  289.66s` |
| Build | `NITRO_PRESET=node-server bun run build` | 0 | `✓ built in 3.42s` · `Generated .output/nitro.json` |

The container was removed after the gates.

## Acceptance criteria → tests

### 019 rows 1–15 preserved unchanged

| Proof | Location |
|---|---|
| Rows 1–15 as one parametrized suite | `src/modules/commissions/domain/compute-commission.test.ts` → `computeCommission acceptance criteria (019 rows preserved) > acceptance row $row` (`test.each` over all rows) |

**Result: PASS.**

### Row 16 — shape change to `{ status: "no_plan", result }` with `totalMills = 0n` (Rule M0c)

| Proof | Location |
|---|---|
| `no_plan` carries a zero result | `src/modules/commissions/use-cases/compute-staff-commission.test.ts` → `acceptance row 16 reports no_plan with a zero result` |

**Result: PASS.** (This is the only intended change to a 019 expectation.)

### Rows 17–27 — new methods (spec table numbers kept in the test names)

| Row | Test (`src/modules/commissions/domain/compute-commission-methods.test.ts`) |
|---|---|
| 17 — fixed amount per session | `row 17: fixed amount per session` |
| 18 — two progressive brackets (`excess`) | `row 18: two progressive brackets` |
| 19 — three brackets, partial top | `row 19: three brackets, partial top` |
| 20 — salary-multiple brackets | `row 20: salary-multiple brackets` |
| 21 — `all_after` first and second bracket | `row 21a: step-up first bracket` / `row 21b: step-up second bracket` |
| 22 — session-count rate bracket | `row 22: session-count rate bracket` |
| 23 — session-count ordering by time | `row 23: session-count ordering` |
| 24 — multi-bracket session count | `row 24: multi-bracket session count` |
| 25 — session-count fixed reward | `row 25: session-count fixed reward` |
| 26 — fixed per session + session-count rate (combination) | `row 26: fixed per session plus session-count rate` |
| 27 — base % + progressive brackets (combination) | `row 27: base rate plus progressive brackets` |

Rows 18–27 run as one `test.each` block (`$name`); every row asserts the exact KWD total from the spec table. **Result: PASS.**

### Row 28 — per-service override replaces the plan and leaves the threshold

`src/modules/commissions/domain/compute-commission-methods.test.ts` → `row 28: per-service override replaces the plan and leaves the threshold` (qualifying `900.000` < threshold → tier 0; override `30.000`; total `30.000`). **Result: PASS.**

### Row 29 — staff-service override beats the service-wide override

`src/modules/commissions/domain/compute-commission-methods.test.ts` → `row 29: staff-service override beats the service-wide override` (Huda `10.000`, other staff `6.000`). **Result: PASS.**

### Row 30 — effective-dated salary on the real DB (`pgSalarySource`)

| Proof | Location |
|---|---|
| Salary raised mid-February resolves to `500.000` on Feb 28 → total `30.000`; `450.000` on Jan 31 | `src/modules/commissions/persistence/commissions-builder.integration.test.ts` → `computes the salary-linked plan on real February sales with the raised salary (#30)` |

**Result: PASS.**

### Row 31 — real `pgCommissionSalesSource` timezone boundary (Kuwait UTC+3)

| Proof | Location |
|---|---|
| Boundary session at `2027-03-01T00:30+03:00` counts in March, not February | `src/modules/commissions/persistence/commission-overrides.integration.test.ts` → `counts a Kuwait-local boundary session in March, not February (#31)` |

**Result: PASS.**

### Row 32 — isolation (acceptance #32)

| Proof | Location |
|---|---|
| Whole block: company A reads 0 rows of B's `commission_plan_tiers` / `service_commission_overrides` / `staff_salaries` and cannot insert into B; tier insert for a version committed in an earlier transaction refused; duplicate/`tier_order 0` tier refused; backdated and scheduled override inserts refused (no `effective_from` accepted); salary audit `staff_salary.recorded` written by the trigger; salary inside/before a closed month refused; no `UPDATE`/`DELETE` on all three tables; branch 1 manager reads/writes own-branch salary only and a spoofed `recorded_by` is refused; ungranted manager cannot write any override; granted manager writes service-wide + own-branch staff overrides but not branch 2 staff; reception reads/writes nothing; company A salary write works in A while B stays invisible | `db/tests/isolation.sql`, Spec 021 isolation block, lines 954–1198, fixture ids `21000000-0000-4000-8000-…` |
| Branch-scoped salary reads/writes + audit at the DB level | `src/modules/commissions/persistence/commissions-builder.integration.test.ts` → `scopes salaries by branch and audits at the database level (#32)` |

**Result: PASS** (`isolation: PASS`).

### Row 33 — override effective from the save moment (Waleed decision 4)

| Proof | Location |
|---|---|
| Domain: 10:00 line on the plan, 15:00 line on the override, total `25.000` | `src/modules/commissions/domain/compute-commission-methods.test.ts` → `row 33: override effective from the save moment, not the month start` |
| Per-line resolution rules (staff row beats service row, `'clear'` falls through, later rows ignored, tie by id) | `src/modules/commissions/domain/override.test.ts` → `resolveOverride (021 O1/O2/O5)` suite (`returns the staff row when it is present`, `falls through a staff clear to the service-wide row (O2)`, `falls through a service clear to the plan (null)`, `ignores rows effective after the line time and other services (O5)`, `picks the latest effectiveFrom and breaks ties by id`, `uses the service-wide row when no staff row exists`) |
| Real DB: mid-day override applied by branch-local time, overridden lines excluded from the plan | `src/modules/commissions/persistence/commission-overrides.integration.test.ts` → `applies a mid-day override by branch-local time and excludes it from the plan (#33)` |

**Result: PASS.**

### Row 34 — no plan, matching override still pays (Waleed decision 3)

| Proof | Location |
|---|---|
| Domain: `{ status: "no_plan", result }` with `overrideMills`/`totalMills = 6.000` | `src/modules/commissions/domain/compute-commission-methods.test.ts` → `row 34: no plan still pays matching overrides` |
| Use case | `src/modules/commissions/use-cases/compute-staff-commission.test.ts` → `acceptance row 34 pays matching overrides for a staff member without a plan` |
| Real DB | `src/modules/commissions/persistence/commission-overrides.integration.test.ts` → `pays matching overrides for a staff member without a plan (#34)` |
| UI «بدون خطة» badge (with override earnings) | `src/modules/commissions/ui/plans-page.test.tsx` → `limits the tier rows between one and twenty and flags staff without a plan` |

**Result: PASS.**

### Row 35 — override permission (Waleed decision 1)

| Proof | Location |
|---|---|
| Ungranted branch 1 manager → `FORBIDDEN`/RLS refusal; after the grant: service-wide + own-branch staff overrides save, branch 2 staff override refused | `src/modules/commissions/persistence/commission-overrides.integration.test.ts` → `refuses override writes without the grant and outside the branch (#35)` |
| Default off for branch manager, grantable via `allow` | `src/modules/permissions/domain/permission-matrix.test.ts` → `keeps commissions.overrides.manage off for a branch manager by default (021 O4)`; `drops a role-restricted key for a member without its roles even with an allow row` |
| Not applicable to other roles (`PERMISSION_NOT_APPLICABLE`) | `src/modules/permissions/use-cases/permission-admin.test.ts` → `refuses a role-restricted key saved for a member without its roles` |

**Result: PASS.**

### Waleed decision 2026-11-20 — salary may not start inside or before a closed month

| Proof | Location |
|---|---|
| App path returns `SALARY_MONTH_CLOSED` | `src/modules/commissions/persistence/commissions-builder.integration.test.ts` → `refuses a salary dated inside or before a closed month (SALARY_MONTH_CLOSED)` |
| RLS refusal for dates inside and before the closed month | `db/tests/isolation.sql` 021 block, lines 1074–1088 |
| UI maps the code to a clear message | `src/modules/commissions/ui/salaries-page.test.tsx` → `maps SALARY_MONTH_CLOSED to a clear message` |

**Result: PASS.**

### Plan-version validation, parsers, legacy backfill, transaction lock

| Proof | Location |
|---|---|
| `PLAN_EMPTY` / `PLAN_INVALID` (zero/over-100 % rate, zero/negative fixed, zero rate tier, empty tier list, equal and descending thresholds, session-count `all_after`, >20 tiers) | `src/modules/commissions/domain/plan.test.ts` → `validatePlanVersion` `test.each` (`empty plan`, `zero base rate`, `base rate above 100 percent`, `zero fixed per session`, `negative fixed per session`, `zero tier rate`, `empty tier list`, `equal bracket thresholds`, `descending bracket thresholds`, `negative fixed threshold`, …) |
| Integer percent→bp and multiple→milli parsers (no floats) | `src/modules/commissions/domain/parse.test.ts` → `parsePercentToBp (021 M0, zero floats)` / `parseMultipleToMilli (021 M0, zero floats)` / `parseKwdToMills` |
| Legacy `0024` single-tier version backfilled and resolvable after `0026` | `src/modules/commissions/persistence/commissions-builder.integration.test.ts` → `backfills a legacy 0024 single-tier version into resolvable tiers` |
| Multi-tier version + tiers in one transaction; tiers for a committed version refused | `src/modules/commissions/persistence/commissions-builder.integration.test.ts` → `creates a multi-tier version in one transaction and locks committed tiers` |
| Override saved on the month's last day still counts (exclusive period end) | `src/modules/commissions/persistence/commissions-builder.integration.test.ts` → `pays an override saved on the month's last day (exclusive period end)` |
| Salary use case (positive mills, zero refused, effective-date resolution) | `src/modules/commissions/use-cases/manage-salaries.test.ts` → `records a positive effective-dated salary converted to mills` / `refuses a zero salary without writing` / `loads the screen with the current salary resolved by effective date` |
| Plans use cases (create with version, empty/invalid refused, descending brackets refused, month-start assignment, no-plan badge on the screen) | `src/modules/commissions/use-cases/manage-plans.test.ts` → `creates a plan with its first version after validation` / `refuses an empty plan and an invalid name without writing` / `refuses descending brackets without writing` / `assigns a plan from the month start and loads the screen with a no-plan badge` |
| Overrides use case (no effective date accepted; effectiveFrom = save moment) | `src/modules/commissions/use-cases/manage-overrides.test.ts` → `converts percent and KWD inputs to domain values without floats` / `serializes the screen with effectiveFrom as the save moment` |
| Salary is read only when a tier needs it | `src/modules/commissions/use-cases/compute-staff-commission.test.ts` → `acceptance row 13 uses the salary on 28 February after a mid-month change` / `acceptance row 14 rejects a salary-linked tier when no salary exists` / `does not request salary for a $name` |

### UI routes and navigation

| Proof | Location |
|---|---|
| Method blocks build the right `planRulesInput`; tier rows 1..20; live preview breakdown; empty-plan flag | `src/modules/commissions/ui/plans-page.test.tsx` → `builds the base percent and base fixed blocks` / `builds sales-amount tiers with fixed thresholds` / `builds session-count tiers with a fixed reward` / `builds salary-multiple thresholds for the all-after mode` / `previews the exact progressive-bracket breakdown for a known case` / `limits the tier rows between one and twenty and flags staff without a plan` / `sends the built rules on create and flags an empty plan` |
| Overrides screen: service-wide vs staff payload, no date input, clear back to plan, history effective times | `src/modules/commissions/ui/overrides-page.test.tsx` → `saves a service-wide override with a null staff and no effective-date input` / `targets a staff member with a fixed amount and clears back to the plan` / `renders the history with the whole-service marker and each effective time` |
| Salaries screen: history list, record effective-dated salary | `src/modules/commissions/ui/salaries-page.test.tsx` → `lists the current salary and the effective-dated history` / `records an effective-dated salary` |
| `/app/commissions/*` visible to owner + branch manager, hidden for others; overrides item needs the grant | `src/modules/permissions/ui/navigation.test.ts` (lines 48–56: `paths("app", …)` with `commissions.overrides.manage` and `branch_manager`) |
| Route guards per role/permission | `src/modules/permissions/ui/area-guard.test.ts` (lines 44–72: `/app/services/sessions` with `sessions.edit`; commissions paths with `commissions.overrides.manage`) |

## Old app on the new schema (deploy window)

Production gets `0025` + `0026` a few minutes before the new app deploys, so `main`'s
suite was run against a DB with the branch's `0001`–`0026` applied (temporary worktree of
`origin/main` at `12c1c3d`).

- First run: 2 failures in `src/modules/commissions/persistence/commission-plan.integration.test.ts`.
  `main`'s `addVersion` inserts `tier_mode` without `tier_accumulator`, which the new
  `commission_plan_versions_tier_pair` check rejected — a real runtime break for the old app,
  not only a fixture issue.
- Fix: `0026` adds the `commission_version_legacy_accumulator` BEFORE INSERT trigger, which sets
  `tier_accumulator = 'sales_amount'` when a tier arrives without one (same meaning as the backfill).
  Regression: the "Deploy window" block in `db/tests/isolation.sql` — fails on the old `0026`
  (`violates check constraint "commission_plan_versions_tier_pair"`), passes on the new one.
- Re-run of `main`'s suite after the fix: `src/modules/commissions` 5 files / 60 tests passed;
  full suite 690 passed, 1 failed — `src/test/lint-scope.test.ts` timed out on a cold ESLint
  start (10.9 s) and passed on re-run (4/4). No schema-related failure.

## Known limitations

1. **`/app` edit dialog staff/service picker reuses the commissions endpoint.** `src/modules/services/ui/manage-sessions-page.tsx` (lines 5, 62) calls `getServiceOverridesFn` from `@/modules/commissions` to fill the picker, so a session whose service/staff combination is not in that payload can fail with `NOT_ASSIGNED` even when the edit itself is allowed.
2. **PIN-attempt and override-history timestamps render in browser-local time.** `FailedPinAttemptDto.attemptedAt` (`src/modules/services/contracts.ts`, lines 114–123) and the overrides DTO `effectiveFrom` (`src/modules/commissions/contracts.ts`, line 150) are plain ISO strings without a branch timezone field, and the UI renders `new Date(...).toLocaleString()` (`failed-pin-attempts.tsx` line 21, `overrides-page.tsx` line 63) — the viewer's device timezone, not the branch's. (The sessions DTOs do carry `timeZone`.)
3. **`listEditableSessionsFn` from/until are UTC.** `src/modules/services/functions/session.functions.ts` (lines 74–75) appends `:00Z` to the date filter, so on a UTC+3 branch a session recorded 00:00–03:00 local on the boundary day can fall outside the picked date range (±3 h edge effect).

## GAP list

- No acceptance criterion of spec 021 lacks a test. Row 21's two cases are split as `row 21a` / `row 21b` (same spec numbers).
- The spec's “Tests” section names `compute-commission.test.ts` for new rows 17–29/33/34; the implemented rows live in `compute-commission-methods.test.ts` (same domain, same assertions). Recorded here as implemented, not as a gap.
