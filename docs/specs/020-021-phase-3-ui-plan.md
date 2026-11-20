# 020 + 021 — Phase 3 Spec & Implementation Plan (Navigation, Routes, UI, i18n)

> Detailed breakdown of Phase 3 in `020-021-unified-implementation-plan.md`. Specs stay the source of
> truth for behaviour: `020-session-controls/spec.md` and `021-commissions-builder/spec.md`
> (including both "Waleed decisions — 2026-11-19" sections and the 021 "Waleed decision — 2026-11-20"
> salary rule). This file only fixes **what Phase 3 builds, on which server functions, in which
> files, and how it is accepted**.

**Implementer:** OpenCode `zai-coding-plan/glm-5.3-flash`. Does not commit. Coordinator reviews,
runs gates, commits.

**Starts after:** Phase 2 (2A + 2B) is committed on `feat/020-021-session-controls-and-commissions`.
Phase 3 must not change any file under `db/`, any `persistence/`, `use-cases/`, `domain/`, `ports/`
or `functions/` file. If a screen needs a server function that does not exist or returns the wrong
shape, **stop and report** — do not add backend code.

---

## Part A — Spec (what the user sees)

### A1. Who sees what

| Screen | Path | Who | Gate |
|---|---|---|---|
| Record session (existing, extended) | `/pos/sessions` | reception + anyone with recording | existing `needsRecording` |
| Manage sessions | `/app/services/sessions` | owner, branch manager | `sessions.edit` |
| Discount approvals inbox | `/app/services/approvals` | approvers | `discounts.manage` |
| Discounts (existing, extended) | `/app/services/discounts` | existing | `discounts.manage` |
| Commission plans | `/app/commissions/plans` | owner, branch manager | role |
| Commission overrides | `/app/commissions/overrides` | owner, granted branch managers | role + `commissions.overrides.manage` |
| Salaries | `/app/commissions/salaries` | owner, branch manager | role |

The database already enforces every rule. The UI hides what the user cannot do and maps server
error codes to clear messages; it never decides money or permissions itself.

### A2. Behaviour per screen

**`/pos/sessions` — record session**
1. Price field always visible (also when the discount cap is 0). Label covers both a discount and
   a price raise; reason is mandatory whenever price ≠ list price.
2. Duplicate warning: on `{ status: "duplicate_warning" }` show a dialog with the exact Arabic text
   «فيه جلسة مشابهة، أكيد تبين تحفظين؟»; confirm re-sends with `confirmDuplicate: true` and the
   same idempotency key.
3. Over-limit discount (`pin_required`): an approval dialog with two tabs:
   - **PIN** — pick approver from the branch list, enter 4 digits with `input-otp`. On
     `pin_invalid` show a plain «الرقم السري غلط» — no counter, no lock.
   - **Ask remotely** — always enabled (even with an empty PIN approver list). Sends
     `requestDiscountApprovalFn`, polls `getDiscountApprovalRequestFn` every 3 s, shows
     *waiting* (5-minute countdown), *approved* (approver name, save enabled), *rejected*,
     *expired*. On save, `approval_unavailable` shows the state-specific message.
4. Recent sessions list under the form (only when the caller can edit): masked phone `•••123`,
   «الشهر مغلق» badge for closed months, Edit dialog (edit reason mandatory; client phone
   required when the client name changes).

**`/app/services/sessions` — manage sessions**
1. Date-range filter + branch sessions table (`listEditableSessionsFn`).
2. Edit dialog for open months; disabled with «الشهر مغلق» once closed.
3. Edit history modal (`listSessionEditsFn`): time, editor, reason, before → after per field.
4. Owner only: «إغلاق الشهر». Ended month → normal confirm. Unfinished month
   (`getMonthCloseStatusFn`) → strong confirm: irreversible warning, days remaining, button
   enabled only after typing the month `YYYY-MM`; sends `confirmUnfinishedMonth: true`.
   Closed months list from `listClosedMonthsFn`.

