# 018 — services: turn on service-session recording safely

Written 2026-11-19 11:51 (Kuwait) from `main` at `aa6c559`. Reserved migration:
`db/migrations/0023_session_recording.sql` (0024 belongs to the commissions slice; 017 has none).

## Requirement

Reception, branch managers and owners record each performed service session (D-15, D-43) at
`/pos/sessions`. The code, the table and the discount cap already exist (slices 011 / 013,
migrations 0013, 0014, 0016), but the whole feature is switched off by
`serviceSessionRecordingAvailable = false` in
`src/modules/services/domain/session-availability.ts`. The flag hides the page and the navigation
item, makes both server functions refuse, and hides the session chart on `/app` (016-D C5).

Before the flag is switched on, two things must hold:

1. **Price and discount** follow the recorded D-44 / ق-1 decision (below), enforced in the
   domain and in RLS.
2. **Idempotency:** one press of "save" or one retried request records the session once.
   Pressing save twice, a network retry, or two tabs sending the same request never creates a
   second row, a second audit entry or a second client upsert.

This slice closes both gaps and switches the flag on. It adds no new business rule; anything not
decided in the docs is listed under "Open questions" and the safe current behavior is kept.

## Recorded decisions this slice relies on

Quoted with their exact status. No stronger record exists on any branch, in PR #5/#7 or in the
project memory (searched 2026-11-19).

- **D-44 ✅** (`docs/PRD-phase1.ar.md` §5): «الاستقبال يقدر يعدّل السعر. كل شخص له حد خصم يحدده
  المدير كصلاحية. فوق الحد يعتمد المدير برقم PIN على الجهاز أو بطلب عن بُعد.»
- **ق-1** (PRD §12.1 and §13.2), status «مقبولة مبدئياً من المالك حتى يرد العميل»: the reference
  is «سعر القائمة الساري عند تسجيل الجلسة»; the total reduction from it to the final price is what
  counts against the limit «مهما كانت طريقة إدخاله». Expected result: list 100.000, reception
  limit 10% → 90.000 accepted; 85.000 needs the manager's approval before saving.
