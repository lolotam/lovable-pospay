# 002 — Phone binding and attendance questions

## Implemented phone safeguards

- Better Auth owns identities and passkeys; authentication responses are verified using SimpleWebAuthn, including challenge, expected origin, RP ID, signature and user verification.
- Each company/user has one binding. The stored device-cookie hash is globally unique, preventing the same browser token from serving another active binding.
- Waleed confirmed option 1 on 2026-11-18 for Lovable PR #1. A browser token has one active company binding. For a signed-in staff member, `/phone` shows the company linked to that browser after binding and on reopening, explains the rule and removes the bind action while active. The bound company is visible only to the binding's owner under existing company RLS. A manager at that company must unbind it before the browser can be used to bind elsewhere.
- Concurrent first-bind requests without a device cookie in the same authenticated session derive the same server-keyed device token. The existing unique hash constraint admits at most one. Once set, the cookie supplies the token across subsequent sessions.
- Attendance verifies the current user's owned credential and matching HttpOnly cookie before reading or writing attendance; the QR branch must match the verified company.
- A manager/owner can remove a company binding under RLS, unless denied `attendance.manage_devices`; unbinding is audited. Staff cannot unbind themselves. `attendance.record` deny blocks binding and scanning.
- Missing cookie, another user's credential, expired challenge, removed binding and explicit deny fail closed.
- Security tests: five unit tests; migration applied twice; `db/tests/phone-isolation.sql` passes on disposable PostgreSQL. Full suite: 30 passing tests. Changed phone files pass ESLint.

## Not yet accepted

- Physical phone exclusivity is NOT proven by a browser cookie. Clearing browser data or changing browser can create a different token, and synced passkeys do not identify physical phones. Complete ق-4 requires supported-phone testing and stronger device proof; the slice remains open.
- Authenticated end-to-end binding/scan has not been run: the app's actual Better Auth database and origin are not configured here. Screens were checked on desktop and mobile only, not signed-in.
- Binding a phone currently requires a company identifier; manager unbinding requires the staff account identifier. A staff selector remains needed for the final operator workflow.
- SQL migration 0003 has NOT been applied to a shared or production database.

## Attendance AI questions — blocked

The requested AI Gateway is explicitly disabled in the workspace. The page is an unavailable state only: it performs no AI call, returns no invented answer and does not send attendance data externally.

When enabled, complete an authenticated manager/owner endpoint that honors explicit denies, reads only company-scoped attendance through `withUser()`, provides dated staff/shift evidence, and asks the model for a practical summary without executing model-generated SQL. Verify with real records and a real gateway response before marking complete.
