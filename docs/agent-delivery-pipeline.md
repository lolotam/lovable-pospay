# Agent delivery pipeline

How every slice moves from idea to merge. Applies to every agent.

1. **Spec** — `docs/specs/NNN-<module>-<use-case>/spec.md` from `docs/specs/_template.md`.
   Unknown business rules → `owner-questions.ar.md` (answer `PENDING`) + `TODO(spec)` in code.
2. **Branch** — `feat/p1-<NNN>-<short-name>` from `main`. Never commit to `main`.
3. **Build order** — Zod contract → migration + RLS + grants → domain + tests → use case →
   persistence → server function → UI (see `app-architecture.md` §10).
4. **Checks** — `bun run lint`, typecheck, `bun run test`, `db/tests/isolation.sql`. Report results as facts.
5. **PR** — one slice per PR, title with Kuwait time. Body: what changed, checks run with output, what waits on Waleed.
6. **Review** — CI green on the exact head, review finished on that head, no unresolved threads.
   Max 3 rounds; leftover P2/P3 become issues.
7. **Merge** — only then. Never `--force`, `--delete-branch`, or `git commit -a`.
8. **HOLD** — production, servers, secrets and deploy changes wait for Waleed's direct decision.
