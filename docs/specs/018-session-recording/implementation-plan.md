# 018 Implementation Plan

**Goal:** deliver `docs/specs/018-session-recording/spec.md` in one PR.

**Executors:** Kimi K3.1 Pro implements (SQL, code, tests; no commit). Claude Code (acting for
Lovable) reviews, runs the gates on the disposable `pospay_test` container, commits, opens the PR
and handles bots. Waleed applies `0023` in production first, then merges (merging `main`
deploys at once, and the app writes `request_fingerprint`, which does not exist before `0023`).

**Rules:** money as `bigint` mills, never float; Arabic JSDoc on domain, ports and exported
use-case functions; every UI string through `t()` in both `src/i18n/ar.json` and `en.json`;
files under 400 lines, functions under 60; `.server.ts` imported dynamically inside handlers;
every query through `withUser()`; never loosen or delete a test — rewrite tests whose intended
behavior changes. Do not touch `supabase/migrations/`.

**Branch:** `feat/018-session-recording`, one PR into `main`.

---

### Task 1: Migration 0023 and isolation case

**Files:** create `db/migrations/0023_session_recording.sql`; modify `db/tests/isolation.sql`.

- [ ] Header comment: slice 018, idempotent session requests.
- [ ] `alter table public.service_sessions add column if not exists request_fingerprint text;`
- [ ] `do $$ … $$` that adds `service_sessions_request_fingerprint_hex`
  `check (request_fingerprint ~ '^[0-9a-f]{64}$')` only if `pg_constraint` lacks it
  (same pattern as `service_sessions_client_fk` in 0013).
- [ ] `create or replace function public.recorded_session_replay(_company uuid, _id uuid,
  _payload text) returns text language plpgsql stable security definer
  set search_path=pg_catalog`:
  - `if not public.session_writer_any(_company) then raise exception 'FORBIDDEN'; end if;`
  - read `recorded_by, branch_id, request_fingerprint` of `(company_id,id)=(_company,_id)`;
  - not found → `'new'`;
  - `recorded_by = public.current_app_user()` and `public.session_writer(_company, branch_id)`
    and `request_fingerprint = encode(sha256(convert_to(_payload,'UTF8')),'hex')` → `'replay'`;
  - otherwise (including a null fingerprint) → `'conflict'`.
