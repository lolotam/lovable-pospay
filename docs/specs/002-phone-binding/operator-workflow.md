# 002 — Phone management selectors

## Approved scope
Finish the missing operator selector noted in `spec.md`, using existing D-40 permissions. No new barcode rules, phone-exclusive guarantee or production changes.

## Acceptance
- Signed-in users select their company by name; only existing memberships appear.
- Staff bind their own phone only when their staff profile exists and attendance.record is not denied.
- Staff with two eligible companies can choose either when this browser token is unbound. After binding, switching the selector or reopening the page shows the linked company and the manager-unbind explanation without offering another bind action. This is Waleed's 2026-11-18 option 1 for Lovable PR #1.
- Owners and branch managers without attendance.manage_devices deny can select a linked staff account by display name for unbinding.
- Other users cannot list another employee's device management options; another company's ID returns FORBIDDEN.
- Return names and binding status only, never credential IDs, cookie hashes or secrets.
- Keep unbinding authorization in RLS at mutation time; clear stale selections when the company changes and refresh after success.

## Verification seams
Reuse established database boundary: public phone-management read repository under withUser() with real PostgreSQL/RLS. Tests cover own company, foreign company and explicit deny. Browser acceptance requires configured Better Auth; signed-out screenshots alone do not complete it.

## Status
Implementation complete; 4 management repository tests pass on disposable PostgreSQL. Full suite: 61 tests passed, 0 skipped across 11 files, including attendance/RLS acceptance. Migrations 0001–0003 applied twice locally. Changed-file ESLint passes and preview build OK; full lint terminated after 180 seconds with SIGTERM.

Browser check at 390/820/1280 confirms the unavailable-auth state renders without overflow. Authenticated company/staff selection and real-device exclusivity remain unverified and open; no production environment or shared database changed.

Review against 015dd57: Standards found no confirmed breach. Spec review raised read error handling (fixed) and asked about attendance.record semantics: this read mirrors the existing D-40 RLS (staff profile plus absence of deny), not a new permission rule. Existing unbindPhoneFn writes phone.unbound with actor in the same withUser transaction. Revalidation at mutation time remains authoritative.
