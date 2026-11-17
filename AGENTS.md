<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## PosPay architecture (PRD Phase 1 §10)

- Backend is self-hosted Supabase Postgres reached with `pg` from server code (`DATABASE_URL`); Lovable Cloud is not used — the client chose self-hosting.
- Auth is Better Auth (`src/lib/server/auth.server.ts`, handler at `/api/auth/$`); never use Supabase Auth — one identity system.
- App SQL lives in `db/migrations/` (numbered, idempotent, applied with psql); `supabase/migrations/` stays unused because no Lovable-managed DB exists.
- Every app query goes through `withUser()` (role `pospay_app` + `app.user_id`) so RLS enforces company isolation in the database, not in code.
- Each new tenant table needs `company_id`, RLS policies via `is_member`/`has_company_role`, grants to `pospay_app`, and a case in `db/tests/isolation.sql`.
- Roles live in `memberships`, never on the user row, to prevent privilege escalation.
- Production builds use the Dockerfile with `NITRO_PRESET=node-server` for Dokploy; the Lovable preview keeps its own preset.
- Server-only modules end in `.server.ts` and are imported dynamically inside server function handlers to stay out of the client bundle.
