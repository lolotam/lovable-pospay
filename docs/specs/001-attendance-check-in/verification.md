# Slice 001 verification — 2026-11-18, 02:30 Kuwait

## Verified locally

- PostgreSQL 17, disposable localhost database; no shared database, secrets or deployment changed.
- Migrations 0001 and 0002 applied successfully; integration setup applies each twice to verify repeatability.
- `db/tests/isolation.sql`: `isolation: PASS`.
- Actual attendance use case, PostgreSQL repository, HMAC signer and `withUser()` transaction tested together under `pospay_app` and the staff identity.
- ق-6: check-in 06:00, scan 20:00 returns `needs_intent`, `new_shift` stores the previous record as `forgotten` with no check-out time and creates one open record dated 2026-11-18.
- Next-day 06:01 check-out stores `closed_late`; audit actions read back in order.
- QR aged 61 seconds rejected without adding attendance records.
- Full test run: 4 files, 25 tests passed.
- ESLint for both changed test files passed; full `bun run lint` exceeded the 60-second command limit and was terminated (`SIGTERM`). It is not claimed as passing.

## Still unverified

- Authenticated browser flow and real phones, including Passkey binding (slice 002).
- Deployment and migrations on the intended self-hosted database; require approved setup.

## Repeat integration checks

Use a fresh disposable database named `pospay_test` on `127.0.0.1`, never the shared database.

```sh
POSPAY_TEST_DATABASE_URL='postgresql://<test-user>@127.0.0.1:<test-port>/pospay_test' bunx vitest run
```

Without `POSPAY_TEST_DATABASE_URL`, the integration suite is explicitly skipped. Its safety guard rejects non-local hosts and other database names before writes.