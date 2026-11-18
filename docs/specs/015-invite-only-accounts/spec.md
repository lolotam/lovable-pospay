# 015 — Invite-only accounts (Waleed 2026-11-18)

## Rule
No public sign-up. Salon owner or branch manager invites by email; the invitee opens the link and sets name + password.

## Acceptance
- Owner invites any role except owner; branch manager cannot invite owner/branch_manager; others cannot invite (RLS).
- Link valid 7 days, single use; only a SHA-256 hash is stored.
- Accept creates a verified Better Auth account with the invited email only; membership role/branch come from the invite.
- Existing email → `ACCOUNT_EXISTS` (no takeover); failed accept deletes the just-created account.
- Invite email via Resend; if not sent, the inviter gets the link to share.
- Revoke pending invites; all actions audited; no cross-company leak (`db/tests/isolation.sql`).

## Plan
0015 migration → token domain → persistence + account creation → server fns → `/team` and `/invite` → SQL + integration tests.

## Open
- First salon owner / super admin bootstrap still needs a one-time database-owner action (no invite issuer exists yet).
