# Attendance transition safety Implementation Plan

> **For agentic workers:** Use executing-plans inline; one fresh whole-range reviewer at the end.

**Goal:** Reject stale concurrent attendance updates before audit or new check-in.
**Architecture:** Keep the existing port/use case and withUser transaction. Conditional
SQL updates must affect exactly one open record; otherwise reject with ATTENDANCE_CONFLICT.
**Tech Stack:** TanStack Start, pg, Vitest.
**Spec:** `docs/specs/008-attendance-transition-safety/spec.md`

## Global Constraints
- Stay on connected lovable branch; no push, switch, production, env, secrets or deployment writes.
- RLS and phone authorization stay intact; no new business policy or tables.
- Files under 400 lines, functions under 60; Arabic JSDoc for port changes.
- Browser acceptance remains open when configured Better Auth is unavailable.

## Review Focus
- Concurrent checkout produces exactly one success and audit.
- Concurrent new-shift transition never creates a second open record or duplicate audit.
- Stale forgotten transitions preserve resolved checkout values.
- Audit failure rolls attendance writes back.
- Separate company/staff scopes remain isolated by existing RLS and predicates.

### Task 1: Guard attendance transitions
**Files:** create `src/modules/attendance/use-cases/scan-concurrency.integration.test.ts`;
modify `src/modules/attendance/persistence/attendance-repository.server.ts` and
`src/modules/attendance/ports/attendance-repository.ts`.
**Interfaces:** existing close/markForgotten Promise<void> reject with ATTENDANCE_CONFLICT
when the open-state predicate matched no row. Existing scanAttendance and withUser unchanged.
- [ ] Write real DB checkout race and stale-forgotten tests before implementation.
  Two scan transactions rendezvous after reading the open record; assert exactly one
  checked_out, one ATTENDANCE_CONFLICT and one checkout audit.
- [ ] Run `POSPAY_TEST_DATABASE_URL=postgresql://pospay_test@127.0.0.1:55433/pospay_test bunx vitest run src/modules/attendance/use-cases/scan-concurrency.integration.test.ts`.
  Expected: FAIL because both callers report success / stale update resolves silently.
- [ ] Capture rowCount for close and markForgotten; throw ATTENDANCE_CONFLICT unless 1.
  Document rejection in the existing port; do not introduce a parallel repository.
- [ ] Add new-shift race and audit rollback cases; run task command again.
  Expected: all cases PASS. Run full suite, changed-file lint, SQL isolation acceptance,
  diff check and inspect harness build; record full lint output without weakening rules.
- [ ] Commit implementation and tests; complete task ledger; request fresh whole-range review.
  Fix important findings test-first. Record checks and remaining acceptance blockers in
  verification.md and roadmap.md after verification; commit documentation.