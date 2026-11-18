# Deploying PosPay (GitHub → Dokploy, self-hosted Supabase)

1. In Dokploy create an Application from the GitHub repo, build type **Dockerfile**, port 3000.
2. Set environment variables from `.env.example` (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WhatsApp).
3. Create the auth tables once: `DATABASE_URL=... bunx @better-auth/cli migrate --config src/lib/server/auth.server.ts`
4. Apply app SQL in order: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_tenancy_foundation.sql`
5. Grant the app role to the connection user: `grant pospay_app to <db_user>;`
6. Run the isolation test: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/isolation.sql` → `isolation: PASS`
7. Backups (D-11): daily `pg_dump` via Dokploy scheduled backup.

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
