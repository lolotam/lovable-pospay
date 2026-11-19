# 016-C Implementation Plan

**Goal:** deliver spec `docs/specs/016c-access/spec.md` as three PRs: C1 permission page, C2 phone
passkey sign-in, C3 existing account accepts an invitation (issue #8).

**Executors:** Lovable implements each PR end to end (UI, server functions, SQL file, tests).
Claude Code reviews, runs `bun run test` against `pospay_test` and the SQL suites, fixes, opens the
PR, handles bots. Waleed approves and applies `0020` in production.

**Rules for every task:** Souk Tiles tokens and shell, mobile-first, logical CSS, every string via
`t()` in `ar.json` and `en.json`, Arabic JSDoc on domain/ports, files under 400 lines, functions
under 60, `.server.ts` imported dynamically inside handlers, every query through `withUser()`.
Verify each screen at 375, 768 and 1280 px, light and dark, RTL.

**Branches:** `feat/016c-permission-page`, `feat/016c-passkey-sign-in`,
`feat/016c-accept-existing-account`. One PR each, into `main`.

---

## C1 — `/app/permissions` (PR 1)

### Task 1: Migration 0020

**Files:** create `db/migrations/0020_permission_admin.sql`; modify `db/tests/isolation.sql`.

- [ ] Write `public.company_member_directory(_company uuid)` exactly as spec "Schema changes":
  security definer, `set search_path=public`, rows only for `has_company_role(_company,'owner')`,
  one row per user with `array_agg(distinct role)` and `coalesce(s.display_name, u.name)`.
  `revoke all ... from public; grant execute ... to pospay_app;`. Use
  `create or replace` so it can run twice.
- [ ] Add the two isolation cases (other company owner → 0 rows; non-owner member → 0 rows).
- [ ] Claude Code: apply twice on `pospay_test`, run `db/tests/isolation.sql`.

### Task 2: Contracts and domain

**Files:** modify `src/modules/permissions/contracts.ts`; create
`src/modules/permissions/domain/override-states.ts` and `override-states.test.ts`.

- [ ] Add `editablePermissionSchema`, `overrideStateSchema`, `restrictionKeySchema`,
  `restrictionStateSchema`, `memberPermissionsSchema`, `saveOverridesInput` from the spec.
- [ ] `EDITABLE_PERMISSIONS` (6 keys) and `RESTRICTION_KEYS` (5 keys); `MANAGED_KEYS` = both.
  `toStates(rows)` maps override rows to the two full records (`default` when absent).
  `toRows(overrides, restrictions)` returns rows only for `allow`/`deny`, and only `deny` for a
  restriction key.
- [ ] `assertEditableTarget({ actorId, target })` throws `OWNER_LOCKED` when the target holds
  `owner`, `SELF_EDIT` when `actorId === target.userId`.
- [ ] Tests: round-trip for permission states and restriction states with `test.each`;
  `OWNER_LOCKED`; `SELF_EDIT`.

### Task 3: Persistence and use cases

**Files:** create `src/modules/permissions/persistence/permission-admin.server.ts`,
`src/modules/permissions/use-cases/save-member-overrides.ts`,
`list-member-permissions.ts` and their tests.

- [ ] `readMembers(db, companyId)` → `select * from company_member_directory($1)`.
- [ ] `readOverrides(db, companyId)` → all rows of the company (owner can read by RLS).
- [ ] `replaceOverrides(db, { companyId, userId, rows })` in one transaction: delete rows of that
  user whose `permission` is in `MANAGED_KEYS`, insert the new rows, insert the
  `audit_log` row (`permissions.changed`, `details={before, after}`).
- [ ] `listMemberPermissions`: join members + overrides; `effective` from
  `effectivePermissions(roles, overrides)`; `restrictions` from the deny rows of the 5 keys;
  `unknownKeys` = any other key found.
- [ ] `saveMemberOverrides`: require owner role of the actor (`has_company_role` via a query),
  target must be in the directory (`MEMBER_NOT_FOUND`), `assertEditableTarget`, then
  `replaceOverrides`, return the fresh DTO.
- [ ] Integration test on `pospay_test`: owner saves `pos.access=allow` for a branch manager →
  `has_permission` true; blocking `attendance.record` writes one deny row and clearing it removes
  it; an unknown key row survives a save; exactly 1 audit row;
  manager with a `permissions.manage` allow row gets `FORBIDDEN`; owner of A with B's ids gets
  `FORBIDDEN`/`MEMBER_NOT_FOUND`.

### Task 4: Server functions

**Files:** create `src/modules/permissions/functions/permission-admin.functions.ts` and test.

- [ ] `listMemberPermissionsFn` (GET) and `saveMemberOverridesFn` (POST) with the Zod inputs,
  session required, dynamic imports of the `.server.ts` modules, `withUser(session.user.id)`.
- [ ] Export through `src/modules/permissions/index.ts` (browser-safe) only what the UI needs.

### Task 5: Page and navigation

**Files:** create `src/routes/app/permissions.tsx`,
`src/modules/permissions/ui/permissions-page.tsx`, `member-permission-card.tsx`,
`permissions-page.test.tsx`; modify `src/modules/permissions/ui/navigation.ts`,
`navigation.test.ts`, `src/i18n/ar.json`, `src/i18n/en.json`.

- [ ] Route `beforeLoad`: redirect to `/app` unless the active workspace role is `owner`.
- [ ] Nav item `{ to: "/app/permissions", label: "nav.permissions", icon: ShieldCheck,
  requires: "permissions.manage" }` before `/app/settings`.
- [ ] Layout: phone = one column of member cards, each card expands to the 6 keys as a 3-way
  segmented control (default / allow / deny) with the role default shown under the label and a
  sticky save bar at the bottom above the tab bar; tablet = 2-column card grid; desktop =
  member list (start) + editor panel (end). Owner card read-only with a lock badge. A second
  group "restrictions" lists the 5 restriction keys, each a switch "blocked" with a one-line
  explanation (for example "cannot record attendance"). Unknown keys read-only.
- [ ] Save shows success/failure via the existing route feedback; on `MEMBER_NOT_FOUND`
  refetch the list.
- [ ] Tests: owner card has no controls; changing `pos.access` to allow and saving sends the
  exact payload; empty state when only the owner exists.

### Task 6: Close C1

- [ ] `roadmap.md` line for 016-C C1; verification notes with the 3 viewport checks.
- [ ] PR body lists `0020` as waiting on Waleed.

---

## C2 — phone passkey sign-in (PR 2)

### Task 7: Unbind deletes the passkey

**Files:** modify `src/modules/staff/functions/phone.functions.ts` (`unbindPhoneFn`) and the
owner unbind path in `phone-management.server.ts`; add an integration test.

- [ ] `delete ... returning credential_id`; then delete the `"passkey"` row with that
  `"credentialID"` through Better Auth's internal adapter (`getAuth().$context`), in the same
  handler after the SQL delete succeeds.
- [ ] Integration test: bind, unbind, the passkey row is gone.

### Task 8: Sign-in button

**Files:** modify `src/routes/sign-in.tsx` (or its page component), i18n files; add a test.

- [ ] Show "sign in with my phone" only when `window.PublicKeyCredential` exists.
- [ ] Call `authClient.signIn.passkey()`; on success reuse the existing post-sign-in redirect
  (`signInDestination`); on error show `t("signIn.passkeyFailed")`, keep the password form.
- [ ] Server-side guard: in the Better Auth `hooks.after` (or a session-create hook) for the
  passkey sign-in path, reject the session when the credential has no row in `phone_bindings`.
- [ ] Tests: button hidden without WebAuthn; failure message; success path calls the redirect.

---

## C3 — existing account accepts an invitation (PR 3)

### Task 9: Server function

**Files:** modify `src/modules/invitations/functions/invitation.functions.ts`; add tests.

- [ ] `acceptInviteAsSignedInFn({ token })`: require a session, hash the token, call
  `acceptInvite(db, hash, session.user.email)` with `withUser(session.user.id)`, return
  `{ companyId }`. Never call `createInvitedAccount`.
- [ ] Integration test: existing user accepts → 1 new membership, user count unchanged;
  mismatched email → `INVITE_EMAIL_MISMATCH`.

### Task 10: Acceptance page

**Files:** modify `src/modules/invitations/ui/accept-invite-page.tsx`, its test, i18n files.

- [ ] Signed in + email matches → one "join {company}" button → `acceptInviteAsSignedInFn`, then
  select the new workspace and go to its home.
- [ ] Signed in + other email → mismatch message + sign-out action.
- [ ] Signed out → the current create-account form plus a "I already have an account, sign in"
  link to `/sign-in?redirect=<invite url>`. When create fails with `ACCOUNT_EXISTS`, show the same
  sign-in link. Do not reveal in advance whether the email has an account.
- [ ] Tests for the three branches.
- [ ] Close issue #8 from the PR.

---

## Gates per PR (Claude Code)

`node_modules/.bin/tsc.exe --noEmit -p .`, `npx eslint .` (0 errors),
`POSPAY_TEST_DATABASE_URL=... bun run test`, SQL suites via `docker exec -i pospay-016-verify psql`,
`NITRO_PRESET=node-server bun run build`, then PR, CI and bot review on the final head.
