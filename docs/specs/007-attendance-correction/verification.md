# 007 verification — 2026-11-18

- Full suite: 77 passed, 0 skipped, 14 files; explicit disposable localhost `pospay_test`.
- Repository: authorized list/save, staff/foreign user/explicit deny rejection, reason/actor/original retained, duplicate and concurrent correction, revoke permission after list, rollback on audit failure.
- Domain: required reason, before-check-in, future and invalid time.
- Readback: failure/missing saved value cannot produce verified success; RED observed then GREEN.
- All changed code ESLint passed; `git diff --check` passed; harness build latest `build OK`.
- Full `bun run lint` terminated `SIGTERM` after 240 seconds; not a pass. No manual build/typecheck; harness supplies it.
- Browser: 390×844 / 820×1180 / 1280×1800, light/dark; unavailable auth displayed, no horizontal overflow, sign-in navigation succeeds.
- Authenticated manager browser save/readback not run: preview has no configured Better Auth. Do not close real-world acceptance.
- One fresh whole-range review: important verification gap addressed with concurrency/revocation/non-null-original/rollback coverage; readback failure upgraded to Important and fixed with RED→GREEN tests. Added security tests were GREEN immediately and are coverage, not independently demonstrated RED.
- Ruling: permission `attendance.correct` denotes existing owner/branch_manager correction action and honors deny; no new grant model/table.
- Ruling: keep connected branch/workspace; no PR/CI/merge/deploy, environment, shared SQL or server operations.
- No deferred minors. AGENTS technical-rule save rejected by size budget; existing architecture already covers atomic audit/original evidence. No user-authored instructions condensed.

Next: authenticated acceptance with working Better Auth; physical-phone acceptance and barcode decisions stay open separately.