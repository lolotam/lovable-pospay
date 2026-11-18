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
