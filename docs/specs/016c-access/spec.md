# 016-C — permissions: owner permission page, phone passkey sign-in, invite for an existing account

## Requirement

Three parts of slice 016-C, delivered as three PRs in this order:

- **C1. `/app/permissions`.** The owner sees every member of the active company and gives or
  takes away single permissions per person (spec 016 R4, D-31, D-46).
- **C2. Phone passkey sign-in.** A staff member signs in on `/sign-in` with the passkey bound on
  `/me/phone`, without a password (spec 016 R7).
- **C3. Existing account accepts an invitation.** A signed-in person whose email matches the
  invitation joins the company without creating a second account (issue #8).

All UI follows Souk Tiles and is fully responsive on phone, tablet and desktop.

## Business rules (cite PRD D-xx / spec 016)

- **B1 (R4, D-31).** Effective permissions = union of the role defaults of every role the person
  holds in the company, plus `allow` rows, minus `deny` rows. A `deny` always wins. The owner is
  never affected by overrides. `effectivePermissions()` in
  `src/modules/permissions/domain/permission-matrix.ts` and SQL `has_permission()` (0018) already
  implement this; C1 only edits the rows.
- **B2.** Only a person holding the `owner` role in the company opens `/app/permissions` and
  writes `permission_overrides` (RLS `overrides_owner_write`). Holding the `permissions.manage`
  key through an `allow` override is not enough.
- **B3.** Editable keys: `pos.access`, `reports.view`, `attendance.correct`, `staff.manage`,
  `services.manage`, `discounts.manage`. `permissions.manage` is shown read-only and is never
  written, so an override cannot create a second owner.
- **B3b (Waleed, 2026-11-19).** The owner also manages the five restriction keys that existing
  RLS reads as deny-only: `attendance.record` (cannot record attendance),
  `attendance.manage_devices` (cannot manage staff phones), `attendance.manage_cards` (cannot
  manage staff cards), `sessions.record` (cannot record service sessions), `reports.read` (cannot
  read reports). Each has two states only: `default` (no row) or `deny`. An `allow` row is never
  written for them, because no SQL function reads it.
- **B4.** Each permission key per person has exactly one state: `default` (no row), `allow`, or
  `deny`; each restriction key has `default` or `deny`. Saving replaces that person's rows for all
  managed keys in one transaction, so `allow` and `deny` never coexist for one key.
- **B5.** Owner rows are listed but not editable. A person cannot edit their own overrides.
- **B6.** Every save writes one `audit_log` row: `action='permissions.changed'`,
  `entity='user'`, `entity_id=<target user id>`, `details={before, after}` with the two override
  lists.
- **B7.** A change takes effect on the target's next request: `getSessionContext` already reads
  overrides per request, and server functions check `has_permission`.
- **B8 (R7).** Passkey sign-in works only for a passkey that is still bound in
  `phone_bindings` (`credential_id`) for a company where the user is still a member. Unbinding
  a phone (by the user or the owner, 0019) also deletes the matching Better Auth `passkey` row,
  so the passkey stops signing in.
- **B9 (issue #8).** `accept_invitation()` (0015) already accepts as the signed-in user when
  the emails match. C3 adds the path that calls it for an existing, signed-in account and never
  calls `createInvitedAccount`.

## Edge cases

- Company with only the owner: page shows the owner card and an empty state "no members yet"
  with a link to `/app/staff/team`.
- A member with several roles (for example `branch_manager` + `reception`): defaults are the
  union; the card lists every role.
- A restriction key is shown in its own "restrictions" group with an on/off switch ("blocked").
  An unknown key found in the table (none today) is kept untouched by a save and shown read-only.
- A target removed from the company between page load and save: save fails with
  `MEMBER_NOT_FOUND`, the page shows the error and reloads the list.
- Two owners editing the same person at once: last write wins; both writes are in `audit_log`.
- C2: a browser without WebAuthn hides the passkey button. A cancelled or failed ceremony shows
  `t("signIn.passkeyFailed")` and leaves the password form usable.
- C2: a user whose only bound passkey was unbound gets the same generic failure, never a hint
  that the account exists.
- C3: signed-in user with a different email than the invitation → `INVITE_EMAIL_MISMATCH` message
  with a "sign out and use the invited email" action. Signed-out visitor whose email already has
  an account → the create form fails with `ACCOUNT_EXISTS` and offers "sign in to accept", which
  returns to the same invite URL after sign-in. The page never reveals in advance whether an
  email has an account. Invite already accepted, revoked or expired → existing `INVITE_INVALID` message.
- C3: accepting again for a role the user already holds is a no-op (`on conflict do nothing`).

## Acceptance criteria (concrete numbers)

1. An owner with 3 members sees 4 cards (owner read-only + 3 editable) at 375, 768 and 1280 px,
   light and dark, without horizontal scroll.
2. Owner sets `pos.access=allow` for a `branch_manager`; on that manager's next request `/pos`
   appears in navigation and `/pos/qr` opens.
3. Owner sets `reports.view=deny` for an `accountant`; the reports item disappears and
   `/app/attendance/reports` redirects to `/app` on the next request.
4. A `branch_manager` (even with `permissions.manage=allow` in the table) gets redirected from
   `/app/permissions` and every C1 server function returns `FORBIDDEN`.
5. Owner of company A calling the C1 server functions with company B's id or a company B user
   gets `FORBIDDEN` or `MEMBER_NOT_FOUND`; no row in B changes.
6. One save = exactly one `audit_log` row with `before` and `after`.
7. A staff member with a bound phone signs in on `/sign-in` with the passkey in 1 tap and lands on
   `/me`. After the owner unbinds the phone, the same passkey fails.
8. Signed-in existing user opens an invite for their email, taps "join", gets a new membership and
   the new company appears in the workspace switcher; the user count in `"user"` is unchanged.

9. Owner blocks `attendance.record` for a staff member; that person's next attendance scan is
   refused, and clearing the block allows it again. The same save never writes an `allow` row
   for a restriction key.

## Schema changes (tables, RLS, grants, isolation test)

Migration `db/migrations/0020_permission_admin.sql` (idempotent, prepared by Lovable, applied in
production only after Waleed approves):

- `public.company_member_directory(_company uuid)` returns
  `table(user_id text, name text, email text, roles text[], branch_id uuid)`;
  `language sql stable security definer set search_path=public`. Returns rows only when
  `public.has_company_role(_company,'owner')`; otherwise zero rows. Name =
  `staff_members.display_name` if present, else `"user".name`. `revoke all ... from public`,
  `grant execute ... to pospay_app`.
- No new table. `permission_overrides` keeps its RLS. Add an `on delete` path for passkeys:
  the phone unbind use case deletes the `"passkey"` row whose `"credentialID"` equals the
  binding's `credential_id` (server side, through Better Auth's adapter, not raw SQL from the
  browser).
- `db/tests/isolation.sql`: company A owner gets 0 rows from
  `company_member_directory(<B>)`; a non-owner member of A gets 0 rows for A.

## Contract (Zod input/output)

In `src/modules/permissions/contracts.ts`:

```ts
export const editablePermissionSchema = permissionKeySchema.exclude(["permissions.manage"]);
export const overrideStateSchema = z.enum(["default", "allow", "deny"]);
export const restrictionKeySchema = z.enum([
  "attendance.record",
  "attendance.manage_devices",
  "attendance.manage_cards",
  "sessions.record",
  "reports.read",
]);
export const restrictionStateSchema = z.enum(["default", "deny"]);

export const memberPermissionsSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  roles: z.array(companyRoleSchema).min(1),
  isOwner: z.boolean(),
  overrides: z.record(editablePermissionSchema, overrideStateSchema),
  restrictions: z.record(restrictionKeySchema, restrictionStateSchema),
  unknownKeys: z.array(z.string()),
  effective: z.array(permissionKeySchema),
});
export type MemberPermissionsDto = z.infer<typeof memberPermissionsSchema>;

export const saveOverridesInput = z.object({
  companyId: z.uuid(),
  userId: z.string().min(1),
  overrides: z.record(editablePermissionSchema, overrideStateSchema),
  restrictions: z.record(restrictionKeySchema, restrictionStateSchema),
});
```

Server functions in `src/modules/permissions/functions/permission-admin.functions.ts`:

- `listMemberPermissionsFn({ companyId }) → MemberPermissionsDto[]`
- `saveMemberOverridesFn(saveOverridesInput) → MemberPermissionsDto`

C3 in `src/modules/invitations/functions/invitation.functions.ts`:

- `acceptInviteAsSignedInFn({ token }) → { companyId }` — requires a session; calls
  `accept_invitation(hash, session.user.email)` through `withUser(session.user.id)`.

## Permissions (who can, who cannot)

| Action | owner | branch_manager | others | anonymous |
|---|---|---|---|---|
| Open `/app/permissions`, list, save | ✓ | — | — | — |
| Sign in with phone passkey | — | — | ✓ if bound | ✓ (that is the sign-in) |
| Accept invite as signed-in user | ✓ email match | ✓ email match | ✓ email match | — |

## Tests

- Domain: `overrideStates ↔ rows` mapping (default/allow/deny round-trip), owner and
  `permissions.manage` rejected, self-edit rejected.
- Use case `save-member-overrides`: replaces only editable keys, keeps legacy keys, writes one
  audit row; `MEMBER_NOT_FOUND` for a non-member.
- Integration on `pospay_test`: owner saves, `has_permission` for the target changes; manager with
  `permissions.manage=allow` is refused by RLS; cross-company write refused.
- SQL: isolation cases above; migration applied twice.
- UI: page renders owner read-only card and editable cards; save sends the right payload;
  responsive smoke at 375/768/1280 in the verification notes.
- C2: unbind deletes the passkey row (integration); sign-in button hidden without WebAuthn.
- C3: signed-in accept creates a membership and no user; email mismatch message; signed-out
  existing account redirected to sign-in and back.

## Open questions → owner-questions.ar.md

- None. Waleed decided on 2026-11-19 that the owner manages the five restriction keys too (B3b).