- **013** (`docs/specs/013-discount-grants/spec.md`, merged in PR #7): managers and owners have
  a 100% limit; others get a percent grant per role or per member; no grant means no discount;
  the limit is inclusive; no price above the service price; a discount needs a reason; the limit
  is enforced in RLS `sessions_insert`; the list price must equal the catalog price.
- **D-30, D-43, D-49:** one client per company by phone; reception enters name and phone;
  forgotten sessions keep their real date and show as late.
- **Idempotency rule** (`roadmap.md`, slice 011): «bind reused request IDs to the original
  normalized client, service, staff and occurrence data. Verify identical retries return the
  existing session and changed requests return a conflict.»

`roadmap.md` lines that still say D-44 is «مستني وليد» are stale; this spec supersedes them.

## Business rules

### Price and discount (already built in 013; this slice verifies and keeps it)

- **P1.** The reference price is the catalog price of the service at the moment the session is
  saved (`service_catalog.price_mills`), stored as `list_price_mills`.
- **P2.** Reception enters one optional final price. The reduction is `list − final`, whatever way
  reception arrived at it (ق-1). There is no separate "discount amount" field.
- **P3.** Allowed when `final × 100 ≥ list × (100 − cap)`, in integer mills, no floats. The cap is
  `discount_cap(company)`: 100 for owner and branch manager, else the highest grant for the user or
  any of their roles, else 0.
- **P4.** `final > list` → `PRICE_ABOVE_LIST`. Below the cap → `DISCOUNT_OVER_LIMIT`. A reduced
  price with an empty reason → `DISCOUNT_REASON_REQUIRED`. No price entered → list price, no
  reason stored.
- **P5. Over the limit.** D-44 says a manager approves it (PIN on the device or a remote request).
  That approval flow is **not built** and its details are not decided (open question Q1). Until it
  exists, an over-limit save is refused with `DISCOUNT_OVER_LIMIT` and nothing is stored. A user
  whose own limit covers the price (owner, branch manager) can save it from their own account.
  The UI copy does not suggest a workaround.

### Idempotency (new in this slice)

- **I1. Key.** The form creates one `requestId` (UUID v4) per intended session and keeps it
  until the save succeeds or a field changes (current behavior in `sessions-page.tsx`). The key
  is the session's primary key: `service_sessions(company_id, id)` is already the unique
  constraint, so the database can never hold two rows for one key in one company.
- **I2. Bound payload.** The key is bound to the request as sent, normalized:
  service id, staff id (lower-case), trimmed client name, normalized phone, the local
  `occurredAt` string, the entered price in mills or "none", and the trimmed discount reason or
  "none". Server-resolved values (catalog price, client id, UTC time) are **not** part of it, so a
  catalog price change between the first try and the retry does not turn an honest retry into a
  conflict. The database stores `sha256` of this canonical payload in
  `service_sessions.request_fingerprint`.
- **I3. Replay first.** Under a transaction advisory lock on `(company, requestId)`, before any
  catalog, assignment or permission lookup, the server asks the database for the key's state:
  - `new` — no row: continue with the normal checks and insert.
  - `replay` — a row exists, recorded by the same user, who can still record in that row's branch,
    with the same fingerprint: return `{ id, replayed: true }` with no insert, no client upsert,
    no audit entry.
  - `conflict` — a row exists but another user recorded it, or the fingerprint differs, or the row
    has no fingerprint: refuse with `IDEMPOTENCY_CONFLICT`. Nothing is written.
- **I4. Concurrency.** Two identical requests at the same time: the lock serializes them; the
  first inserts, the second sees `replay`. Both return the same id; the table and `audit_log`
  each gain exactly one entry.
- **I5. Not covered.** A reload of the page or a new form fill gets a new key, so the same visit
  typed twice is two sessions. Detecting that would need a business rule (open question Q4).

### Switch-on

- **S1.** `serviceSessionRecordingAvailable` becomes `true`. The flag stays as the single kill
  switch: setting it back to `false` restores today's behavior everywhere.
- **S2.** With the flag on: `/pos/sessions` and its navigation item appear for users with
  `pos.access`; the server functions work; the `/app` session chart (016-D C5, SQL
  `session_daily`) appears for report readers.

## Edge cases

| Case | Result |
|---|---|
| Save pressed twice quickly | Button is disabled while busy; if two requests still go out, one row, both return the same id |
| Network drops after the server committed; reception presses save again | Same key and payload → `replay`, success message, still one row |
| Retry after the manager unassigned the service from the employee | `replay` (the replay check runs before the assignment check) |
| Retry after the catalog price changed, no price entered | `replay` (payload holds "no price", not the resolved price) |
| Same key, reception changed the phone without the form resetting the key (bug or crafted call) | `IDEMPOTENCY_CONFLICT`, nothing written; the form drops the key so the next press uses a new one |
| Same key sent by another receptionist | `IDEMPOTENCY_CONFLICT` |
| Recorder lost `sessions.record` before the retry | `FORBIDDEN` (the replay function first requires `session_writer_any`); if they still record in another branch, `IDEMPOTENCY_CONFLICT` |
| Price 90.000 on list 100.000, reception cap 10% | Saved, reason required |
| Price 85.000 on list 100.000, reception cap 10% | `DISCOUNT_OVER_LIMIT`, nothing saved |
| Price 85.000 by a branch manager of that branch | Saved (cap 100), reason required |
| Price 100.001 on list 100.000 | `PRICE_ABOVE_LIST` |
| Direct SQL insert bypassing the app with a price below the cap | RLS `sessions_insert` refuses (42501) |

## Acceptance criteria

1. With the flag on, a receptionist with `pos.access` sees `/pos/sessions` and saves a session at
   the catalog price; the owner's report shows it once.
2. ق-1 numbers on the real database: list 100.000 and a 10% reception grant → 90.000 saved,
   85.000 refused with `DISCOUNT_OVER_LIMIT`; a manager saves 85.000.
3. Real database, same key: two concurrent saves and one later sequential save → 1 row in
   `service_sessions`, 1 `session.recorded` row in `audit_log`, all three calls return the same
   id; the second and third have `replayed: true`.
4. Real database: same key with a changed phone → `IDEMPOTENCY_CONFLICT`; another user with the
   same key → `IDEMPOTENCY_CONFLICT`; still 1 row and 1 audit entry.
5. Real database: retry after deactivating the assignment returns `replay`.
6. `db/tests/isolation.sql`: a user of company A gets `FORBIDDEN` from
   `recorded_session_replay` for company B and learns nothing about B's rows.
7. `session_daily` returns the recorded session's count and revenue on the real database.
8. All gates pass: SQL suites, `bun run test` with `POSPAY_TEST_DATABASE_URL`, `tsc`, `eslint`
   (0 errors, no new warnings), `NITRO_PRESET=node-server bun run build`.

## Schema changes — `db/migrations/0023_session_recording.sql` (idempotent)

- `alter table public.service_sessions add column if not exists request_fingerprint text`, with
  a named check constraint (added only if missing) `request_fingerprint ~ '^[0-9a-f]{64}$'`.
  Nullable: rows recorded before 018 keep `null` and can never be replayed (I3).
- `public.recorded_session_replay(_company uuid, _id uuid, _payload text) returns text`,
  `security definer`, `set search_path = pg_catalog`, `stable`: raises `FORBIDDEN` unless
  `session_writer_any(_company)`; returns `new` / `replay` / `conflict` per I3, comparing
  `encode(sha256(convert_to(_payload,'UTF8')),'hex')`. `revoke all … from public`,
  `grant execute … to pospay_app`.
- `sessions_insert` is **not** re-created (it stays as 0014 wrote it). The app writes
  `request_fingerprint` on every insert; the column already falls under the existing
  `grant insert on public.service_sessions to pospay_app`.
- No new table. `owns_recorded_session` stays for compatibility and is no longer called by the app.
- `db/tests/isolation.sql`: the case in acceptance 6.

## Contract

- `recordSessionInput` (Zod) is unchanged.
- `recordSessionFn` output: `{ id: string; replayed: boolean }` (was `{ id }`).
- New error code `IDEMPOTENCY_CONFLICT` with ar/en messages under `sessions.IDEMPOTENCY_CONFLICT`.

## Permissions

- Record: `session_writer(company, branch)` — owner, or branch manager / reception of that branch
  (or company-wide), minus a `sessions.record` deny — plus `pos.access` (016). Unchanged.
- Discount: `discount_cap(company)` per P3. Unchanged.
- Staff, accountant, viewer: cannot record. Unchanged.
- Replay: only the original recorder, while still a writer for that branch.

## Tests

- Domain: canonical payload is stable for equal inputs and differs when any bound field changes;
  `checkDiscount` with the ق-1 numbers (100.000 / 10% / 90.000 / 85.000).
- Use case (fake repo): `replay` returns before assignment and permission lookups and writes
  nothing; `conflict` throws `IDEMPOTENCY_CONFLICT` and writes nothing; `new` inserts once with
  the payload.
- Real DB (`POSPAY_TEST_DATABASE_URL`, unique fixture ids, cleanup): acceptance 2–5 and 7.
- Gate tests that asserted "unavailable" are rewritten to the new intended behavior, not deleted.

## Open questions → Waleed

**Q1. Over-limit approval (D-44: «فوق الحد يعتمد المدير برقم PIN على الجهاز أو بطلب عن بُعد»).**
Not built; today an over-limit price is refused. Example: list 100.000, reception limit 10%, the
client should pay 85.000 — reception cannot save it.
1. *(Recommended)* Go live now with the refusal; design the approval flow (PIN or remote request,
   who may approve, how long an approval lasts) as its own slice.
2. Keep recording off in production until the approval flow ships.

**Q2. ق-1 is still «مقبولة مبدئياً… حتى يرد العميل».** Enabling recording in production uses it
before Abu Salem replies.
1. *(Recommended)* Enable now; if the client chooses another reference price, change the rule in
   a later slice (rows keep `list_price_mills`, so history stays explainable).
2. Wait for the client's reply before enabling.

**Q3. Price above the list price.** D-44 says reception «يعدّل السعر» without a direction; 013
forbids raising. Example: a long-hair surcharge on a 12.500 haircut.
1. *(Recommended)* Keep forbidden; surcharges become their own catalog services.
2. Allow raising with a reason.

**Q4. The same visit typed twice** (page reload, new key). Example: reception saves Noura's
haircut, the page reloads, and she saves it again a minute later.
1. *(Recommended)* No automatic block now; the manager sees both rows in the report.
2. Warn when the same client, service, employee and minute already exist, and ask to confirm.
3. Block such a duplicate outright.

**Q5. Fixing a wrong save.** No edit or void exists for a recorded session. Example: reception
picked the wrong employee.
1. *(Recommended)* A later slice: the manager voids a session with a mandatory reason, kept in
   `audit_log` (like D-32 corrections).
2. Reception may edit within a short window.

## Waleed decisions — 2026-11-19 (answers to Q1–Q5)

Recorded from Waleed's decision cards on 2026-11-19. Not implemented yet; each becomes its own
follow-up slice. Until then production keeps the behavior described above.

- **Q1 → build manager PIN approval now** (option 2, not the recommended default). Over-limit
  example: list 10.000, reception limit 10%, client pays 8.500 → the branch manager enters a PIN on
  the reception device and the session saves with the approver recorded. Details still to specify in
  the slice: who may approve, PIN storage and lockout, and whether remote approval follows.
- **Q2 → keep ق-1 live now** (recommended). Revisit only if the client picks another reference price.
- **Q3 → raising the price above the list price is allowed with a mandatory reason** (option 2).
  Example: long-hair cut, list 12.500, charged 15.000, reason «شعر طويل». Replaces the 013
  `PRICE_ABOVE_LIST` refusal once implemented.
- **Q4 → warn and confirm** (option 2): if a session with the same client, service, employee and
  minute already exists, show «فيه جلسة مشابهة، أكيد تبين تحفظين؟» and save only after confirmation.
- **Q5 → reception may edit its own session within a short window** (option 2); after the window
  only a manager may correct it. Every edit is audited (who, when, old and new value). The window
  length is not decided; proposal 15 minutes.
