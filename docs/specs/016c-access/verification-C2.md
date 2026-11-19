# C2 — 10:20 Kuwait, 2026-11-19

- Implemented phone sign-in using the existing finish/signInDestination; unavailable WebAuthn hides the button, cancelled/failed calls show generic translated failure and leave password usable.
- Better Auth authentication.afterVerification executes after signature verification and before createSession (verified against installed plugin source); owned credential must match a current-member phone binding through withUser.
- User and manager/owner unbind share unbindPhoneFn; authorized deletion and its audit commit in the app transaction, which returns credential_id; the Better Auth credential is removed via $context.adapter only after that commit (Claude Code review fix).
- Existing RLS disallowed self-unbind. Prepared migration 0021_phone_self_unbind.sql for current-member own-phone deletion, retaining manager gates. Applied in production by Waleed on 2026-11-19 and verified read-only; self-unbind approved by Waleed the same day (spec 002 updated).
- Full suite serially: 350 passed, 137 skipped; 62 test files passed, 15 skipped. Lint 0 errors / 8 existing warnings; preview build OK; git diff --check clean. Existing phone-page test session mock updated, assertions unchanged.
- Browser: real public /sign-in at 375/768/1280 light/dark, no overflow; mocked cancellation keeps password and retry enabled; no page errors. Screenshots inspected.
- TDD red/green at approved passkey and sign-in seams. Standards/spec reviewers ran independently: self-unbind and integration omissions fixed. Binding check intentionally accepts any current member company before workspace choice (B8); clientData.id is the verified response ID per installed plugin. Unknown success data matches existing finish contract. Two-phase app/auth adapter operations are not a single Postgres transaction. An audit or commit failure rolls back the unbind before the adapter call, so binding and passkey both stay. An adapter failure after commit leaves the binding removed and the passkey retained; that passkey cannot sign in because sign-in requires a binding, and the phone page reloads the committed state. No claim of cross-adapter atomicity.
- Unverified: real signed-in WebAuthn ceremony, membership revocation, bind/unbind integration/RLS, migration double-application. Database tests prepared for Claude Code; no SQL executed, no secrets/deploy/PR/merge.
- Branch: lovable. Requested feat/016c-passkey-sign-in cannot be created/switched in this environment.

## Files written
- `AGENTS.md`
- `roadmap.md`
- `docs/specs/016c-access/implementation-C2-C3.md`
- `db/migrations/0021_phone_self_unbind.sql`
- `src/i18n/ar.json`
- `src/i18n/en.json`
- `src/lib/phone-sign-in.tsx`
- `src/lib/phone-sign-in.test.tsx`
- `src/lib/server/phone-passkey.server.ts`
- `src/lib/server/phone-passkey.test.ts`
- `src/lib/server/auth.server.ts`
- `src/modules/staff/functions/phone.functions.ts`
- `src/modules/staff/functions/phone-unbind.test.ts`
- `src/modules/staff/ui/phone-page.tsx`
- `src/modules/staff/persistence/phone-passkey.integration.test.ts`
- `src/routes/sign-in.tsx`
- `src/test/phone-page.test.tsx`
- `docs/specs/016c-access/verification-C2.md`
