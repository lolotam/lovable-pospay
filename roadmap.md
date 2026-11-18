# Roadmap

- [x] Phase 1 foundation (DB + RLS, Better Auth, server functions, Dokploy)
- [x] AGENTS.md rules + app-architecture.md
- [x] Project files referenced by the rules (pipeline doc, ADRs, kernel, i18n, module skeleton)
- [x] Slice 001: attendance check-in via QR (code + tests)
- [x] Slice 001: apply migrations 0001/0002 twice and run isolation + attendance integration tests on disposable local PostgreSQL
- [ ] Slice 001: production migration + authenticated UI acceptance — waits on approved deployment/database setup
- [x] Slice 001: owner answers س1–س3 (both choices, 30-minute shift window, 60-second QR lifetime)
- [ ] Slice 002: Passkey one-phone binding (D-40, ق-4)
- [x] Slice 002: WebAuthn ownership checks, device-cookie gate, manager unbinding + SQL/security tests
- [ ] Slice 002: authenticated real-phone acceptance and physical-device exclusivity — needs configured auth and supported-phone verification
- [ ] Attendance questions for managers through AI Gateway — gateway disabled; no model calls allowed
- [ ] Slice 003: barcode card fallback (D-13)

## 004 Platform connectors (super admin)
- [x] Super-admin-only connectors page `/admin/connectors` (Codex, Kimi, MiniMax, Z.ai sign-in; OpenAI, Google AI, OpenRouter, MiniMax, Resend keys)
- [ ] Apply 0004 + `db/seeds/super-admin.sql` on the real DB — waits on Waleed
- [ ] Set `PLATFORM_SECRETS_KEY` in Dokploy — waits on Waleed
- [ ] Wire attendance questions to the default connector instead of AI Gateway
