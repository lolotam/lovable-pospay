# CLAUDE.md

Project rules live in `AGENTS.md` (read it first; it holds the Lovable rules and PosPay architecture).

@AGENTS.md

## Delivery tiers (Light / Medium / Heavy Implementation Pipeline)

Owner decision, 2026-11-19 23:05 Kuwait (reference: PosPay PP-195, lolotam/PayPos.systems#1085).
Waleed verbatim: «ابعت بقي ملفات وخطة ال3 pip lines دي لكل المديرين علشان يسجلوها وينفزوها كقاعدة عنهم في كل الشغل ويعملولها merg علطول بدون مراجعة light task كاضافة وثائق في ملفات المشاريع cladue.md file and agent file»

**This repo has no staging.** `main` auto-deploys to production (Dokploy `pospay-app`), and every
merge to `main` is followed by a fast-forward of `lovable` (`git push origin origin/main:refs/heads/lovable`,
never force). "Deploy" below therefore means the production deploy that the merge triggers.

1. **Tier card before every new task** (side tasks and follow-up issues too): an AskUserQuestion card
   to Waleed in Arabic, 3 options, recommended first marked «(المقترح)»: the tier, the recommendation,
   a one-line reason, and an exception option (e.g. an extra review/step on top). Do not start before
   his answer. Put tier + exception in the delegation brief and the PR body. Fix rounds inside a running
   task need no new card.
2. **LIGHT:** docs, specs, plans, ADRs, `roadmap.md`/status files, `docs/user-journeys/`, i18n, small
   CSS/UI changes up to ~150 lines. Never money, permissions/auth, DB/migrations (`db/migrations/`),
   API/server functions, or a new dependency. Implemented by the manager or the cheapest lane. PR merged
   immediately on green CI (`ci.yml` `verify`), no bot wait. Ships with that merge's production deploy.
3. **MEDIUM:** max 3 review rounds; local review (`/code-review` plus the guard skills
   `clean-code-guard` / `test-guard` / `docs-guard`) + this repo's review bots (CodeRabbit, MergePilot,
   Codex connector — skip a bot stuck or out of quota > 1 h and say so in the merge report); CI green on
   the exact head. After round 3, P2/P3 → GitHub issues; P0/P1 block. Merge when green (production
   deploys on merge; batch Medium merges per day where practical).
4. **HEAVY** (migrations, money, permissions/auth, RLS/security, long background jobs): Claude Fable 5.2
   (medium) writes the implementation plan; Codex Astra 6.2 (medium) debates it ONE round before
   implementation; full review + CI with the 3-round cap. A PR with a migration, money or
   permissions/auth merges ONLY after Waleed's card approval, after all gates. Other Heavy work: the
   manager merges after all gates. A migration is applied to production Postgres before the merge, with
   a `pg_dump` backup first and a receipt (file checksum + post-apply verification) in the report.
5. **Implementer fallback, fixed order** (lanes this repo has): Light = manager / OpenCode GLM 5.3 →
   Claude Sonnet. Medium & Heavy = Kimi K3.1 Pro → MiniMax Code → OpenCode GLM 5.3 → Grok → Claude
   Sonnet (Heavy on Sonnet at high effort). After 2 failures or exhausted quota, move to the next lane
   without asking.
6. **Plan summary after every merge:** the active plan (e.g. Phase 1 in `roadmap.md`) in 3 parts —
   «ما تم» (main tasks done + PR numbers), «الباقي» (each remaining main task with its sub-tasks
   underneath and status), «التوصية». Side tasks are folded into the plan under their main task; keep
   `roadmap.md` in sync. End every report with these headings exactly: «المطلوب منك»،
   «الخطوة الجاية اللي أنصح بيها»، «ملاحظة» (write «مفيش» if none).

Unchanged by the tiers: production, server, secrets and HOLD stay Waleed's; no force push or history
rewrite; no `git commit -a`; no `--delete-branch`; never edit `supabase/migrations/` or generated files;
every PR that changes user-visible behavior adds `docs/user-journeys/<PR#>-<slug>.md`. Spec/plan-only
changes, previously pushed straight to `main`, now go through a Light PR merged on green CI.
