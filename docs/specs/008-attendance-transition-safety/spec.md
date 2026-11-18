# 008 — attendance: safe concurrent transitions

## Requirement
Complete the remaining integrity check in slice 001 before authenticated acceptance:
two requests that read the same open attendance record cannot both report a successful
transition or write duplicate audit events.

## Business rules
- PRD §12.5: attendance changes retain an audit trail.
- D-32 / ق-6: starting a new shift marks the previous record forgotten without inventing
  a checkout time; only one new attendance record may be open.
- D-53: checkout closes an existing open record, never an already resolved record.
- This is transaction integrity, not a new policy about sequential repeated scans.

## Edge cases
Concurrent checkout, concurrent new-shift intent, and a stale forgotten transition
after another request resolved the record must fail without extra attendance/audit rows.
An audit failure rolls back its corresponding attendance change.

## Acceptance criteria
- Two checkout requests reading the same open record: one `checked_out`, one
  `ATTENDANCE_CONFLICT`; one checkout audit and one stored checkout.
- Two `new_shift` requests reading the same previous record: one `checked_in`, one
  `ATTENDANCE_CONFLICT`; previous checkout remains null, one new open record,
  one forgotten audit and one new-check-in audit.
- Changing an already closed record to forgotten throws `ATTENDANCE_CONFLICT`;
  persisted status and checkout remain unchanged.
- Audit rejection rolls the checkout back to `open` with null checkout.

## Schema changes
None. Existing conditional updates, unique open-record index, RLS and withUser
transactions suffice; do not modify shared databases, production, env or deployment.

## Contract
Existing scan input/output is unchanged. The PostgreSQL adapter rejects a conditional
transition affecting zero rows with `ATTENDANCE_CONFLICT`; no success/audit follows.

## Permissions
Existing staff ownership, phone proof and RLS remain unchanged. No new role or grant.

## Tests
Real PostgreSQL race tests through scanAttendance and withUser, direct stale transition,
and rollback on audit failure. Run full suite with disposable localhost pospay_test.

## Open questions
None for this integrity slice. Real-phone/authenticated UI acceptance, barcode decisions,
production configuration and Google remain open in roadmap.md.