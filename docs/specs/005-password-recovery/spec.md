# Secure password recovery

- Sign-in offers a request-link form and a public `/reset-password` page.
- Better Auth owns token generation, expiry, consumption, password hashing and origin validation.
- Preserve Better Auth's existing password bounds (8–128 characters) and one-hour reset expiry.
- Successful resets revoke existing sessions; they do not sign the user in automatically.
- A known and unknown email receive the same request-success response. Never display raw server errors or reset tokens.
- Missing/invalid/expired tokens show an invalid-link state. Confirmation mismatch never submits.
- No password-reset sender is configured until the owned sender domain is verified and mail is wired in Dokploy. Do not claim delivery or log links as a fallback.
- Test seam: Better Auth public API with an in-memory adapter and captured mail callback, not shared production data.
- Production acceptance includes real delivered link → new password → old password rejected; pending mail configuration.