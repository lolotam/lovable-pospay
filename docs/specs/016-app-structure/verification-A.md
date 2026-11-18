# 016-A frontend verification

## Delivered
Tasks 1–7 only: shared Zod DTO, pure permission/workspace rules, navigation filtering, browser-only adapter, four area layouts, mobile drawer, workspace chooser/switcher, user name and sign-out, landing, moved pages, query-preserving legacy redirects, no-access, reserved `/s/$slug`, dashboard links and system status.

Existing phone regression test now mounts the moved binding component; all its behavioral assertions remain intact. Existing auth configuration, server functions, persistence, SQL, and deployment settings were not modified.

## Adapter boundary
The user explicitly excluded new server functions. The temporary adapter calls existing Better Auth session, `getMyCompanies`, and the existing server-checked platform connector status endpoint. It never infers platform status from email. Workspace selection is browser-local and validated against the currently loaded memberships. Company role defaults only; branch names/IDs and business type are unavailable from the existing API. Part B must replace this with its trusted SessionContextDto, HttpOnly cookie and permission overrides. UI gates are not backend authorization; existing endpoint checks and RLS remain unchanged.

## Checks
- Specified tests RED before rule/navigation implementation; then GREEN.
- Full serial suite: 215 passed, 61 skipped in 9 database integration files. No disposable database was supplied or SQL executed for this task.
- Final affected tests: 20/20 passed after lint corrections.
- Full lint: 0 errors, 8 Fast Refresh warnings (6 existing, 2 mixed-export frontend modules).
- Latest harness preview build: OK. No manual build/typecheck run.
- Browser: 168 fixture-only checks passed. All new area content pages at 390/820/1280 in light/dark, no horizontal overflow; mobile drawer opens and Escape closes it; workspace chooser/switch/re-entry; sign-out changes landing CTA; zero-workspace state; no-access for reception reports and manager reception; old URLs retain query through sign-in redirect, including printed attendance token; reserved public route renders not-found.
- Screenshots inspected for mobile management and desktop dark platform dashboard.
- `git diff --check`: passed.

## Not verified
Real signed-in user acceptance, actual platform account, email/OTP/Google login, persistence-backed permissions/branch scope, production migrations, deployment and exact-head PR/CI are external gates. Browser response fixtures do not establish these.
