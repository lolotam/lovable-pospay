# Forgotten check-out correction Implementation Plan

> **For agentic workers:** Use executing-plans inline; one whole-range fresh reviewer after implementation.

**Goal:** Let authorized managers correct forgotten check-outs with preserved evidence.
**Architecture:** Attendance contract → pure validation → correction port/use case → pg repository under withUser → authenticated functions → existing `/attendance-questions` sibling new `/attendance-corrections` screen. Existing columns and audit table suffice.
**Tech Stack:** TanStack Start, React, pg, Zod, Vitest, Tailwind.
**Spec:** `docs/specs/007-attendance-correction/spec.md`

## Global Constraints
- No secrets, shared database writes, production/deploy changes or branch switch. Keep connected `lovable` branch; PR/CI not available here.
- Preserve original values; no working-hours or salary calculation.
- i18n, semantic token utilities, logical CSS, files <400 lines/functions <60.

## Review Focus
- Duplicate requests must not overwrite a resolved exception.
- Permission revocation between listing and save fails closed.
- Original/previous time and mandatory reason survive in audit.
- Offset-bearing timestamps avoid browser-zone ambiguity.
- Unavailable authentication must render safely rather than leaking tenant data.

### Task 1: Implement correction validation and transaction
**Files:** create `src/modules/attendance/domain/correction.ts`, `correction.test.ts`, `ports/correction-repository.ts`, `use-cases/correct-attendance.ts`, `persistence/correction-repository.server.ts`, `use-cases/correct-attendance.integration.test.ts`, `correction.contracts.ts`.
**Interfaces:** `validateCorrection(checkInAt: Date, correctedAt: Date, reason: string, now: Date): string | null`; `correctAttendance(input, {repo,clock})` returns corrected record; repo locks/read/apply/audit under one withUser transaction.
- [ ] Write first validation test: whitespace reason → `REASON_REQUIRED`; run Vitest, expect failure for missing behavior, implement then rerun PASS. Repeat for before check-in/future timestamp.
- [ ] Write integration tests for original checkout preservation and audit; run expect RED before repository exists, implement minimal transaction, rerun PASS.
- [ ] Add staff/foreign-company/deny/duplicate cases and verify their literal error codes and unchanged records.
- [ ] Run task tests with explicit disposable `POSPAY_TEST_DATABASE_URL`, expect all pass; commit transaction code and tests.

### Task 2: Expose manager correction screen
**Files:** create `functions/correction.functions.ts`, `ui/corrections-page.tsx`, `routes/attendance-corrections.tsx`; modify attendance `index.ts`, `src/components/app-shell.tsx`, i18n JSON and `roadmap.md`.
**Interfaces:** `getForgottenAttendanceFn({data:{companyId}})` and `correctAttendanceFn({data:{companyId,recordId,correctedAt,reason}})` authenticate and return plain DTO; page chooses company from existing memberships, lists every pending record, updates then refreshes readback.
- [ ] Reuse tested correction transaction, add read permission test at existing repository seam before list implementation, expect RED then PASS.
- [ ] Add authenticated functions and i18n screen: ISO timestamp input with branch timezone visible, required reason, busy/empty/unavailable/error/success states, no protected SSR loader.
- [ ] Add route metadata and matching navigation in same change. Verify 390/820/1280 light/dark and one navigation step beyond; signed-out checks do not close authenticated acceptance.
- [ ] Run whole suite with local DB; changed-file lint and harness build output. Record full-lint blocker if still present. Expect tests/changed lint pass and build OK.
- [ ] Commit; one fresh reviewer on full range; fix important findings test-first and rerun suite. Update roadmap and preserve ledger (no deletion).