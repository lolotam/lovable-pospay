# Next: close Slice 003 review (no production changes)

## Goal
Finish the one open item that does not wait on Waleed: the 003 standards review (persistence/use-case placement and port orchestration).

## Steps
1. Re-read AGENTS.md, app-architecture.md, the 003 spec and the card/services/reports modules.
2. Move any orchestration living in `*.server.ts` persistence files into `use-cases/` behind ports in `ports/`; persistence only implements the ports.
3. Ensure each file < 400 lines and each function < 60; Arabic JSDoc on domain/ports.
4. Add/adjust unit tests for the use-cases with fake ports; keep existing integration tests on local `pospay_test`.
5. Run tests serially, lint, and build; fix failures caused by the change.
6. Run an independent code review; fix P0/P1, log P2/P3 in roadmap.
7. Update roadmap.md row "003 final review closure" with verified results.

## Out of scope (waits on external gates)
- Authenticated/scanner acceptance (preview auth not configured).
- Production migrations 0011/0012, deploy, Dokploy env (needs Waleed approval).
- Service session recording (workflow and discount rule ق-1 not approved).
- Google login (postponed).
