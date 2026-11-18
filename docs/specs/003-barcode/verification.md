# 003 local verification

## Delivered
Policy approval in settings; manager-only issuance, immediate revoke and one active phone/card method; printable Code128 cards and reception scanner; exact bigint service prices, edit audit and employee assignments; half-open attendance/correction/service reports. No production, secrets or deployment writes.

## Evidence
- Card policy/price RED: 3 failed / 6 passed before implementation, then 9 passed.
- Review regression RED: target employee deny and manager revoke failed before database helper/read-policy correction; GREEN afterward.
- 19 real PostgreSQL card/catalog/report tests pass, including phone/card race, branch restriction, deny overrides, immediate revoke, edit audit and stale version.
- Migrations 0011/0012 applied twice on disposable localhost pospay_test in integration setup. New tables covered by db/tests/isolation.sql.
- Browser: 30 unavailable-state route/size/theme checks at 390/820/1280, light/dark, no page errors or horizontal overflow. Screenshot inspected. AUTH_NOT_CONFIGURED prevents authenticated browser acceptance; no simulated authenticated claim.
- Initial independent Standards/Spec review found architecture, size and deny-policy issues. Deny issues fixed and regression tested; imports and oversized views split. Complete port orchestration/final-head review remains open.
- Service session report reads actual rows only; session creation/discount/package workflow not delivered here.

## Final checks
- Full serial suite: 175/175 tests, 26 files, 0 skipped. Existing AttendScan act warning appeared in an earlier run; no failing test.
- Full lint: 0 errors, 6 existing warnings. git diff --check passed. Latest harness entry: build OK; no manual build/typecheck run.

## Gates still open
Authenticated browser save/readback and physical scanner acceptance; final independent review; exact-head PR/CI; approval to apply production migrations and deploy. No production mutations performed.