- [ ] `revoke all on function … from public; grant execute on function … to pospay_app;`
- [ ] Do **not** re-create `sessions_insert` or any 0014 object.
- [ ] `isolation.sql`: as `user-a` (company A owner), calling
  `public.recorded_session_replay('…0b', <a B session id>, 'x')` raises `FORBIDDEN`
  (wrap in a `do` block with `exception when others` that checks `sqlerrm = 'FORBIDDEN'`, same
  style as the file's other negative checks).
- [ ] Claude Code: apply 0023 twice on `pospay_test`, then all `db/tests/*.sql`.

### Task 2: Domain

**Files:** create `src/modules/services/domain/session-request.ts` and
`session-request.test.ts`; modify `src/modules/services/domain/discount.test.ts`.

- [ ] `sessionRequestPayload(input)` → canonical string,
  `JSON.stringify(["session-request-v1", serviceId.toLowerCase(), staffId.toLowerCase(),
  clientName.trim(), normalizedPhone, occurredAt, priceMills?.toString() ?? null,
  reason.trim() || null])`. The caller passes the already-normalized phone and the entered price
  in mills (`undefined` when no price was entered). Arabic JSDoc.
- [ ] Tests: equal for inputs differing only in id case / name whitespace; different when any one
  of service, staff, name, phone, time, price, reason changes; "no price" ≠ price equal to list.
- [ ] `discount.test.ts`: add the ق-1 case — list `100000n`, cap 10: `90000n` ok, `85000n` →
  `DISCOUNT_OVER_LIMIT`, `100001n` → `PRICE_ABOVE_LIST`.

### Task 3: Port, persistence, use case

**Files:** modify `src/modules/services/ports/session-repository.ts`,
`src/modules/services/persistence/session.server.ts`,
`src/modules/services/use-cases/record-session.ts`, `record-session.test.ts`.

- [ ] Port: replace `lockRecordedSession(id): Promise<boolean>` with
  `claimRequest(id: string, payload: string): Promise<"new" | "replay" | "conflict">`
  (Arabic JSDoc: takes the advisory lock and reports the key state). `NewSession` gains
  `requestPayload: string`.
- [ ] Persistence: `claimRequest` keeps the existing `pg_advisory_xact_lock(hashtextextended(
  'service-session:<company lower>:<id lower>', 0))`, then
  `select public.recorded_session_replay($1,$2,$3) as state`. `insertSession` adds column
  `request_fingerprint` with value `encode(sha256(convert_to($13,'UTF8')),'hex')`.
- [ ] Use case order: normalize phone and name → compute payload (entered price parsed with
  `servicePrice` only when present) → `claimRequest` → `replay` returns
  `{ id, replayed: true }`, `conflict` throws `IDEMPOTENCY_CONFLICT` → then the existing
  assignment, `canWrite`, time, future, discount, client upsert, insert, audit → return
  `{ id, replayed: false }`. Keep each function under 60 lines (extract a helper if needed).
- [ ] `recordAvailableSession` / `loadSessionForm`: keep the flag check; let them take the flag
  as an optional last parameter defaulting to `serviceSessionRecordingAvailable` so the kill
  switch stays unit-testable.
- [ ] Unit tests (fake repo): replay returns before `assignedService`/`canWrite` are called and
  writes nothing; conflict throws and writes nothing; new inserts once with the payload; the
  flag `false` still yields `SESSION_RECORDING_UNAVAILABLE` and the empty form.

### Task 4: Real-database idempotency test

**Files:** create `src/modules/services/persistence/session-idempotency.integration.test.ts`;
modify `src/modules/services/persistence/session.integration.test.ts`,
`src/modules/permissions/persistence/charts.integration.test.ts`.

- [ ] New file, `describe.skipIf(!url)`, same localhost/`/pospay_test` guard as
  `session.integration.test.ts`. Fixture ids unique to this file:
  `18000000-0000-4000-8000-00000000000N`, user ids prefixed `i018-`. Apply the migration list of
  `session.integration.test.ts` plus `0018_app_structure`, `0020_permission_admin` if needed by
  `session_writer`, and `0023_session_recording`, twice. Clean up every fixture row in
  `afterAll` (sessions, clients, audit_log, discount_grants, assignments, catalog, staff,
  memberships, branches, company).
- [ ] Cases (spec acceptance 2–5): two concurrent + one sequential save with one key → one row,
  one `session.recorded` audit row, same id, `replayed` false/true/true; changed phone same key →
  `IDEMPOTENCY_CONFLICT`; second receptionist same key → `IDEMPOTENCY_CONFLICT`; still one row
  and one audit entry; deactivate the assignment then retry → `replayed: true`; ق-1 numbers with
  a list price of `100000` and a 10% role grant: 90.000 saved, 85.000 `DISCOUNT_OVER_LIMIT`,
  branch manager saves 85.000.
- [ ] `session.integration.test.ts`: add `0023_session_recording` to its migration list; the
  existing concurrent-duplicate assertion becomes `[{ id, replayed: false }, { id, replayed:
  true }]` in either order.
- [ ] `charts.integration.test.ts`: one case with a recorded session row showing `session_daily`
  count 1 and the exact revenue string for that day.

### Task 5: Switch on, UI, i18n, gate tests

**Files:** modify `src/modules/services/domain/session-availability.ts`,
`src/modules/services/ui/sessions-page.tsx`, `src/i18n/ar.json`, `src/i18n/en.json`,
`src/modules/services/functions/session.functions.test.ts`,
`src/modules/permissions/ui/area-guard.test.ts`,
`src/modules/permissions/use-cases/load-company-charts.test.ts`.

- [ ] Flag `true`; JSDoc (Arabic) says it is the kill switch and that D-44 / ق-1 are enforced
  in the domain and RLS.
- [ ] UI: add `IDEMPOTENCY_CONFLICT` to the mapped error codes; on that code set
  `request.current = null` so the next press uses a new key. No other UI change.
- [ ] i18n `sessions.IDEMPOTENCY_CONFLICT`: ar «تغيّرت بيانات هذا الطلب بعد إرساله. راجعي
  البيانات واضغطي حفظ مرة أخرى.», en "This request changed after it was sent. Check the details
  and press save again."
- [ ] `session.functions.test.ts`: rewrite "keeps … unavailable" to prove the gate is open: mock
  `@/lib/server/session.server` so `requireUserId` rejects `UNAUTHENTICATED`; both functions
  now reject with `UNAUTHENTICATED`, not `SESSION_RECORDING_UNAVAILABLE`.
- [ ] `area-guard.test.ts`: "keeps sessions gated" becomes "/pos/sessions needs pos.access":
  allowed with `pos.access`, refused without it.
- [ ] `load-company-charts.test.ts`: keep the `false` case; add one passing `true` and expecting
  the reader to receive `true`.
- [ ] Run the full suite; fix any other test that relied on the old constant by updating it to the
  intended behavior.

### Task 6: Close

- [ ] `roadmap.md`: mark the slice-011 idempotency line done with the PR number; replace the stale
  «مستني وليد» D-44 lines with a pointer to this spec and its open questions.
- [ ] `docs/specs/018-session-recording/verification.md`: gates run, their output counts, and
  what was not verified (authenticated browser flow).
- [ ] PR body: migration `0023` must be applied by Waleed before merge; Q1–Q5 listed.
