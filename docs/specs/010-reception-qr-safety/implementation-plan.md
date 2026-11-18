# Safe reception QR Implementation Plan

> The original verification plan used inline execution and fresh Standards and Spec reviews.

**Goal:** Prevent stale or wrong-branch QR display and malformed-link crashes.
**Architecture:** Keep RPC auth unchanged. Isolate browser lifecycle in a hook using
request-start monotonic time and single-flight polling; validate URL input safely.
**Tech Stack:** React, TanStack Router, qrcode, Vitest.
**Spec:** `docs/specs/010-reception-qr-safety/spec.md`

## Global Constraints
- No env, secrets, server, shared DB, deploy, branch switch, push or merge changes.
- Keep 60-second lifetime and 50-second polling; i18n, tokens, logical CSS.
- Tests exercise state behavior, not markup/copy. Real DB suite runs serially.

## Review Focus
- Response latency and bitmap latency consume the original display budget.
- Branch changes and cleanup cannot restore old state.
- Hanging requests do not overlap or leave expired codes visible.
- Background-tab resume immediately clears elapsed codes.
- Invalid search data never makes an RPC or exposes a root failure.

### Task 1: QR lifecycle safety
**Files:** create `src/modules/attendance/ui/use-reception-qr.ts` and its test;
modify `reception-qr.tsx`, i18n, AGENTS.md and component enrichment.
**Interfaces:** `useReceptionQr(branchId, fetchQr)` returns image, branchName,
failed; fetchQr consumes `{data:{branchId}}`, resolves BranchQrDto.
- [x] Write expiry regression against presentation state; run single file RED.
- [x] Implement single-flight polling with request-start display deadline; run GREEN.
- [x] Add late rendering, branch change, failure/recovery and overlap cases; returning to previous branch reproduced RED then fixed GREEN.
- [x] Wire canonical ReceptionQr with typed forwarded props and existing tokens.

### Task 2: Safe search and delivery
**Files:** create `qr-search.contracts.ts` and test; modify `src/routes/reception/qr.tsx`.
**Interfaces:** `receptionQrSearchSchema.parse(unknown)` returns optional valid branch.
- [x] Write malformed search test RED; implement safe parser GREEN.
- [x] Run full test suite on explicit localhost pospay_test, full lint and diff check.
- [x] Browser-check missing/invalid/unconfigured URLs at 390/820/1280 light/dark;
  inspect all content-route head metadata and latest harness build signal.
- [x] Fresh independent review completed; record verified evidence in roadmap/verification and commit task.
