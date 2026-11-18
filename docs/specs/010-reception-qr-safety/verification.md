# 010 verification — 2026-11-18, 07:38 Kuwait

## Writes and results
- Wrote spec then implementation plan before implementation.
- New browser lifecycle hook + canonical ReceptionQr wiring: single-flight 50-second
  polling, expiry independent of hanging RPC, old-branch isolation, focus/visibility
  resume handling and failure recovery. No server signature/auth changes.
- New search contract + module export + reception route wiring: malformed branch
  values show the existing localized missing-branch state, not the root error boundary.
- Added two i18n statuses, ReceptionQrProps barrel export and component enrichment.
- Added 11 lifecycle and 6 search regression/characterization tests.
- Updated roadmap after checks; no environment, secret, shared DB, server, deploy,
  repository branch, PR or CI writes.

## Evidence
- Initial expiry test RED: old image still visible after 60,000 ms. GREEN after fix.
- Malformed-search RED: 4 cases throw; GREEN after safe catch.
- Branch A → B → A regression RED: original image resurrected. GREEN after clearing
  state when each new lifecycle starts.
- Full `bun run test`, explicit disposable localhost pospay_test at port 55433:
  **102/102 pass, 18 files, 0 skipped**, including real DB isolation/concurrency.
- Full `bun run lint`: **0 errors, 6 preexisting warnings**, exit 0.
- `git diff --check`: pass. Latest harness signal **build OK 04:37:58 UTC**.
- Manual typecheck/build not run: harness owns these checks. PR/CI not run.
- Playwright missing/invalid/unconfigured reception URLs at 390x844, 820x1180,
  1280x1800 light/dark: **18 states pass**, no image or horizontal overflow;
  screenshots inspected. Invalid URL originally reproduced the root error boundary.
- All 11 content-route head declarations inspected; unique titles/descriptions and
  OG/twitter metadata retained. No absolute meaningful cover image to tag.

## Independent review and rulings
- Ask Matt → implement/TDD workflow; fresh capable Standards and Spec reviewers
  inspected the full current task range against 9daa2483cfee1d1823cc9ad5cb9898544cdc4569.
- Standards: route contract import fixed through module barrel. Added RPC-latency,
  late-bitmap and unmount characterization tests as requested. These passed without
  extra code changes; expiry/search/branch-return are the RED→GREEN regressions.
- Spec: missing verification/tracker evidence now recorded here; latency cases covered.
- Minor deferred: bitmap encoding can still start for a response arriving after
  cleanup; active guard prevents publishing it. This is unnecessary canvas work,
  not incorrect visible state, and no extra optimization was folded into this slice.
- Retained connected lovable branch because platform forbids switching; no PR/merge.
- Display deadline reserves one second for server issuance timestamp flooring;
  server lifetime remains 60 seconds. This can hide a valid code slightly early,
  never extend its validity. Auth and signature verification stay authoritative.
- AGENTS structural-rule append refused by 6144-byte budget; existing user-owned
  rules left intact, per instruction to skip save rather than shorten them.

## Remaining gates
Actual signed-in QR issuance/phone scanning, manager UI acceptance, physical-device
exclusivity and external PR/CI remain **unverified**, blocked by unavailable preview
Better Auth configuration. No production/configuration change attempted.