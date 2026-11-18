# 003 Barcode fallback and operational follow-up

Approved by Waleed on 2026-11-18 at 11:47 Kuwait: branch manager only issues cards, managers revoke immediately, exactly one active attendance method per employee. D-13 cards are fallback for employees without a phone or before re-binding. No automatic phone unlinking and no deletion of attendance history.

## Acceptance
- Company policy screen records manager approval, actor and time; options are fixed to the three approved rules, not weakening toggles.
- A branch manager can issue/revoke cards only for employees of their assigned branch (a null branch membership covers the company). Owners retain read visibility, but cannot issue merely by being an owner. Deny overrides win.
- Reception or branch managers scan cards in their branch. Card identifiers are random opaque tokens, stored hashed; raw tokens only returned once at issue and rendered as printable Code128, never stored in audit logs or list responses.
- One active card per employee. Active phone prevents issue; active card prevents phone binding, including simultaneous attempts. Revocation is checked under the same employee lock as scans; a scan that starts after successful revocation fails. Reissue produces a new token; old token stays invalid.
- Card attendance reuses QR attendance decisions: 10-minute grace, 30-minute start window, 16-hour forgotten checkout, 4-hour late close, explicit dual choices and stale-intent protection. Reception scans without location retain the no_location exception rather than inventing location proof.
- Service catalog supports manager/owner create/edit name, nonnegative KWD price (max three decimal digits, bigint mills), and same-company employee assignments. No deletion or implicit reassignment. Updates retain history in audit; no commissions or discounts introduced.
- Operational reports use an explicit timestamp range [from, until), preserve work_date for night shifts, list employee attendance and original/corrected checkout with reason, and service session rows actually recorded. No fabricated session rows or totals. This request adds a catalog, not the pending discounted/package session workflow; services report can truthfully be empty until sessions are recorded.
- Reports available to manager/owner/accountant/viewer, with branch filtering for managers; staff/reception cannot read others' reports. No salary, commission, phone, client phone or secret columns in report DTOs or exports. D-43 phone masking applies to views where the phone may be shown. Operational reports exclude it.
- Every new tenant table uses company_id, RLS, pospay_app grants and negative isolation coverage. All actions authenticate with Better Auth and use withUser transactions. UI Arabic/i18n, Micro tokens, mobile/iPad/desktop, light/dark, explicit loading/empty/forbidden/error states.

## Delivery gates
Local disposable Postgres tests and migration double-apply, full serial suite, lint, harness build, responsive browser checks, Standards/Spec review. Production migrations, deploy and real-account/physical scanner acceptance stay open until separately approved/configured; no secrets or production changes in this task.