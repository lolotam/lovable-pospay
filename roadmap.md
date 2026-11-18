# Roadmap

## Continuation (2026-11-18)
- [x] 008 / remaining 001 transition safety implementation — spec → plan → tests RED (3 failures) → rowCount guards GREEN (4/4); 81/81 full-suite tests pass with --no-file-parallelism, including SQL isolation. Fresh whole-range review: 0 Standards/Spec findings; commit 8bc5bf8. No shared DB/env/server/deploy writes.
- [ ] 008 verification gates — default parallel suites collide on shared local migration DDL (`tuple concurrently updated`); full lint SIGTERM after 120 seconds (exit 124), not a pass. Harness build OK; changed-file lint/diff check pass. Authenticated 001/002/007 acceptance and PR/CI gates remain open; see docs/specs/008-attendance-transition-safety/verification.md.
- [x] 007 / remaining 001 D-32 — spec → plan → manager correction screen implemented; original checkout retained, required reason, row lock, transactional audit, permission recheck and verified readback. 77 tests pass on disposable localhost pospay_test; changed-file lint passes; latest harness build OK. No shared DB/server/env/deploy writes.
- [ ] 007 authenticated UI acceptance — preview Better Auth not configured. Unavailable state + sign-in navigation verified at 390/820/1280 light/dark without horizontal overflow; actual manager list/save/readback not browser-verified. Full lint ended SIGTERM after 240 seconds; not a pass. PR/CI gates unrun.
- [x] 002 phone management selector implementation — company/staff names replace manual IDs; 4 repository permission tests pass on disposable PostgreSQL; authenticated browser acceptance remains open.
- [ ] 002 selector authenticated acceptance — preview has no configured Better Auth; unavailable state and phone → home → sign-in navigation checked at 390/820/1280 in light and dark (6 combinations), no horizontal overflow. Authenticated selection/unbinding not verified.
- [x] Continuation checks — 61 tests pass, 0 skipped (11 files); migrations 0001–0003 applied twice locally; changed-file ESLint passes; latest preview build OK. Full lint terminated after 180 seconds (SIGTERM), not a pass.
- [x] Code-review against 015dd57 — Standards: no confirmed violation; Spec: read error state improved. Permissions mirror existing D-40 RLS; unbinding already writes phone.unbound audit. Physical-device acceptance stays open; no PR/CI gate run from this sandbox.
- [ ] Production connection remains blocked: latest Dokploy logs show ENOIDENTIFIER; SSH read refused (`read-command only accepts read-only commands, got: safe`). No production settings changed.

## Approved authentication update (2026-11-18)
- [ ] Correct production pooler configuration and configure Resend in Dokploy — approved; blocked by redacted Dokploy env and SSH APPROVAL_UNAVAILABLE; no environment overwritten; production sign-in still HTTP 500
- [x] Six-digit email OTP recovery with a choice to continue sign-in or change password; hashed, single-use, expiry/attempt/concurrency/session tests pass; existing TOTP gate preserved
- [ ] Google sign-in for existing accounts only — postponed by Waleed until the end of Phase 1; UI/configuration added, credentials and callback/TOTP acceptance remain required
- [x] Recovery API and public phone/tablet UI checked; 54 tests passed, 3 integration tests skipped (no disposable DB configured); real email/Google acceptance remains open
- [ ] Clarify barcode rules before slice 003; Waleed accepted proceeding, not evidence of implementation or real-device checks

## Current request (2026-11-18)
- [x] Redeploy synchronized zod fix (51fdab3) — deployment done
- [ ] Production email sign-in — fails with ENOIDENTIFIER (pooler tenant identifier missing); environment correction needs approval
- [ ] Provision Waleed account and run super-admin seed — account creation decision needed; public signup is disabled
- [ ] Slice 003 barcode fallback — TODO(spec): operator authorization, card issuance/revocation and no-phone eligibility decisions
- [x] Password recovery UI + Better Auth policy: expiry/reuse protection, session revocation, origin validation; 6 API tests pass
- [ ] Enable password-recovery delivery — needs verified sender domain and Dokploy mail configuration
- [x] Link official Resend connection; sending DKIM/SPF verified for pospay.systems
- [x] Wire Better Auth reset sender through Resend connector gateway
- [ ] Resend production acceptance — Dokploy connector credentials + working DB + deploy required

- [x] Phase 1 foundation (DB + RLS, Better Auth, server functions, Dokploy)
- [x] AGENTS.md rules + app-architecture.md
- [x] Project files referenced by the rules (pipeline doc, ADRs, kernel, i18n, module skeleton)
- [x] Slice 001: attendance check-in via QR (code + tests)
- [x] Slice 001: apply migrations 0001/0002 twice and run isolation + attendance integration tests on disposable local PostgreSQL
- [ ] Slice 001: production migration + authenticated UI acceptance — waits on approved deployment/database setup
- [x] Slice 001: owner answers س1–س3 (both choices, 30-minute shift window, 60-second QR lifetime)
- [ ] Slice 002: Passkey one-phone binding (D-40, ق-4)
- [x] Slice 002: WebAuthn ownership checks, device-cookie gate, manager unbinding + SQL/security tests
- [ ] Slice 002: authenticated real-phone acceptance and physical-device exclusivity — needs configured auth and supported-phone verification
- [ ] Attendance questions for managers through AI Gateway — gateway disabled; no model calls allowed
- [ ] Slice 003: barcode card fallback (D-13)

## 004 Platform connectors (super admin)
- [x] Super-admin-only connectors page `/admin/connectors` (Codex, Kimi, MiniMax, Z.ai sign-in; OpenAI, Google AI, OpenRouter, MiniMax, Resend keys)
- [x] Apply 0004 on the real DB
- [ ] Run `db/seeds/super-admin.sql` after Better Auth tables + Waleed sign-up
- [x] Set `PLATFORM_SECRETS_KEY` in Dokploy (previous deployment setup)
- [ ] Wire attendance questions to the default connector instead of AI Gateway

## Tools setup
- [x] Document supabase-pospay / ssh / dokploy rules in AGENTS.md
- [x] List all DB variables in `.env.example`
- [x] Applied migrations 0001-0005 on supabase-pospay (security advisors: 0)
- [x] Super admin error/log diagnosis with default model (/admin/diagnose)
- [x] Micro dark mode + settings toggle (/settings)
- [x] Micro responsive pass for phone/tablet
- [x] 0007 `pospay_server` login role (RLS-bound, no bypass) applied on supabase-pospay; Dokploy `pospay-app` env has DATABASE_URL via pooler. Deploy waits on Waleed.
- [ ] Pooler port 5432/6543 is public on the host — consider firewalling (needs Waleed).

## First production deploy (2026-11-18)
- [x] Waleed approved deploy + free temporary domain (sslip.io)
- [x] pospay-app linked to GitHub `lolotam/lovable-pospay` branch `lovable`, Dockerfile build, autoDeploy OFF
- [x] Domain `pospay-app-7dcc5d-82-29-164-194.sslip.io` created; env saved (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, PLATFORM_SECRETS_KEY)
- [x] First build succeeded; site serves HTTP 200
- [x] Fixed runtime crash: better-auth needs zod v4 (`(void 0) is not a function`) — upgraded zod to 4.6.5, 34 tests pass, typecheck clean, committed 369b843
- [x] Redeploy zod fix from synchronized GitHub commit 51fdab3
- [ ] /api/auth/sign-in/email acceptance — zod crash resolved; pooler ENOIDENTIFIER returns 500
- [ ] After auth works: Waleed registers dr.vet.waleedtam@gmail.com, then run db/seeds/super-admin.sql
