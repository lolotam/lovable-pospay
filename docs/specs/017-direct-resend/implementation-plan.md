# 017 Implementation Plan

**Goal:** deliver `docs/specs/017-direct-resend/spec.md` in one PR.

**Executors:** Kimi K3.1 Pro implements (code + tests, no commit). Claude Code (acting for
Lovable) reviews, runs the gates, commits, opens the PR and handles bots. Waleed merges.

**Rules:** Arabic JSDoc on exported functions, files under 400 lines, functions under 60,
`.server.ts` modules imported dynamically inside server function handlers, never log secrets,
links, codes or recipients.

**Branch:** `feat/017-direct-resend`, one PR into `main`.

---

### Task 1: Transport resolver

**Files:** modify `src/lib/server/resend.server.ts`.

- [ ] Add an exported pure function `resolveResendTransport(env = process.env)` returning
  `{ url: string; headers: Record<string, string> } | undefined` per spec R1–R3:
  gateway when both keys are non-empty, direct when only `RESEND_API_KEY` is non-empty,
  `undefined` otherwise. Direct headers: `Authorization`, `Content-Type`,
  `User-Agent: PosPay/1.0`. Gateway headers: exactly today's three.
- [ ] Add an exported `isEmailRecoveryConfigured(env = process.env)`: transport defined and
  `BETTER_AUTH_URL` non-empty.
- [ ] One private `postEmail(transport, body, idempotencyKey?)` helper that does the `fetch`
  with `AbortSignal.timeout(10_000)` and returns the `Response`; the three senders use it, so the
  gateway URL string appears once.

### Task 2: Senders

**Files:** modify `src/lib/server/resend.server.ts`.

- [ ] `createResendPasswordSender(config)` keeps accepting today's config shape
  (`apiKey`, `connectionKey`, `from`, `origin`) so existing tests pass unchanged; add an optional
  way to pass a resolved transport (e.g. `transport?` field) used by `getResendPasswordSender`.
  Keep the origin/path check and `Idempotency-Key: password-reset-<token>`.
- [ ] `getResendPasswordSender()` returns `undefined` unless `isEmailRecoveryConfigured()`.
- [ ] `getResendOtpSender()` throws `EMAIL_OTP_NOT_CONFIGURED` unless configured; no
  Idempotency-Key.
- [ ] `sendInvitationEmail()` returns `false` when the transport is `undefined`.
- [ ] Error messages keep the status-only form; never read the response body.

### Task 3: Sign-in options gate

**Files:** modify `src/lib/auth-options.functions.ts`.

- [ ] `emailOtp` = `isEmailRecoveryConfigured()`, loaded with `await import(...)` inside the
  handler (the file is imported by `src/routes/sign-in.tsx`). The handler becomes async; the
  return shape is unchanged.

### Task 4: Tests

**Files:** modify `src/lib/server/resend.test.ts` (existing cases untouched); create
`src/lib/auth-options.test.ts` only if the gate cannot be covered through
`isEmailRecoveryConfigured`.

- [ ] Cases listed in spec "Tests". Direct cases stub `LOVABLE_API_KEY` to `""` explicitly.

### Task 5: Docs in the PR

**Files:** modify `docs/DEPLOY.md` ("Password recovery through Resend"), `AGENTS.md` (the Resend
bullet outside the Lovable block).

- [ ] DEPLOY.md: Dokploy uses a raw Resend key in `RESEND_API_KEY` and must not set
  `LOVABLE_API_KEY`; the Lovable preview keeps the gateway; invitations also use it.
- [ ] AGENTS.md: replace "Resend runtime calls use the linked connector gateway..." with the
  two-path rule.

## Gates (Claude Code)

`bun run test`, `node_modules/.bin/tsc.exe --noEmit -p .`, `npx eslint .` (0 errors, baseline
8 warnings), `NITRO_PRESET=node-server bun run build`; then PR, CI and bot review on the final
head. Waleed: confirm the Resend domain for the production key; no production env change in
this task.
