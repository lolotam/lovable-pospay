# 009 verification — 2026-11-18, 07:28 Kuwait

## Writes
- Spec and implementation plan written before test/config changes.
- `vitest.config.ts`: sequential file scheduling; concurrency within tests unchanged.
- `eslint.config.js`: exclude only generated `.oj-cache/**` and `.tanstack/**`.
- `src/test/lint-scope.test.ts`: four real ESLint API checks; authored tests remain
  covered, forbidden imports still fail, cache trees are ignored.
- Prettier formatted 18 files reported by lint; no intentional behavior/API/value changes.
- `AGENTS.md`: one short rule documents shared-local-DDL file scheduling.
- `roadmap.md`: local gates tracked separately from authenticated acceptance and CI.
- Implementation saved as `7e2891b`; no production/env/secret/server/shared-DB writes.

## Evidence
- Before config: scope test 2 failed / 2 passed; default full suite 3 files failed,
  including migration DDL collision. No test or rule was removed/weakened.
- After config/formatting: default `bun run test` with explicit disposable
  `POSPAY_TEST_DATABASE_URL` passed 85/85 in 16 files on two consecutive runs;
  post-commit task-done run also 85/85. Zero skipped DB tests.
- Intentional checkout/new-shift concurrency and SQL isolation tests remain green.
- `bun run lint`: exit 0, 0 errors, 6 existing fast-refresh warnings in unchanged
  badge/button/form/navigation-menu/sidebar/toggle primitives.
- `git diff --check`: pass. Latest harness build signal: build OK, 04:25:39 UTC.
- Manual typecheck/build not run: harness owns these checks; external CI unrun.

## Browser regression check
Six pages inspected at 390x844, 820x1180 and 1280x1800 in light and dark, 36 states:
`/attend`, `/reception/qr`, `/admin/connectors`, `/admin/diagnose`, `/settings`, `/`.
No horizontal overflow; theme persists; navigation to `/sign-in` succeeds in all
six size/theme combinations. Contact sheet reviewed.
All 11 content routes retain their own title/description/OG metadata.

These are public/unconfigured checks, not authenticated acceptance. Reception QR
shows the existing error boundary in this state; actual QR/phone/manager flows
remain open until Better Auth is configured. No QR fix was folded into tooling work.

## Limits / rulings
- Connected lovable branch retained because platform forbids switching; no PR/merge.
- Formatting all 18 reported files was necessary to pass existing lint rules;
  no business changes authorized by this tooling slice.
- Existing 6 warnings retained, not suppressed. Real-device/authenticated acceptance,
  production configuration, barcode decisions and Google remain open.

## Fresh review
- Capable whole-range reviewer inspected `4ec57ee...7e2891b`: Standards 0 findings,
  Spec 0 functional findings. Independently reran the 4 ESLint API tests, all passed.
- Compared old/new authored sources after Prettier normalization: all 17 preexisting
  formatted files semantically unchanged. The 18th file is the new lint test.
- Reviewer flagged pending verification/tracker documentation in the implementation
  commit; this document and updated roadmap close that delivery gap.
- No deferred code findings. External CI and authenticated acceptance stay open.
## PR #1 review dispositions

- Phase 1 PRD: removed the obsolete confirmation note in section 10 and aligned the decision table with accepted ADR-0001.
- Reception metadata: use dictionary keys for the page and Open Graph text. The current app renders Arabic route metadata. Locale selection, including English metadata at runtime, is deferred to the broader localization work.
- Recovery plugin length: defer splitting the Better Auth hook wrapper to a focused refactor with the recovery and TOTP regressions. The wrapper owns the cookie handoff across the plugin hooks.
- Reception QR issuance, connector actions, and phone management: defer the three use-case boundary findings to separate module refactors. Preserve the existing transaction, RLS, and response-cookie boundaries when moving orchestration.
- Z.ai business OAuth: the [published ZCode client](https://github.com/zai-org/ZCode/blob/fec975905a2abd4c07e35c40d51fa097a2258ec9/packages/shared/src/project-access-token-client.ts#L307-L316) sends the raw login JWT to customer info. It [maps the API key response field](https://github.com/zai-org/ZCode/blob/fec975905a2abd4c07e35c40d51fa097a2258ec9/packages/shared/src/project-access-token-client.ts#L376-L396) to the [project token route ID](https://github.com/zai-org/ZCode/blob/fec975905a2abd4c07e35c40d51fa097a2258ec9/packages/shared/src/project-access-token-client.ts#L219-L231). Both match PosPay's connector. Verification used published source.
- Phone binding: the owner deferred the bound-passkey chooser to a separate change. Codex discussion 4609991931 remains open.

The signed floor helpers have no commission callers in this revision. The Phase 1 PRD keeps the commission adjustment decision open when a refund changes the sales tier. Original-period recalculation is the proposal, and item-level reversal remains an alternative. The money tests verify rounding and allocation only.
