# Email OTP recovery and Google sign-in

Approved by Waleed on 2026-11-18. Better Auth remains the only identity system.

- Existing users request a six-digit code through official Resend, then verify it before choosing Continue or Change password.
- Continue means passwordless email authentication, not proof that a password was entered.
- Both actions consume the same recovery OTP; reuse and concurrent competing actions must fail.
- Change password asks for password and confirmation, retains existing password limits and revokes previous sessions.
- Use Better Auth's verification storage, hashed OTPs, its default five-minute expiry and three-attempt limit. No additional reset tables.
- Existing management TOTP must apply to email OTP and Google sign-in, not just email/password.
- Google login must not enable public signup or automatically link an unverified existing account; configure the app's own Google OAuth client securely.
- Keep the existing reset-link page operational for previously issued links.
- Test at the established Better Auth API seam with memoryAdapter, and the existing Resend delivery seam; browser-check the public UI. Real delivery and Google OAuth require deployed credentials.
- Production connection and Resend environment corrections are approved, but existing secret values must be preserved and never printed.
- Waleed's approval to proceed with attendance and Phase 1 is not verification evidence; barcode authorization/issuance/revocation/eligibility remain TODO(spec).