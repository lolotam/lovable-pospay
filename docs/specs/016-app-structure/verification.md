# 016-B verification — 2026-11-18, 21:42 Kuwait

## Delivered sources (Tasks 8–11)

- Prepared `db/migrations/0018_app_structure.sql` from the approved Task 8 SQL: business type, role defaults, security-definer permission check and platform overview; public EXECUTE revoked, pospay_app granted. No new table or policy changes. Extended `db/tests/isolation.sql` with cross-company override read/write and permission refusal.
- Added repository port, pure load/select use cases, withUser persistence, dynamic server functions and Secure/HttpOnly/SameSite=Lax `pospay-ws` cookie (path `/`, 15552000 seconds). Every session read revalidates membership; malformed/stale choices clear the cookie; foreign company/role/platform selections never write it.
- Replaced browser-only adapter and localStorage workspace selection with trusted RPCs. Existing guards consume the unchanged DTO.
- Added permission checks alongside existing identity/role/RLS checks for reports, corrections, cards, phones management, catalog, discounts, team invitations and reception QR/cards/sessions. Self phone binding and public invitations remain unchanged; session recording remains disabled by its existing availability gate.
- Wired platform, company and staff dashboard state; branch manager counts use the selected membership branch and branch-local current date. i18n keys added in both languages.

## Actual checks

- `bun run test --no-file-parallelism`: **248 passed, 124 skipped**, 60 files (48 passed, 12 skipped), 94.11 seconds. Skipped tests are database integration tests; POSPAY_TEST_DATABASE_URL is absent. No SQL fixture or migration was executed.
- Added 33 passing tests and 63 pending database tests relative to Part A's 215 passed / 61 skipped.
- `bun run lint`: exit 0, **0 errors / 8 existing warnings**. New overview query constants separated from components.
- Latest harness typecheck/build: **build OK**, 2026-11-18T18:40:22Z. Earlier transient missing-file and overview type errors were corrected. Manual build/typecheck not run: platform harness owns them.
- `git diff --check`: passed. New permissions files are below 400 lines. Inspected content-route head metadata; no missing content heads found.
- Playwright public checks: **10 passed**: landing overflow checks at 390/820/1280 in light/dark, three 307 redirects preserving query, and protected reports redirecting to sign-in. No page errors. Screenshots inspected at `/tmp/browser/016-b/landing-dark.png` and `signed-out.png` (temporary, not repository artifacts).

## Acceptance 1–7

1. Platform-only login/landing/sign-out: unit/guard logic covered; real Better Auth account acceptance **not verified**.
2. Owner A/staff B switch and new-login persistence: use-case/cookie tests pass; real login/browser switch **not verified**.
3. Reception no-access and no reports request: prior guard tests and new endpoint-denial tests pass; authenticated browser **not verified**.
4. Branch manager allow/deny: domain/navigation/guard/endpoint tests pass; new real SQL parity and handler tests **not executed**.
5. Legacy redirects: 307 responses preserve reports/reception/printed-attendance query strings in browser checks.
6. Public landing tested at all required sizes/themes; authenticated area drawers retain Part A structure, but were **not reverified with a real session** in Part B.
7. Cross-company overrides: negative SQL prepared; **not executed**.

## Review and approved-plan discrepancies

Two independent axes reviewed the changes using the code-review workflow. Fixed architecture/import findings, overview DTO mismatch and missing handler-denial coverage. Named clean-code-guard/test-guard/docs-guard tools are unavailable; source/test/docs review used instead, not claimed as tool execution.

Two specification inconsistencies were not silently rewritten:

- `has_permission(company,key)` is account-level by design: it grants what any role the person holds in that company grants (deny still wins, owner still immune), matching how RLS already authorizes. The workspace only narrows navigation and route guards; it is a view, not a security boundary, because the person holds that authority in any workspace. Parity tests cover each role × key.
- Stale remembered choice: the cookie is cleared and R2 applies again in the same read, so a sole remaining workspace is entered directly (spec R2 and edge case; the plan's Task 9 wording was corrected to match).

## Writes and external gates

Repository writes only: migration/isolation source, permissions module, attendance/staff overview readers and server exports, existing endpoint permission wiring, dashboard loaders/presentation, translations, regression/integration test sources, AGENTS.md, execution plan and roadmap. No database, production, server, deploy, secrets, Better Auth configuration or supabase/migrations writes. No PR or manual push; commit stays on connected `lovable` because branch switching is disallowed here.

Codex owns subsequent disposable pospay_test SQL verification, double-application, isolation and seeded-account acceptance. Waleed opens the PR and runs CI/review as requested; production migration/deploy require separate approval. The plan is implemented in source, **not fully acceptance-verified**.
