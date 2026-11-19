# 017 — email: send through Resend directly in self-hosted production

## Requirement

Password reset links, email OTP codes and staff invitation links are sent through Lovable's
connector gateway (`https://connector-gateway.lovable.dev/resend/emails`), which needs both
`LOVABLE_API_KEY` and a gateway connection key in `RESEND_API_KEY`.

Production runs on Dokploy (self-hosted). It has a real Resend API key in `RESEND_API_KEY`
(starts with `re_`) and `BETTER_AUTH_URL`, but no `LOVABLE_API_KEY`: that key is managed by
Lovable and cannot be used outside it. So today all three emails are off in production.

When `LOVABLE_API_KEY` is absent and `RESEND_API_KEY` is set, PosPay sends through Resend's own
API (`https://api.resend.com/emails`). The Lovable preview keeps the gateway path.

## Business rules

- **R1. Transport choice** (one resolver used by every sender and by the sign-in options gate):

  | `LOVABLE_API_KEY` | `RESEND_API_KEY` | Transport |
  |---|---|---|
  | set | set | gateway (unchanged) |
  | empty / unset | set | direct Resend API |
  | set | empty / unset | off |
  | empty / unset | empty / unset | off |

  "Set" means a non-empty string. No key-prefix check: a wrong key fails at Resend with 401/403.
- **R2. Gateway request** stays byte-for-byte as today: `POST
  https://connector-gateway.lovable.dev/resend/emails`, `Authorization: Bearer LOVABLE_API_KEY`,
  `X-Connection-Api-Key: RESEND_API_KEY`.
- **R3. Direct request** (verified against Resend API docs, 2026-11-19):
  `POST https://api.resend.com/emails`, `Authorization: Bearer RESEND_API_KEY`,
  `Content-Type: application/json`, `User-Agent: PosPay/1.0` (Resend rejects requests without a
  User-Agent with 403 / error 1010). No `X-Connection-Api-Key`. Body is the same JSON as today:
  `from`, `to` (array), `subject`, `text`.
- **R4. Idempotency.** Password reset keeps `Idempotency-Key: password-reset-<token>` on both
  paths (Resend limit: 256 characters, 24 h). OTP and invitation emails stay without one: an
  OTP-derived key would put the code in a header, and Resend answers 409 when a key is reused with
  a different body.
- **R5. Feature gates follow R1.**
  - Password reset (`getResendPasswordSender`): on when transport ≠ off and `BETTER_AUTH_URL` set.
  - Email OTP (`getResendOtpSender` and `getSignInOptions().emailOtp`): same condition.
  - Invitation email (`sendInvitationEmail`): on when transport ≠ off (no `BETTER_AUTH_URL`
    check, as today); off returns `false` and the invitation is still created.
- **R6. Privacy.** Never log or put in an error message: links, tokens, OTP codes, recipients,
  keys, or Resend's response body. Errors carry the status only
  (`PASSWORD_RESET_DELIVERY_FAILED_<status>`, `EMAIL_OTP_DELIVERY_FAILED_<status>`).
- **R7. Sender.** `RESEND_FROM` overrides the sender; the default stays
  `PosPay <noreply@pospay.systems>`. Resend accepts it only if the domain is verified in the
  Resend account that owns the production key.
- **R8.** No DB migration, no new env var, no UI change. Reset link origin check
  (`INVALID_RESET_LINK`) and the 10 s timeout stay on both paths.

## Edge cases

- Both keys set in Dokploy by mistake → gateway path; it fails because `RESEND_API_KEY` is a raw
  key, not a connection key. DEPLOY.md says: do not add `LOVABLE_API_KEY` to Dokploy.
- `RESEND_API_KEY` set, `BETTER_AUTH_URL` unset → reset and OTP off, invitation email on.
- Resend 403 (missing domain verification, wrong key) → `..._FAILED_403`; nothing else leaks.
- Timeout → the fetch abort error propagates; Better Auth reports a generic failure.

## Acceptance criteria

1. With only `RESEND_API_KEY` + `BETTER_AUTH_URL`: reset, OTP and invitation each make exactly one
   `POST https://api.resend.com/emails` with `Authorization: Bearer <RESEND_API_KEY>`,
   `User-Agent: PosPay/1.0`, no `X-Connection-Api-Key`; reset also sends its Idempotency-Key.
2. With both keys: the request URL and headers equal today's gateway request.
3. `getSignInOptions().emailOtp` is `true` for rows 1–2 of R1 when `BETTER_AUTH_URL` is set,
   `false` otherwise.
4. A 403 from Resend gives `PASSWORD_RESET_DELIVERY_FAILED_403` / `EMAIL_OTP_DELIVERY_FAILED_403`
   / `false`, and the provider body appears in no error.
5. All existing tests in `src/lib/server/resend.test.ts` pass unchanged.

## Schema changes

None.

## Contract

No change to server function inputs or outputs. `getSignInOptions` keeps
`{ google: boolean; emailOtp: boolean }`.

## Permissions

Unchanged. Who may request a reset, an OTP or an invitation is decided by Better Auth and
`staff.manage`; this spec changes only the delivery transport.

## Tests

`src/lib/server/resend.test.ts` (Vitest, `fetch` stubbed, `LOVABLE_API_KEY` stubbed to `""` for
direct cases):

- resolver: the four rows of R1.
- direct reset: URL, bearer, User-Agent, Idempotency-Key, no connection header, `to` is the
  account email.
- direct OTP: URL, bearer, body contains the code, no Idempotency-Key.
- direct invitation: URL, bearer, returns `true`; 403 returns `false`.
- direct failure: error message is the status only, provider body absent.
- gate: `getSignInOptions` handler (or the pure gate it calls) for the R1 rows with and without
  `BETTER_AUTH_URL`.

## Open questions → owner (non-blocking)

- Confirm the production `re_` key belongs to the Resend account where `pospay.systems` is
  verified (DEPLOY.md's "DKIM/SPF verified" note was written about the Lovable-linked
  connection). If not, verify the domain there or set `RESEND_FROM` to a verified sender.
