# 016-B execution plan

The approved spec and implementation-plan.md Tasks 8–12 are the requirements; no PR or database writes are authorized for this delivery.

1. Prepare migration 0018 and extend isolation SQL; Codex owns later, separately authorized double-application and SQL execution on disposable pospay_test; neither is executed in this delivery.
2. Test the approved seams: loadSessionContext, selectWorkspace, cookie-backed server functions, SQL/domain parity, and moved-page denial checks.
3. Implement repository ports, pure use cases, withUser persistence, and dynamic server wiring. Replace the browser adapter with trusted RPCs.
4. Add permission checks without removing existing role, identity, RLS, recording, or device checks. Wire scoped overview readers and dashboard counts.
5. Run the full non-database suite serially, lint, preview verification and two-axis review; document all unverified database and real-account acceptance gates, then commit on the connected branch.

Constraints: no Better Auth configuration, secrets, production, server, deployment, supabase/migrations, branch switch, push or PR changes. Secure workspace cookie, HttpOnly, SameSite=Lax, path /, 180 days; invalid/stale choice cleared; unauthorized selection never writes a cookie.
