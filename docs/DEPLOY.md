# Deploying PosPay (GitHub → Dokploy, self-hosted Supabase)

1. In Dokploy create an Application from the GitHub repo, build type **Dockerfile**, port 3000.
2. Set environment variables from `.env.example` (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WhatsApp).
3. Create the auth tables once: `DATABASE_URL=... bunx @better-auth/cli migrate --config src/lib/server/auth.server.ts`
4. Apply app SQL in order: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_tenancy_foundation.sql`
5. Grant the app role to the connection user: `grant pospay_app to <db_user>;`
6. Run the isolation test: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/isolation.sql` → `isolation: PASS`
7. Backups (D-11): daily `pg_dump` via Dokploy scheduled backup.
