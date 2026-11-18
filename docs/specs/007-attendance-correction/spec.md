# 007 — Forgotten check-out correction (D-32)

## Problem
The approved attendance flow marks forgotten check-outs but gives managers no way to correct them with a recorded reason. This is unfinished scope within slice 001, before barcode fallback. Production acceptance and barcode decisions remain blocked separately.

## Solution and users
1. An owner or branch manager selects a company and sees its uncorrected forgotten check-outs by employee, branch and work date.
2. The manager supplies the actual check-out time and a mandatory reason, then sees the saved correction read back.
3. Staff, reception and unrelated tenants cannot list or apply managerial corrections.
4. Original check-out, attendance date, status, lateness and exceptions remain unchanged. Correction is separate; no inferred working hours or deductions.

## Rules and acceptance
- Apply to existing `forgotten` records only, not open or normally closed attendance.
- Reason must be nonblank (max 2000 characters); corrected time must be on/after check-in and not in the future. No new maximum-shift rule.
- Use branch timezone for displaying times; manager enters an explicit offset-bearing ISO timestamp to avoid silently using the browser timezone.
- Save `corrected_check_out_at`, `correction_reason`, `corrected_by`, and the previous original value in the existing columns; never overwrite `check_out_at`.
- Each correction writes `attendance.corrected` with actor, previous original/corrected time, new corrected time and reason, atomically with the update.
- Lock the row; a second correction request after resolution returns `ALREADY_CORRECTED`, preventing stale duplicate submissions. Later revisions are out of scope.
- Enforce existing owner/branch_manager membership at request time with `withUser()` and RLS. Honor an explicit `attendance.correct` deny (technical permission identifier for this action).
- No new tables, no shared SQL, no secrets or production changes. Server functions authenticate internally; public route never invokes a protected loader during SSR.

## Verification
Use public correction use case with a real repository on disposable localhost `pospay_test` for accepted correction, readback/audit, cross-tenant/staff/deny rejection and duplicate submission. Domain tests pin mandatory reason and invalid times. Browser checks cover unavailable state and navigation at phone/tablet/desktop in both themes; authenticated UI remains open if preview auth is not configured.