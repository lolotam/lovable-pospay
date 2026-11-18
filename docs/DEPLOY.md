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
