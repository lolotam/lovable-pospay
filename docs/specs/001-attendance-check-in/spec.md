# 001 — attendance: check in / check out by QR

## Requirement
Staff scan the reception QR with their own phone to check in or out. Out-of-range or missing
location is recorded as an exception, never rejected (D-12).

## Business rules
- D-12: QR at reception; geofence 150 m from the branch; no selfie; grace 10 min for lateness (report only).
- D-32: forgotten check-out is an exception; never auto-converted to hours. Manager correction
  needs a reason; the old value is kept. Night shift belongs to the check-in local date.
- D-53: a scan closes an open record up to 16 h old. Older → forgotten check-out exception and a
  new check-in. Scan more than 4 h after shift end (within 16 h) closes as `closed_late`.
- D-10: dates and lateness use the branch time zone.
- ق-6 (approved by Waleed, 2026-11-18 Kuwait): open record ≤16 h and the scan is at a scheduled shift start →
  staff choose «بدء الوردية الجديدة» or «انصراف». New shift: previous record → forgotten exception.
- Scheduled shift start window: 30 minutes before and after the start, inclusive (approved by Waleed).
- QR token lifetime: 60 seconds (approved by Waleed).

## Edge cases
- No location → `exception` with reason `no_location`. Outside 150 m → `outside_geofence`.
- Expired or forged QR → rejected (`invalid_qr`), nothing recorded.
- Staff without a staff profile in the branch's company → rejected.

## Acceptance criteria
- Inside 120 m → check-in status `ok`. At 300 m → `exception/outside_geofence`.
- Shift 09:00, check-in 09:10 → not late; 09:11 → late 11 min.
- Open since 06:00, shift 06:00–14:00, scan 17:00 → `check_out`; scan 19:00 → `closed_late`;
  scan next day 00:00 (18 h) → previous `forgotten`, new check-in.
- ق-6: open since 06:00, next shift starts 20:00, scan 20:00 → `needs_intent`; with
  `new_shift` → previous `forgotten`, new check-in 20:00; with `check_out` → `closed_late`.
- Check-in 22:00 Kuwait, check-out 06:00 → work date is the check-in date.

## Schema
`staff_members`, `shifts`, `attendance_records` (migration 0002) with RLS + isolation cases.

## Contract
`scanAttendance({ token, location?, intent? })` → `{ outcome, recordId, status, reason? }`.

## Permissions
Staff record only their own attendance. Owner/branch manager read all records of their company.
Reception/manager/owner can show the branch QR.

## Tests
Domain unit tests for each rule above (`src/modules/attendance/domain/*.test.ts`).

## Open questions
س1–س3 are resolved; see `owner-questions.ar.md` for Waleed's approvals.
