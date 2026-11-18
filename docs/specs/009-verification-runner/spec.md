# 009 — verification: reliable default checks

## Requirement
Close the independent default-check blockers recorded under 008 before claiming
Phase 1 acceptance. The ordinary test command must run every existing assertion
without same-database migration races; lint must inspect authored code, not cached
dependency bundles.

## Rules
- AGENTS.md / pipeline: do not remove tests, relax assertions or disable lint rules.
- Test fixtures only target explicitly supplied localhost pospay_test.
- Existing test files reapply migrations to the same database: schedule files
  sequentially while preserving intentional concurrency inside race tests.
- Ignore only generated/cache/build output in lint; retain authored code and tests.

## Acceptance
- Ordinary `bun run test` with disposable database runs all tests, no skipped DB cases,
  no `tuple concurrently updated` and exit 0 in two consecutive runs.
- ESLint API ignores `.oj-cache/v1/deps/probe.mjs` and `.tanstack/probe.ts` but not
  `src/test/probe.ts`; an authored file containing an actual forbidden import fails.
- Full `bun run lint` finishes; resolve reported authored-source issues without
  suppressing rules. Preserve behavior during formatting.
- No UI, business rules, production, server, secrets, shared database or deployment changes.

## Schema / permissions / contracts
No runtime schema, permission or API changes. Existing RLS/phone tests stay intact.

## Tests
Add ESLint behavioral scope test using its real API; run existing full test suite
with the default runner before and after the scheduling change. Run lint and inspect
harness build. Authenticated browser acceptance and PR/CI remain separate open gates.

## Open questions
None for local verification tooling.