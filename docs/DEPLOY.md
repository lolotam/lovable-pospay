# Deploying PosPay (GitHub → Dokploy, self-hosted Supabase)

1. In Dokploy create an Application from the GitHub repo, build type **Dockerfile**, port 3000.
2. Set environment variables from `.env.example` (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WhatsApp).
3. Apply all numbered migrations twice to disposable local `pospay_test` and run all isolation scripts there. The scripts insert fixtures. For local `psql` migration runs, use an explicit disposable database connection, `--single-transaction`, and `ON_ERROR_STOP=1`.
4. After separate production migration approval, use the `supabase-pospay` connector to review `list_migrations`, then apply outstanding `db/migrations/NNNN_*.sql` files in order, one `apply_migration` call per file. Stop at the first failure and resolve it through the approved migration process. Run `get_advisors` after the final migration. Verify migration and advisory results before switching roles or deploying the matching application revision. Migration 0006 creates the Better Auth tables.

5. Verify the dedicated application login and its `pospay_app` membership. Migration 0007 grants this membership to `pospay_server`. Complete the approved activation steps below before switching the pooler username.
6. Backups (D-11): daily `pg_dump` via Dokploy scheduled backup.

Before applying migration 0012, check the row estimate and size of production attendance records and run it in a low-traffic window. The report index uses a regular build in the migration transaction, with a two-second lock wait budget and five-second statement budget. If the table size suggests the build cannot finish within budget, or the attempt times out, stop and review a separately approved concurrent index build with the database operator before retrying.

Card scan recovery allows a seven-day retry window. Each saved result or cancellation removes up to 100 expired scan receipts across companies. Recovery allows five minutes of browser clock skew, and cleanup retains receipts for seven days and ten minutes. Attendance records and audit history follow their own retention.

Database provisioning is a separate approved operation. Run `db/seeds/super-admin.sql` as the database owner only after all migrations and after the intended Better Auth account has verified its email.

## Password recovery through Resend

- The linked Resend connection is gateway-backed; `RESEND_API_KEY` is a connection key, not a raw provider key.
- Dokploy needs both `LOVABLE_API_KEY` and the linked `RESEND_API_KEY` through secure environment configuration, plus the existing `BETTER_AUTH_URL`.
- Default sender: `PosPay <noreply@pospay.systems>`; `RESEND_FROM` can override it with a verified sender.
- Resend reports DKIM and SPF verified for `pospay.systems`; only receiving MX is pending. No Lovable email domain is configured, so there is no delegation conflict.
- Linking in Lovable does not synchronize secrets to Dokploy. Do not copy redacted values or commit credentials; production environment changes require explicit approval.
- Verify delivered link → password reset → old password rejected after deployment and database connectivity are working.

## Email OTP and Google login

- OTP uses the same Resend credentials; six digits, five-minute expiry, three guesses, hashed Better Auth verification storage. Existing reset links still work.
- Google needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for this app's own Web OAuth client. No workspace Gmail connector can replace this end-user login client.
- Authorized callback: `https://pospay-app-7dcc5d-82-29-164-194.sslip.io/api/auth/callback/google`; authorized JavaScript origin is the same origin without the path.
- Public signup remains disabled. Existing email accounts must be verified before implicit Google linking; Google does not grant company membership or platform administration.
- Migration 0007 creates `pospay_server` with `NOLOGIN`. Before switching the application username, the database administrator must enable `LOGIN` and verify the role has an approved password provisioned through the secrets channel. This is a production change and requires Waleed's approval.
- Once the administrator verifies the role can connect through the production pooler, switch the application username to `pospay_server.<tenant-id>` using the actual tenant identifier. Preserve existing environment and build secrets.
- On 2026-11-18 the SSH env inspection was refused with `APPROVAL_UNAVAILABLE`; Dokploy returns environment values redacted. No production environment was overwritten.
