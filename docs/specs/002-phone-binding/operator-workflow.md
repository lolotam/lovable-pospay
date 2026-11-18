# 002 — Phone management selectors

## Approved scope
Finish the missing operator selector noted in `spec.md`, using existing D-40 permissions. No new barcode rules, phone-exclusive guarantee or production changes.

## Acceptance
- Signed-in users select their company by name; only existing memberships appear.
- Staff bind their own phone only when their staff profile exists and attendance.record is not denied.
- Owners and branch managers without attendance.manage_devices deny can select a linked staff account by display name for unbinding.
- Other users cannot list another employee's device management options; another company's ID returns FORBIDDEN.
- Return names and binding status only, never credential IDs, cookie hashes or secrets.
- Keep unbinding authorization in RLS at mutation time; clear stale selections when the company changes and refresh after success.

## Verification seams
Reuse established database boundary: public phone-management read repository under withUser() with real PostgreSQL/RLS. Tests cover own company, foreign company and explicit deny. Browser acceptance requires configured Better Auth; signed-out screenshots alone do not complete it.

## Status
In progress. Production phone exclusivity and authenticated browser acceptance remain separate open gates.