**`/app/services/discounts` — add**
1. «رقمي السري» card: status badge (`getManagerPinStatusFn`), set/update 4-digit PIN
   (`setManagerPinFn`). The PIN is never shown back.
2. Failed PIN attempts list (`listFailedPinAttemptsFn`): approver, requester, device, time in
   branch local time.

**`/app/services/approvals` — inbox**
Pending requests (`listPendingDiscountApprovalsFn`, poll 10 s): branch, service, list and requested
price, reason, requester, time left. **Never the client phone.** Approve / Reject via
`decideDiscountApprovalFn`. Nav badge shows the pending count (same query, 10 s).

**`/app/commissions/plans`** (`getCommissionPlansFn`, `createPlanWithVersionFn`,
`addPlanVersionFn`, `assignPlanFn`)
1. Method builder with 4 combinable blocks: fixed % of sales; fixed KWD per session; tiers
   (accumulator sales/session count, mode progressive/all-after, threshold fixed KWD / salary
   multiple, 1..20 rows add/remove).
2. Live preview card calling the pure domain `computeCommission` (no server call) with sample
   sales the owner types; shows the KWD breakdown per method.
3. Staff assignment list: «بدون خطة» badge for unassigned staff; assignment starts on the 1st
   of a chosen month.

**`/app/commissions/overrides`** (`getServiceOverridesFn`, `saveServiceOverrideFn`)
Service-wide and staff-specific overrides: % or fixed KWD per session or "back to plan". No date
input — effective when saved. History shows each `effective_from` in branch local time. A branch
manager only sees their branch's staff.

**`/app/commissions/salaries`** (`getStaffSalariesFn`, `recordSalaryFn`)
Staff the caller may manage, current salary + history, record new effective-dated salary. Map
`SALARY_MONTH_CLOSED` (date inside or before a closed month) to a clear message.

### A3. Acceptance criteria (Phase 3)

1. Each of the 5 new routes renders for an allowed role and shows `NoAccess` for every other
   role (route test per role).
2. Navigation shows/hides each new item per role and permission exactly as the table in A1
   (`navigation.test.ts`).
3. Every server error code a screen can receive has a translated message; no raw codes on screen.
4. Every visible string uses `t("…")`; `ar.json` and `en.json` have identical key sets
   (`tsc` passes).
5. Logical CSS only (`ms-/me-/ps-/pe-/start-/end-`). RTL layout correct.
6. Money shown and typed as KWD with 3 decimals; sent to the server as strings (no floats).
7. No client phone in the approvals inbox; masked phone (`•••` + last 3) everywhere else in lists.
8. Each UI file < 400 lines, each function < 60 lines.
9. Component tests per page (below) pass; full gates in Phase 4 stay green.

### A4. Out of scope
Reports/payroll output, commission payout screens, push notifications for remote approval
(polling only), any DB or server change.

---

## Part B — Implementation plan

Read before coding: `AGENTS.md`, `docs/app-architecture.md`, both specs, the services and
commissions `contracts.ts` (exact DTO and input names), and the existing patterns:
`src/routes/app/services/discounts.tsx` (guarded route), `src/modules/services/ui/catalog-query.ts`
(`queryOptions`), `src/modules/services/ui/catalog-page.test.tsx` (test mocks for
`@tanstack/react-start`, `@/modules/staff` `CompanyScope`, and `../functions/*`). UI kit:
`src/components/ui/*` (`dialog`, `tabs`, `input-otp`, `table`, `badge`, `alert-dialog`, `sheet`).

### Task 3.1 — Navigation & routes
**Files:** `src/modules/permissions/ui/navigation.ts`, `navigation.test.ts`, `area-guard.ts`
(only if `pageAllowed` needs the new paths), `area-guard.test.ts`, `permissions-page.test.tsx`;
create `src/routes/app/services/sessions.tsx`, `approvals.tsx`,
`src/routes/app/commissions/plans.tsx`, `overrides.tsx`, `salaries.tsx`.

- [ ] Services group: add `/app/services/sessions` (`nav.manageSessions`, `requires: "sessions.edit"`)
  and `/app/services/approvals` (`nav.discountApprovals`, `requires: "discounts.manage"`).
