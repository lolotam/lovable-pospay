# Default verification runner Implementation Plan

> **For agentic workers:** Use executing-plans inline; fresh read-only final review.

**Goal:** Make standard local verification deterministic without weakening coverage.
**Architecture:** Configure Vitest file scheduling in its existing config. Extend
ESLint global ignores for generated cache trees; preserve all authored-code rules.
**Tech Stack:** Vitest 4, ESLint 9, Prettier.
**Spec:** `docs/specs/009-verification-runner/spec.md`

## Global Constraints
- Keep connected lovable branch, no switches/push/merge or external mutations.
- No runtime functionality, auth, secrets, env or shared database changes.
- Never weaken/remove assertions or lint rules. File serialization is not disabling
  concurrency inside individual tests.

## Review Focus
- All integration suites still execute with explicit disposable database.
- Concurrent checkout tests still start two real transactions together.
- Generated cache excludes cannot hide authored code or tests.
- Lint still rejects forbidden imports and syntax violations.
- Formatting must not alter API, SQL or values.

### Task 1: Repair default checks
**Files:** modify `vitest.config.ts`, `eslint.config.js`; create
`src/test/lint-scope.test.ts`; format only authored files reported by lint as needed.
**Interfaces:** existing bun run test/lint unchanged; Vitest test.fileParallelism=false;
ESLint real isPathIgnored/lintText behavior tested.
- [ ] Write lint-scope tests using ESLint.isPathIgnored for generated paths and
  source; lintText of authored forbidden `server-only` import must report
  no-restricted-imports. Run single file: expected cache-path test FAIL.
- [ ] Run default full suite with disposable URL: expected DDL race failure.
- [ ] Add generated cache/build global ignores; set fileParallelism:false in
  existing Vitest test config. Run lint-scope test: expected PASS.
- [ ] Run full lint, fix legitimate reported errors without disabling rules;
  use Prettier on formatting failures. Run default full suite twice: expected PASS.
- [ ] Inspect diff/harness build, commit and fresh review against starting HEAD.
  Record results, exclusions and remaining gates in verification.md and roadmap.md.