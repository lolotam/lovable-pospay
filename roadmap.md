# Roadmap

## Approved request (2026-11-18, 11:47 Kuwait)
- [x] 003 barcode fallback implementation: manager-only issue, immediate manager revocation, one active method per employee; company policy approval screen, printable cards and reception scanning. Decisions approved by Waleed.
- [x] Services catalog implementation: create/edit prices in bigint mills and employee assignments.
- [x] Operational reports implementation: date-range attendance, corrected checkouts and recorded service sessions; tenant/role isolation.
- [x] 003 final review closure (12:33 Kuwait): card issue/revoke orchestration moved to use-cases behind ports/card-repository.ts; persistence only implements the port. 5 new use-case tests; full suite 180/180 on local pospay_test; lint 0 errors on attendance; tsgo OK. Self-review at that revision. Independent review of the current release head is tracked separately in PR #5.
- [ ] Authenticated UI/physical scanner acceptance blocked by preview AUTH_NOT_CONFIGURED; production migrations/deployment and exact-head PR/CI remain external gates. Services session writer added in 011 (see below).
- [x] Local migrations 0011/0012 double-applied, tenant negative SQL and card/catalog/report integration verified. See docs/specs/003-barcode/verification.md for check evidence.

## Continuation (2026-11-18)
- [x] 010 / remaining 001 reception QR safety — spec → plan → expiry/search/branch-return RED → GREEN. Single-flight polling hides expired/previous-branch images; malformed search no longer enters error boundary. 102/102 serial tests pass, lint 0 errors/6 existing warnings, harness build OK; 18 browser size/theme/input states pass. Independent Standards/Spec review addressed import/export and evidence gaps; authenticated acceptance and external PR/CI remain open.
- [x] 009 / 008 local default-check blockers — spec → plan → RED → config/formatting; ordinary bun run test passes 85/85 twice (and post-commit), no skipped DB tests; full lint exits 0 with 0 errors/6 existing warnings. Generated caches excluded; authored coverage and intentional concurrency preserved. Commit 7e2891b; no shared DB/env/server/deploy writes.
- [x] 008 / remaining 001 transition safety implementation — spec → plan → tests RED (3 failures) → rowCount guards GREEN (4/4); 81/81 full-suite tests pass with --no-file-parallelism, including SQL isolation. Fresh whole-range review: 0 Standards/Spec findings; commit 8bc5bf8. No shared DB/env/server/deploy writes.
- [ ] 008 external verification gates — local runner/lint blockers resolved by 009 and malformed reception QR error boundary resolved by 010; authenticated 001/002/007 acceptance and PR/CI gates remain open. Real QR/phone acceptance not claimed. See docs/specs/010-reception-qr-safety/verification.md.
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

## 011 Service session recording (12:40 Kuwait)
- [x] Migration 0013 prepares client and session storage. Public session recording is deferred pending D-44. Operational reports exclude client phone fields under the slice 003 acceptance rule.
- [ ] TODO(spec) ق-1: price override and discount limit (D-44) — sessions use the catalog price snapshot until approved.
- [ ] Before enabling session recording, bind reused request IDs to the original normalized client, service, staff and occurrence data. Verify identical retries return the existing session and changed requests return a conflict.
- [ ] Production apply of 0011–0013 — needs Waleed approval. Authenticated UI acceptance unverified (preview auth not configured).
- [x] 012 تصدير تقارير الحضور/المصححة/الجلسات CSV وPDF
- [ ] ق-1 قرار تعديل السعر وحد الخصم (D-44) — مستني وليد