- [ ] New `nav.group.commissions` (Phosphor `Coins`) with plans / overrides
  (`requires: "commissions.overrides.manage"`) / salaries. Add optional `roles?: CompanyRole[]` to
  `NavGroup`, checked in `visibleNavigation`; set `roles: ["owner", "branch_manager"]`.
- [ ] Each route copies the `discounts.tsx` guard pattern (head meta, loader preload,
  `pageAllowed` → page or `NoAccess`).
- [ ] Tests: nav visibility per role × permission; route allowed/denied per role.
- [ ] Run `bun run test src/modules/permissions` → green.

### Task 3.2 — Services UI
**Files:** split `src/modules/services/ui/sessions-page.tsx` into `sessions-page.tsx`,
`session-approval-dialog.tsx` (PIN + remote tabs), `remote-approval-status.tsx`,
`session-duplicate-dialog.tsx`, `session-edit-dialog.tsx`, `recent-sessions-list.tsx`;
create `manage-sessions-page.tsx`, `session-history-dialog.tsx`, `close-month-dialog.tsx`,
`approvals-page.tsx`, `manager-pin-card.tsx`, `failed-pin-attempts.tsx`; modify
`discounts-page.tsx`; add queries in `session-queries.ts` / `approval-queries.ts`.

Tests (component, mocked server fns): `sessions-page.test.tsx` (duplicate confirm re-sends
same key; PIN wrong message, no lock; remote waiting → approved enables save; rejected/expired;
price raise needs reason), `approvals-page.test.tsx` (no phone rendered; approve/reject call
`decideDiscountApprovalFn`), `manage-sessions-page.test.tsx` (closed month disables edit;
unfinished month needs typed `YYYY-MM`; non-owner has no close button; history shows before/after),
`discounts-page.test.tsx` (PIN never echoed; status badge; attempts list).

### Task 3.3 — Commissions UI
**Files:** create `src/modules/commissions/ui/plans-page.tsx`, `plan-method-builder.tsx`,
`tier-rows-editor.tsx`, `plan-preview-card.tsx`, `staff-plan-assignments.tsx`,
`overrides-page.tsx`, `salaries-page.tsx`, `commission-queries.ts`.

- [ ] Preview uses `computeCommission` from the commissions domain with `bigint` mills; convert
  typed KWD strings with the module's existing parse helpers (`domain/parse.ts`) — never
  `Number(x) * 1000`.
- [ ] Tests: `plans-page.test.tsx` (each method block builds the right `planRulesInput`; tier rows
  1..20 limits; preview breakdown for a known case; «بدون خطة» badge), `overrides-page.test.tsx`
  (service-wide vs staff override payload; clear back to plan; no date input),
  `salaries-page.test.tsx` (history listed; `SALARY_MONTH_CLOSED` message).

### Task 3.4 — i18n
**Files:** `src/i18n/ar.json`, `src/i18n/en.json`.
- [ ] All new keys (`nav.*`, `sessions.*`, `pin.*`, `approvals.*`, `commissions.*`,
  `salaries.*`, error codes) in both files, identical key sets. Gulf Arabic, short.
- [ ] Update `sessions.price` / `sessions.reason` / `sessions.DISCOUNT_REASON_REQUIRED` to cover
  both discount and raise.

### Task 3.5 — Self-check before reporting (Heavy tier)
1. `bun run tsc --noEmit`, `bun run lint`, `bun run test` (with `POSPAY_TEST_DATABASE_URL` pointing
   at `pospay-019-verify`), `NITRO_PRESET=node-server bun run build` — all green; regenerate
   `src/routeTree.gen.ts` through the build, never by hand.
2. Run `clean-code-guard`, `test-guard`, and `waleed-security-reviewer` (focus: permission gates,
   phone masking, no client phone in inbox, no money floats). Prove each real finding with a
   failing test, fix it, and reject false ones with a reason.
3. Report: files changed, test counts, gate exit codes, a findings table per skill. Do not commit.
