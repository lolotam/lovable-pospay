# Barcode, catalog and reports Implementation Plan

**Goal:** Deliver the approved fallback card workflow followed by service catalog and operational reports.
**Architecture:** Attendance owns card policy, token lifecycle and scan orchestration; existing attendance decisions remain canonical. Services owns its catalog/assignments/session read API. DB employee locks and triggers enforce mutual exclusion of phone and card. UI calls typed server functions through Better Auth and withUser.
**Tech Stack:** React 19, TanStack Start/Query, Zod, pg, Tailwind/Micro, Vitest, Code128 browser renderer.
**Spec:** docs/specs/003-barcode/spec.md

## Constraints / review focus
- No production/env/server/deploy writes; no deletes of real data.
- Preserve historical attendance and prices; hashes only at rest; no raw card token in list/audit.
- Cross-company IDs, revoked tokens, stale intents, permission removal, and simultaneous binding/issuance must fail closed.
- Prices are bigint mills; half-open explicit report time bounds; no salary/phone exposure.
- Manager branch scope, loading/empty/forbidden states, keyboard and mobile sizing are checked.

## Tasks
- [x] Write rule tests first, observe failures: manager-only issue, immediate revoke, one-method enforcement, KWD exact parsing and invalid values; integration tests exercise real Postgres.
- [x] Add db/migrations/0011_barcode.sql with policy/cards, grants/RLS, employee locking and method exclusivity triggers. Update db/tests/isolation.sql.
- [x] Add attendance/card.contracts.ts, domain/card-policy.ts, persistence/card-repository.server.ts, use-cases/card-actions.ts and functions/card.functions.ts; share record scan logic with phone flow without bypassing auth.
- [x] Add /cards and /reception/cards, policy approval inside /settings; render single-return Code128 and print control with confirmation for revocation.
- [x] Add db/migrations/0012_service_catalog.sql and services contracts/domain/persistence/use-cases/functions plus /services. Preserve edit audit and same-company assignments.
- [x] Add report contracts/functions/UI at /reports with dates, attendance/corrections/session tabs and actual rows only.
- [x] Apply migrations twice on localhost pospay_test, run negative SQL and all tests serially; run lint and inspect harness build.
- [ ] Complete authenticated acceptance; unavailable-state check done. Verify browser at 390/820/1280 in light/dark; authenticated central flows require real configured Better Auth, do not claim empty-state checks prove them.
- [ ] Close remaining architecture review and authenticated gates. Review Standards and Spec independently, fix findings, update roadmap/verification with actual evidence, commit intentionally edited files. Keep production and PR/CI gates open.