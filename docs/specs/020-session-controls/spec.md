# 020 — services: manager PIN & remote approval, price surcharges, duplicate warning, and audited session edits

Written 2026-11-19 (Kuwait) from `main` at `1f601a2`. Reserved migration:
`db/migrations/0025_session_controls.sql` (follows `0023_session_recording.sql` and
`0024_commission_plans.sql`; `0026` belongs to `021-commissions-builder`).

## Requirement

Slice 018 turned on service-session recording at `/pos/sessions` with idempotent saves and the ق-1
discount cap. On 2026-11-19 Waleed decided the four follow-up controls recorded in
`docs/specs/018-session-recording/spec.md` (Q1, Q3, Q4, Q5). This slice delivers all four as one
cohesive update to the `services` module:

1. **Price raise above list (Q3):** any authorized session recorder may charge above the service's
   catalog price (`price_mills > list_price_mills`) when a mandatory reason is provided (e.g., long
   hair surcharge: list `12.500` → charged `15.000`, reason «شعر طويل»).
2. **Manager approval for over-limit discounts — on-device PIN or remote (Q1, D-44):** when a
   discount exceeds the recorder's `discount_cap(company)` (e.g., list `100.000`, reception cap
   `10%`, final price `85.000`), the owner or a branch manager of that branch approves it either by
   entering their 4-digit PIN on the reception device, or remotely from their own logged-in app
   session after reception sends a request. Both paths produce the same unforgeable, single-use,
   5-minute approval record bound to the exact session payload and verified inside Postgres RLS.
   The session saves with `approved_by` and `approved_at`. There is **no PIN lockout** (Waleed
   decision); every failed PIN attempt is recorded so abuse is visible.
3. **Duplicate session warning and confirmation (Q4):** before saving a new session (after
   idempotency replay check), if another session already exists for the same company, client phone,
   service, staff member, and calendar minute, the server refuses to save silently and prompts the
   UI: «فيه جلسة مشابهة، أكيد تبين تحفظين؟». Saving proceeds only after explicit confirmation.
4. **Permission-based audited session editing & month-end lock (Q5, updated by Waleed 2026-11-19):**
   session editing is controlled by the `sessions.edit` permission (managed by the owner on
   `/app/permissions` — default on for `owner` and `branch_manager`, grantable by the owner to
   `reception` members only, never to plain `staff`/`accountant`/`viewer`; deny always wins per
   D-31). Anyone holding `sessions.edit` for the session's
   branch may edit sessions at **any time** with no time-window limit, **until the calendar month
   is closed** by the owner (normally after the monthly report and payroll are finalized; a month
   that has not ended can also be closed, after a strong confirmation). Once a month is closed in
   `closed_commission_months`, **no one** (including the owner) may edit sessions in that month or
   move a session into that month (`PERIOD_CLOSED`). Every edit requires a mandatory reason and
   appends an immutable before/after snapshot to `service_session_edits` plus an `audit_log` entry.
   Old values are never lost.

## Business rules (cite PRD D-xx / ق-x / Waleed 2026-11-19)

### A. Price adjustment and surcharges (Q3, D-44, ق-1)

- **A1.** Reference price on create is `service_catalog.price_mills` at save time, stored in
  `list_price_mills` (unchanged from 018 P1).
- **A2.** `price_mills < 0` is rejected (`INVALID_PRICE`).
- **A3.** `price_mills === list_price_mills`: valid without a reason (`discount_reason = null`),
  no approval required.
- **A4 (Q3).** `price_mills > list_price_mills` (price raise / surcharge): allowed for any
  `session_writer(company, branch)` without manager PIN, **provided** `discount_reason` is
  non-empty after trimming. Empty reason → `DISCOUNT_REASON_REQUIRED`. Replaces the 013/018
  `PRICE_ABOVE_LIST` refusal in both domain and RLS.
- **A5 (ق-1).** `price_mills < list_price_mills` (discount): requires non-empty `discount_reason`
  (`DISCOUNT_REASON_REQUIRED`). Within cap when
  `price_mills * 100 >= list_price_mills * (100 - discount_cap(company))` in integer `bigint`
  mills. Below cap → requires a manager approval (Section B, PIN or remote). The pure domain
  check (`checkDiscount`) returns `DISCOUNT_OVER_LIMIT`; the `recordSession` / `editSession` use
  cases turn that code into the result `{ status: "pin_required", approvers }` when no
  `managerApproval` was sent (they never throw `DISCOUNT_OVER_LIMIT` to the client). The UI then
  offers both "enter PIN" and "ask remotely". `approvers` lists only approvers who have set a PIN
  and may be empty; "ask remotely" stays available even then, because remote approvers need no
  PIN. The database refuses an over-limit row without a
  valid approval with `42501` (Rule B5).
- **A6 (UI).** The price adjustment inputs on `/pos/sessions` are shown to **every** user who can
  record sessions, even when `discountCap === 0`, so reception can always enter a surcharge (Q3) or
  request manager approval for a discount (Q1).

### B. Manager approval: on-device PIN or remote (Q1, D-44; Waleed decisions 1–3)

- **B1. Eligible approvers (Waleed decision 1).** The `owner` of `company_id` (any branch), or a
  `branch_manager` of `company_id` whose membership covers the session's `branch_id`
  (`branch_id is null` or `branch_id = session.branch_id`) and who has no `discounts.manage` deny
  override: `public.discount_approver(company, branch, user_id)`. "The session's branch" is the
  branch the session will have after the save — for an edit that moves the session, the **new**
  branch (Rule D3).
- **B2. PIN format & storage.** Exactly 4 ASCII digits (`^[0-9]{4}$`). Owners and branch managers
  set or change their own PIN for the company via `set_manager_pin` (UI card on
  `/app/services/discounts`). PINs are hashed in Postgres with `pgcrypto` bcrypt
  (`crypt(_pin, gen_salt('bf', 10))`) and stored in `public.manager_pins`. `pospay_app` has **zero**
  direct table grants on `manager_pins`; hashes and PINs are never returned to application code,
  never logged, and never included in `request_fingerprint`, `audit_log` or
  `manager_pin_attempts`.
- **B3. PIN verification — no lockout (Waleed decision 2).** `verify_manager_pin_approval` first
  authorises the request, then compares the PIN:
  - Caller must satisfy `session_writer(_company, _branch)` (record) or
    `session_editor(_company, _branch)` (edit), else raise `FORBIDDEN`.
  - `_approver` must satisfy `discount_approver(_company, _branch, _approver)` and have a
    `manager_pins` row, else raise `APPROVER_NOT_ALLOWED`. `list_branch_approvers` lists only
    approvers who already have a PIN, so the UI never offers an approver without one.
  - Wrong PIN → insert one row into `public.manager_pin_attempts` (`company_id`, `branch_id`,
    `session_id`, `approver_user_id`, `requested_by = current_app_user()`, `user_agent`,
    `attempted_at`) and an `audit_log` row `manager_pin.failed`, then return status `invalid`.
    There is **no counter and no lock**: the next attempt is checked normally.
  - **Commit guarantee:** the attempt record MUST persist. The verification runs inside the same
    `withUser()` transaction as the save, and `withUser()` rolls back on any thrown error. So the
    SQL function returns a status instead of raising, and the use case returns `pin_invalid`
    instead of throwing; `withUser()` then commits.
  - `user_agent` is the request's `user-agent` header (read in the server function with
    `getRequestHeaders()` from `@tanstack/react-start/server`, truncated to 200 characters); it is
    the only device identifier available today.
  - Correct PIN → issue a single-use row in `public.discount_approvals` (`source = 'pin'`) bound to
    `(company_id, branch_id, session_id, service_id, list_price_mills, approved_price_mills,
    approver_user_id, requested_by)` with `expires_at = now() + interval '5 minutes'`.
  - **Accepted risk (Waleed, 2026-11-19):** without a lockout a 4-digit PIN (10,000 combinations)
    can be guessed by repeated tries on the reception device; Waleed accepted this risk, and the
    `manager_pin_attempts` log is the mitigation.
- **B4. Remote approval (Waleed decision 3, D-44 second half).** Built now, alongside the PIN:
  1. **Request.** After `pin_required`, reception may choose "ask remotely". The server function
     calls `request_discount_approval(_company, _branch, _session_id, _service_id,
     _list_price_mills, _price_mills, _reason)`: the caller must satisfy `session_writer` or
     `session_editor` for `_branch`, and the price must be below the list price. It inserts a
     `public.discount_approval_requests` row with `status = 'pending'`, `requested_by =
     current_app_user()`, `expires_at = now() + interval '5 minutes'`, writes `audit_log`
     `discount_approval.requested`, and returns the request id. The binding fields are the same as
     a PIN approval: session id (= the form's `requestId`, or the edited session's id), `service_id`,
     `list_price_mills`, price, `branch_id`, requester. A new request by the same requester for the
     same session id marks that requester's older `pending` request for it `superseded`. A
     `superseded` request is shown and returned as `expired` (status poll and
     `approval_unavailable`), and approvers no longer see it.
  2. **Approvers see it.** Eligible approvers (B1) of that branch see pending, unexpired requests
     on `/app/services/approvals` (new page, nav item under `nav.group.services`, `requires:
     "discounts.manage"`) with a pending-count badge on the nav item. Both refresh by polling
     (`listPendingDiscountApprovalsFn` every 10 s); there is no push, SMS or WhatsApp. The list
     shows branch, service, list price, requested price, reason, requester name, and time left. It
     never shows the client phone.
  3. **Decide.** The approver presses approve or reject in their own logged-in session (no PIN).
     `decide_discount_approval(_company, _request_id, _approve boolean)` locks the request
     `FOR UPDATE`. The caller must satisfy `discount_approver(_company, request.branch_id,
     current_app_user())`, else it raises `APPROVER_NOT_ALLOWED`. The request must be `pending` with
     `expires_at > now()`, else it raises `APPROVAL_REQUEST_CLOSED`. Approve → insert
     `discount_approvals` (`source = 'remote'`, `request_id`, same binding fields copied from the
     request, `approver_user_id = current_app_user()`, `requested_by = request.requested_by`,
     `expires_at = now() + interval '5 minutes'`) and set the request `approved`, `decided_by`,
     `decided_at`, `approval_id`. Reject → set it `rejected`, `decided_by`, `decided_at`. Either
     way it writes `audit_log` `discount_approval.approved` / `discount_approval.rejected`.
  4. **Reception waits.** `/pos/sessions` (and the edit dialog) poll
     `getDiscountApprovalRequestFn` every 3 s and show one of four UI states:
     - **waiting**: `pending` and not expired, with a countdown;
     - **approved**: approver name shown, save enabled;
     - **rejected**;
     - **expired**: `pending` past `expires_at`, or approved but the approval passed its own
       `expires_at` or was already used.
     Reception reads only its own requests (RLS).
  5. **Save.** Reception resubmits the same form with `managerApproval: { kind: "remote",
     approvalRequestId }`. The use case loads the request:
     - not approved, expired, or already used → return `{ status: "approval_unavailable", state }`
       (`state` is `pending`, `rejected`, `expired`, or `used`);
     - binding differs from the submitted payload (other session id, service, list price, price,
       or branch) → return `{ status: "approval_unavailable", state: "mismatch" }`;
     - otherwise save with the request's `approval_id` and approver.
     The database re-checks everything (B5), so a forged or mismatched approval fails with `42501`
     even if the use case is bypassed.
  6. Requests expire 5 minutes after creation if nobody acts; an approval expires 5 minutes after
     it is issued (decision time for remote, verification time for PIN).
- **B5. Approval record & database-enforced non-bypass.** `pospay_app` has no
  `INSERT`/`UPDATE`/`DELETE` grant on `discount_approvals` or `discount_approval_requests`.
  `sessions_insert` RLS (and `update_recorded_session`) accepts an over-limit price **only** when a
  matching, unconsumed, unexpired `discount_approvals` row exists for the exact `(company_id,
  approval_id, branch_id, session_id, service_id, list_price_mills, price_mills, approved_by)` and
  `requested_by = current_app_user()`.
  - `approved_by`, `approved_at` and `approval_id` are either **all null** (no approval path) or
    **all non-null and backed by `valid_discount_approval`** — a client can never write a spoofed
    `approved_by`, even on a within-cap price.
  - `approved_at` must equal the approval row's `created_at`. The INSERT writes it with a SQL
    subquery `(select a.created_at from public.discount_approvals a where a.company_id = $1 and
    a.id = $approval)`, never a value sent from JavaScript. A remote approval is created in an
    earlier transaction, so `now()` would not match.
  - `updated_at` / `updated_by` must be null on insert.
  - **Single use is enforced by the database, not by app code:** a partial unique index
    `service_sessions_approval_once on public.service_sessions(company_id, approval_id) where
    approval_id is not null`. In addition, `consume_discount_approval` (called after the insert in
    the same transaction) sets `consumed_at = now()` only when `requested_by =
    current_app_user()` and a `service_sessions` row with that `approval_id` exists; otherwise it
    raises `FORBIDDEN`. `update_recorded_session` validates and consumes the approval itself.
- **B6. Idempotency interaction.** `sessionRequestPayload` does NOT contain `managerApproval` (PIN,
  approver id or approval request id) or `confirmDuplicate`. Once saved, a network retry with the
  same `requestId` and payload hits `claimRequest → replay` before any approval step and succeeds
  without asking again. If the first try was not saved (`pin_required`, `pin_invalid`,
  `approval_unavailable`, `duplicate_warning`), nothing was inserted, so a retry with the same
  `requestId` plus a valid approval (and `confirmDuplicate: true` when the duplicate was already
  confirmed) sees `new` and saves once.

### C. Duplicate session warning & confirmation (Q4)

- **C1. Match rule.** A duplicate exists when another row in `service_sessions` has the same
  `company_id`, the same client (matched by normalized `clients.phone` in that company), the same
  `service_id`, the same `staff_id`, and the same minute
  (`date_trunc('minute', occurred_at) = date_trunc('minute', _occurred_at)`), with
  `id <> _request_id`.
- **C2. Order of checks.**
  1. `claimRequest` (idempotency replay/conflict runs **first** — an honest retry of the same
     `requestId` is `replay`, never a duplicate warning).
  2. Assignment, branch write permission (`canWrite`), timestamp & future check, closed-month
     check (`PERIOD_CLOSED`, Rule D2), price/reason validation. Every price error except
     `DISCOUNT_OVER_LIMIT` is thrown here; an over-limit price is remembered and handled in step 5.
  3. Duplicate check (when `confirmDuplicate` is not `true`) runs **before** any manager PIN step,
     so reception sees «فيه جلسة مشابهة، أكيد تبين تحفظين؟» before calling a manager over and no
     PIN attempt is spent on a request that may be abandoned.
  4. If duplicate found and `!confirmDuplicate`: return `{ status: "duplicate_warning" }` (writes
     nothing). UI displays the exact prompt:
     - AR: `فيه جلسة مشابهة، أكيد تبين تحفظين؟`
     - EN: `A similar session already exists. Are you sure you want to save?`
  5. Over-limit price: without `managerApproval` → return `{ status: "pin_required", approvers }`
     (writes nothing); with `{ kind: "pin" }` → `verifyManagerPin` (`pin_invalid` is returned, not
     thrown, so the attempt record commits); with `{ kind: "remote" }` → check the request (Rule
     B4.5). The UI must resend `confirmDuplicate: true` with the approval when the duplicate was
     already confirmed.
  6. Upsert client → insert session → consume approval → `audit_log`. When the save was made with
     `confirmDuplicate: true`, `audit_log` records `duplicateConfirmed: true`.
- **C3. Privacy.** Duplicate detection runs via `security definer` function
  `public.has_similar_session(...)` that requires `session_writer(_company, _branch)` and returns
  only a `boolean` — never leaking client rows or other branches' sessions.

### D. Permission-based audited session editing & month-end lock (Q5, D-31, D-32, D-43, D-46)

- **D1. `sessions.edit` permission (no time window).**
  - Add `"sessions.edit"` everywhere the owner-editable keys are listed (edited on the
    `/app/permissions` screen): `permissionKeySchema` in `src/modules/permissions/contracts.ts`;
    the `ALL` and `MANAGER` arrays (which feed `ROLE_DEFAULTS`) in
    `src/modules/permissions/domain/permission-matrix.ts`; `EDITABLE_PERMISSIONS` and the literal
    default object in `toStates` in `src/modules/permissions/domain/override-states.ts`; the
    `EditablePermission` union in `src/modules/permissions/domain/permission-admin-types.ts`; the
    i18n key `permissionAdmin.sessions.edit` in `src/i18n/ar.json` and `src/i18n/en.json`; and SQL
    `public.role_default_permission`:
    - `owner`: always allowed (immune to deny, D-31).
    - `branch_manager`: allowed by default (owner may deny individually).
    - `reception`: denied by default; the **owner** may grant `sessions.edit` (`allow`) on
      `/app/permissions`.
    - `staff`, `accountant`, `viewer` (Waleed decision 7: only app/pos roles — owner, branch
      manager, reception): the toggle is **hidden** in `/app/permissions` for a member who holds
      neither `branch_manager` nor `reception`, and `saveMemberOverrides` refuses any non-default
      state for it with `PERMISSION_NOT_APPLICABLE` (nothing stored). Implement this as a domain
      map in `src/modules/permissions/domain/override-states.ts`,
      `PERMISSION_ROLES: { "sessions.edit": ["branch_manager", "reception"] }`, used by the UI (hide)
      and by the save use case (refuse). Spec 021 adds `commissions.overrides.manage` to the same
      map. `effectivePermissions` drops `sessions.edit` for a member without one of those roles,
      even if an old `allow` row exists.
  - SQL helper `public.session_editor(_company uuid, _branch uuid) returns boolean`:
    - `true` if caller is `owner` of `_company`, OR caller satisfies
      `public.has_permission(_company, 'sessions.edit')` AND holds a `branch_manager` or
      `reception` membership in `_company` covering `_branch` (`branch_id is null` or
      `branch_id = _branch`). The role filter makes a stray `allow` row on a staff-only member
      ineffective in the database too.
  - When changing `staffId` to another branch, caller MUST satisfy `session_editor` for **both**
    the session's current branch and the target staff member's branch.
  - Editing is allowed at **any time** (no minute-based expiry) as long as the month is open.
- **D2. Month-end lock (`closed_commission_months`).**
  - Once the monthly report and payroll are finalized, the **owner** closes that calendar month
    (`period_month` = 1st day of month, stored append-only in `public.closed_commission_months`;
    no `UPDATE` or `DELETE` grant — cannot be reopened; any later correction belongs to the next
    month per D-28 / D-49).
  - **Closing a month that has not ended (Waleed decision 4):** allowed, but only after a strong
    confirmation. "Not ended" means the first day of the next month has not yet arrived in at least
    one of the company's branches (branch-local date). `public.month_close_status(_company uuid,
    _period_month date) returns integer` returns the days remaining: the maximum over the company's
    branches of `(_period_month + interval '1 month')::date - (now() at time zone b.timezone)::date`,
    floored at `0`. For a not-ended month the UI shows a warning dialog: the close is
    **irreversible**, it blocks recording and editing in that month, and `N` days remain. The close
    button stays disabled until the owner types the month (`YYYY-MM`). The request then carries
    `confirmUnfinishedMonth: true`. Without that flag, `closeMonth` refuses a not-ended month with
    `MONTH_NOT_ENDED_CONFIRMATION_REQUIRED`. A month that has ended uses a normal confirmation
    dialog.
  - SQL helper `public.is_month_closed(_company uuid, _branch uuid, _at timestamptz) returns boolean`
    resolves `_at` in the branch's local timezone (`date_trunc('month', _at at time zone
    b.timezone)::date`) and checks `closed_commission_months`.
  - Enforced on **both recording and editing** (Waleed 2026-11-19):
    - Recording a new backdated session whose `occurred_at` falls in a closed month is refused
      with `PERIOD_CLOSED` (checked in `recordSession` AND in `sessions_insert` RLS).
    - Editing a session whose existing month is closed — OR changing `occurred_at` into a closed
      month — is refused for **everyone** (reception, branch manager, and owner) with
      `PERIOD_CLOSED` (checked in `editSession` AND `update_recorded_session`).
- **D3. Editable fields & list-price snapshot.**
  - Editable: `serviceId`, `staffId`, `clientName`, optional `clientPhone`, `occurredAt`, `price`,
    `discountReason`.
  - Required: `editReason` (trimmed 1..200 chars; empty → `EDIT_REASON_REQUIRED`).
  - **List price stability:** if `serviceId` is unchanged, `list_price_mills` and `service_name`
    stay at the session's recorded snapshot (so a later catalog price change does not break fixing
    an employee or client typo). If `serviceId` changes, `list_price_mills` and `service_name`
    update to the new service's current catalog price/name.
  - **Client phone privacy (D-43):** `clientPhone` is **optional** on edit. If `clientPhone` is
    provided, resolve/upsert `(company_id, normalizedPhone)` with `clientName`; if omitted, keep
    the existing `client_id` without requiring the full phone number to be read back. Lists show
    only `clientPhoneLast3` per D-43.
  - **Name change needs the phone (Waleed decision 5):** if `clientName` (trimmed) differs from
    the current client's name and `clientPhone` is omitted, the edit is refused with
    `CLIENT_PHONE_REQUIRED`. With the phone, the client is resolved/upserted by
    `(company_id, normalizedPhone)` and gets the new name.
  - **Editor is not necessarily a writer:** an editor may lack `session_writer` (e.g. a
    branch manager whose `sessions.record` is denied), and the existing `canWrite` check and
    `public.upsert_session_client` both require `session_writer`. So `editSession` must NOT call
    `canWrite` or `upsertClient`; the client resolution and the branch checks happen inside
    `update_recorded_session`, gated by `session_editor`.
  - **Price on edit is always sent:** `editSessionInput.price` is required (the UI pre-fills the
    session's current price), so an omitted price can never silently mean "list price".
  - **Price & PIN on edit:** identical rules A2–A5 & B1–B4. Special case: if `serviceId` and
    `priceMills` are unchanged and the session already carries a valid `approved_by`, the existing
    approval is preserved so an editor can fix a staff/time typo without calling a manager back —
    **only while the branch stays the same.**
    - **Branch change (Waleed decision 6):** when the new staff member is in another branch and the
      price is still over the editor's own `discount_cap`, the old approval is dropped and a fresh
      approval (PIN or remote) from an approver of the **new** branch (owner, or that branch's
      manager) is required; without it the result is `pin_required` with the new branch's
      approvers.
    - If `priceMills` changes to an over-limit discount (or `serviceId` changes so the price is now
      over-limit), a fresh approval is required, unless the caller's own `discount_cap` covers it.
- **D4. Atomic update and immutable edit history.**
  - `pospay_app` is NOT granted raw `UPDATE` on `service_sessions`. All edits go through
    `security definer` function `public.update_recorded_session(...)` which acquires
    `SELECT ... FOR UPDATE` on the session row, enforces `session_editor` on old & new branches,
    enforces `not is_month_closed` on old & new timestamps (`PERIOD_CLOSED`), enforces
    catalog/assignment and price/approval rules (a fresh approval must be issued for the session's
    **new** branch, and `approved_at` is copied from that approval's `created_at`; a kept approval
    is valid only while the branch is unchanged, Rule D3), enforces the client-phone rule
    (`CLIENT_PHONE_REQUIRED`), appends an immutable row to
    `public.service_session_edits(before_snapshot, after_snapshot, edit_reason, edited_by, edited_at)`,
    updates only the editable columns (`service_id`, `service_name`, `staff_id`, `branch_id`,
    `client_id`, `occurred_at`, `list_price_mills`, `price_mills`, `discount_reason`,
    `approved_by`, `approved_at`, `approval_id`, `updated_at`, `updated_by`), and writes
    `audit_log` (`session.edited`).
  - Snapshots NEVER contain full `clientPhone` (only `clientId`, `clientName`, and `clientPhoneLast3`).
  - Suggested signature: `public.update_recorded_session(_company uuid, _session_id uuid,
    _service_id uuid, _staff_id uuid, _client_name text, _client_phone text /* null = keep client */,
    _occurred_at timestamptz, _price_mills bigint, _discount_reason text, _approval_id uuid
    /* null = no fresh approval */, _edit_reason text) returns void`. Errors are raised as the
    codes used by the use case (`FORBIDDEN`, `NOT_ASSIGNED`, `PERIOD_CLOSED`,
    `EDIT_REASON_REQUIRED`, `DISCOUNT_REASON_REQUIRED`, `DISCOUNT_OVER_LIMIT`,
    `CLIENT_PHONE_REQUIRED`).
- **D5. UI entry points.** Area rules in `src/modules/permissions/domain/workspace.ts`
  (`canEnterArea`) decide who can open each page: a `reception` workspace lands in `pos`, a
  `staff` workspace in `me`, and `/pos/*` needs `pos.access` (not a `branch_manager` default).
  - `/pos/sessions`: shows a compact "Recent sessions" list below the form with masked phone
    (`•••123`), month-closed lock badge when applicable, and an **Edit** dialog when the caller has
    `sessions.edit` and the session's month is open. This is the edit entry point for reception.
  - `/app/services/sessions`: gated by `sessions.edit` — lists branch-scoped sessions by date
    range, **Edit** dialog (open months only, mandatory reason), **Edit History** viewer showing
    every before/after change, actor, timestamp, and reason, and (for **owner** only) a **Close
    Month** action (`إغلاق الشهر`) with the confirmation of Rule D2 (strong for a not-ended month).
    Reachable by owner and branch-manager workspaces (area `app`); a reception workspace (area
    `pos`) edits from `/pos/sessions` instead.
  - `/app/services/approvals`: remote-approval inbox for eligible approvers (Rule B4.2).
  - The new server functions (`listEditableSessionsFn`, `editSessionFn`, `listSessionEditsFn`,
    `listClosedMonthsFn`, `closeMonthFn`, `listPendingDiscountApprovalsFn`,
    `decideDiscountApprovalFn`) gate on `sessions.edit` / owner / `discount_approver` (via RLS and
    the SQL helpers), **not** on `pos.access`. Do not copy the `withPermission(..., "pos.access",
    ...)` wrapper from `recordSessionFn`, or branch managers would be locked out.
    `requestDiscountApprovalFn` and `getDiscountApprovalRequestFn` serve both reception (`/pos`) and
    editors, so they gate on `session_writer` / `session_editor` in SQL, also not on `pos.access`.

## Edge cases

| Case | Result |
|---|---|
| List `12.500`, reception enters `15.000`, reason «شعر طويل» | Saved (`price_mills = 15000`, `list_price_mills = 12500`, `approved_by = null`) |
| List `12.500`, reception enters `15.000`, empty reason | Refused: `DISCOUNT_REASON_REQUIRED` |
| List `100.000`, reception cap `10%`, enters `85.000` with reason, no approval | Returns `{ status: "pin_required", approvers: [...] }`; nothing saved |
| Same `85.000` with valid PIN of branch manager of that branch | Saved with `approved_by = manager.userId`, `approved_at` = approval `created_at`, `approval_id` consumed |
| Same `85.000` with valid PIN of branch manager of **another** branch | Refused: `APPROVER_NOT_ALLOWED`; nothing saved |
| Wrong PIN 6 times in a row, then the right PIN | Each wrong try returns `pin_invalid` and commits one `manager_pin_attempts` row + `manager_pin.failed` audit; no lock; the 7th try (right PIN) saves |
| Reception asks remotely; branch manager of that branch approves within 5 min; reception saves | Saved with `approved_by` = that manager; request `approved`; approval consumed |
| Branch manager of **another** branch opens the approvals page | Request not listed; calling `decide_discount_approval` raises `APPROVER_NOT_ALLOWED` |
| Approver rejects | Reception UI shows **rejected**; saving with that request returns `approval_unavailable` (`rejected`) |
| Nobody acts for 5 minutes | Request **expired**; deciding raises `APPROVAL_REQUEST_CLOSED`; saving returns `approval_unavailable` (`expired`) |
| Approved, but reception saves more than 5 minutes after the approval | `approval_unavailable` (`expired`); nothing saved |
| Approved for `85.000`, reception changes the price to `80.000` and saves with the same request | `approval_unavailable` (`mismatch`); a forced direct insert gets `42501` |
| Approved request used for a save, then sent again for another session | `approval_unavailable` (`used`); unique index / RLS refuses a forced insert |
| Direct SQL `INSERT` into `service_sessions` with over-limit price and spoofed `approved_by` | RLS `sessions_insert` refuses (`42501`) |
| Reusing an already-consumed `approval_id` on a second session | Refused: unique index `service_sessions_approval_once` (or `42501`, since the approval is bound to the first session id) |
| Same client phone, service, staff, same minute, new `requestId`, `confirmDuplicate` omitted | Returns `{ status: "duplicate_warning" }`; nothing saved |
| Resubmit same form with `confirmDuplicate: true` | Saved; `audit_log` includes `duplicateConfirmed: true` |
| Network retry with the **same** `requestId` & payload after save | `replay` (no duplicate warning, no second approval check, still 1 row) |
| Reception **without** `sessions.edit` tries to edit a session | Refused: `FORBIDDEN` |
| Reception **granted** `sessions.edit` by owner edits a branch session 3 days later (month open) with reason | Saved; `service_session_edits` gains 1 row with before/after; `audit_log` gains `session.edited` |
| Owner tries to grant `sessions.edit` to a member whose only role is `staff` (or `accountant` / `viewer`) | Toggle hidden; a forced save returns `PERMISSION_NOT_APPLICABLE`; nothing stored |
| A stray `allow` row for `sessions.edit` exists on a staff-only member | `session_editor` is false (role filter); edit refused `FORBIDDEN` |
| Branch manager whose `sessions.edit` was denied by owner tries to edit a session | Refused: `FORBIDDEN` (deny wins, D-31) |
| Branch manager with default `sessions.edit` edits a session from 10 days ago in their own branch (month open) | Saved; `service_session_edits` + `audit_log` recorded |
| Branch manager tries to edit a session in another branch | Refused: `FORBIDDEN` |
| Edit changes `clientName` without `clientPhone` | Refused: `CLIENT_PHONE_REQUIRED`; nothing changed |
| Edit changes `clientName` and sends `clientPhone` | Saved; client resolved by phone and renamed |
| **Owner** (or manager or granted reception) tries to edit a session in a **closed month** | Refused: `PERIOD_CLOSED`; nothing changed |
| Any editor tries to change an open-month session's `occurredAt` into a **closed month** | Refused: `PERIOD_CLOSED`; nothing changed |
| Branch manager tries to close a month in `closed_commission_months` | Refused by RLS (`42501`); owner-only |
| Owner closes the current month (12 days remaining) without `confirmUnfinishedMonth` | Refused: `MONTH_NOT_ENDED_CONFIRMATION_REQUIRED`; nothing stored |
| Owner closes the current month after typing it in the strong-confirmation dialog | Closed; later recording/editing dated in it gets `PERIOD_CLOSED` |
| Editor updates an over-limit approved session in an open month, changing only `staffId` within the same branch (same service & price) | Preserves existing `approved_by`; succeeds without a new approval |
| Editor moves that session to a staff member of **another** branch; price still over the editor's cap | Returns `pin_required` with the new branch's approvers; saved only with a fresh approval from the new branch |
| Reception with `sessions.edit` lowers price from `95.000` to `80.000` (list `100.000`, below the 10% cap) without approval | Returns `{ status: "pin_required" }`; nothing changed |
| Direct SQL `INSERT` with a **within-cap** price but a spoofed `approved_by` / `approval_id` | RLS `sessions_insert` refuses (`42501`) |
| Approval issued for list `100.000` / price `85.000`, then the same `requestId` resubmitted for a different service | RLS `sessions_insert` refuses (`42501`; approval bound to `service_id` + `list_price_mills`) |
| Direct SQL `UPDATE public.service_sessions` as `pospay_app` | Refused (`42501` permission denied) |
| Direct SQL `INSERT` / `UPDATE` on `discount_approval_requests` or `discount_approvals` as `pospay_app` | Refused (`42501`) |

## Acceptance criteria (concrete numbers)

1. **Q3 surcharge:** list `12.500` (`12500n`), reception cap `0%` → `15.000` with reason «شعر طويل»
   saves cleanly; `15.000` without reason fails with `DISCOUNT_REASON_REQUIRED`.
2. **Q1 PIN approval:** list `100.000` (`100000n`), reception cap `10%` → `90.000` saves without
   approval; `85.000` without approval returns `pin_required`; `85.000` with valid 4-digit PIN of
   the branch manager saves with `approved_by = managerId`, `approved_at` equal to the approval's
   `created_at`, and `audit_log` recording `approvedBy`.
3. **No lockout, attempts recorded (Waleed decision 2):** 6 consecutive wrong PINs each return
   `pin_invalid` and leave 6 committed `manager_pin_attempts` rows (with `requested_by` and
   `user_agent`) and 6 `manager_pin.failed` audits; the 7th attempt with the correct PIN saves the
   session. `manager_pins` has no attempt counter or lock column.
4. **Q4 duplicate warning:** recording client `96550001111`, Haircut, Staff 1 at `2027-03-10T14:30`
   succeeds; recording a second request (different `requestId`) with the same client/service/staff
   at `2027-03-10T14:30` returns `{ status: "duplicate_warning" }` and keeps row count = `1`;
   resubmitting with `confirmDuplicate: true` saves row `2` with `duplicateConfirmed: true` in
   `audit_log`. (These dates are after 2026-11-19: the test must pass a fixed `now` later than
   the session time to `recordSession`, or `FUTURE_SESSION` is thrown.)
5. **Q5 permission-based editing & month-end lock:**
   - Reception without `sessions.edit` tries to edit a session → `FORBIDDEN`.
   - Owner grants `sessions.edit` (`allow`) to reception → reception edits a branch session recorded
     3 days earlier (month open, changing staff from Staff 1 to Staff 2, reason «اختيار خاطئ») →
     succeeds, `service_session_edits` has 1 row with `before.staffId = Staff 1` and
     `after.staffId = Staff 2`.
   - Owner tries to grant `sessions.edit` to a staff-only member → `PERMISSION_NOT_APPLICABLE`,
     `permission_overrides` unchanged.
   - Changing the client name without the phone → `CLIENT_PHONE_REQUIRED`; with the phone → saved.
   - Owner closes an ended month → subsequent edit attempts on its session by reception, branch
     manager, AND owner all fail with `PERIOD_CLOSED`, and moving an open-month session's
     `occurredAt` into that closed month also fails with `PERIOD_CLOSED`.
   - Owner closes a not-ended month without `confirmUnfinishedMonth` →
     `MONTH_NOT_ENDED_CONFIRMATION_REQUIRED`; with it → closed, and recording a new session dated
     in it → `PERIOD_CLOSED`.
6. **Isolation (`db/tests/isolation.sql`):**
   - Company A owner gets `FORBIDDEN` from `set_manager_pin`, `list_branch_approvers`,
     `verify_manager_pin_approval`, `request_discount_approval`, `decide_discount_approval`,
     `list_pending_discount_approvals`, `has_similar_session`, `list_editable_sessions`, and
     `update_recorded_session` targeting Company B.
   - Company A owner reads `0` rows from Company B's `service_session_edits`,
     `discount_approvals`, `discount_approval_requests`, `manager_pin_attempts`, and
     `closed_commission_months`, and cannot close a month in Company B.
   - Branch manager in Company B cannot insert into `closed_commission_months` (`42501`);
     `UPDATE`/`DELETE` on `closed_commission_months` refused for owner too.
   - `pospay_app` cannot `SELECT`/`INSERT`/`UPDATE`/`DELETE` `manager_pins`; cannot `INSERT`/
     `UPDATE`/`DELETE` `discount_approvals`, `discount_approval_requests`, or
     `manager_pin_attempts`; cannot `UPDATE`/`DELETE` `service_sessions` or
     `service_session_edits`.
   - Spoofed `approved_by` on `service_sessions` insert fails RLS (`42501`), both for an over-limit
     price and for a within-cap price.
   - An approval issued for one `service_id` / `list_price_mills` is refused (`42501`) on an insert
     for another service.
   - A second `service_sessions` row reusing an already-used `approval_id` is refused (unique
     violation or `42501`).
   - Positive case: a member who is not a report reader but holds `sessions.edit` for the branch
     (e.g. reception granted `allow`) reads that branch's `service_session_edits` rows.
   - Branch 2 manager cannot approve (PIN or remote) a Branch 1 over-limit discount, cannot read
     Branch 1 requests or PIN attempts, and cannot edit a Branch 1 session.
   - Reception reads only its own `discount_approval_requests`, never another receptionist's.
7. **Remote approval (Waleed decision 3):** list `100.000`, reception cap `10%`, price `85.000`:
   reception requests remotely → the Branch 1 manager sees 1 pending request and approves it →
   reception's status poll returns `approved` → saving with `{ kind: "remote", approvalRequestId }`
   stores `approved_by = Branch 1 manager` and consumes the approval. A second request rejected by
   the manager → saving returns `approval_unavailable` (`rejected`). A third request left alone for
   5 minutes → deciding
   raises `APPROVAL_REQUEST_CLOSED` and saving returns `approval_unavailable` (`expired`). To make
   a request or an approval expired without waiting, the test connects as the migration owner
   (before `set role pospay_app`; `pospay_app` has no write grant on these tables) and sets its
   `expires_at` into the past, then runs the app path.

## Schema changes — `db/migrations/0025_session_controls.sql` (idempotent)

- **New table `public.manager_pins`:**
  - `(company_id uuid references public.companies(id) on delete cascade, user_id text, pin_hash text not null, updated_at timestamptz not null default now(), primary key (company_id, user_id))` — no attempt counter and no lock column (no lockout, Waleed decision 2).
  - `revoke all on public.manager_pins from public, pospay_app;` + `enable row level security` (no
    permissive policy for `pospay_app` — all access strictly through `security definer` functions).
- **New table `public.manager_pin_attempts` (append-only log of failed PIN tries):**
  - `(company_id uuid, id uuid default gen_random_uuid(), branch_id uuid not null, session_id uuid not null, approver_user_id text not null, requested_by text not null, user_agent text check (user_agent is null or length(user_agent) <= 200), attempted_at timestamptz not null default clock_timestamp(), primary key (company_id, id))`; FK `(company_id, branch_id) references public.branches(company_id, id)`; index `(company_id, branch_id, attempted_at desc)`.
  - `revoke all … from public, pospay_app; grant select … to pospay_app;` (inserts only inside `verify_manager_pin_approval`).
  - RLS `select`: `public.has_company_role(company_id, 'owner') or public.discount_approver(company_id, branch_id, public.current_app_user())`.
  - Shown to owner / branch managers as a "failed PIN attempts" list on `/app/services/discounts`.
- **New table `public.discount_approval_requests` (remote approval, Rule B4):**
  - `(company_id uuid, id uuid default gen_random_uuid(), branch_id uuid not null, session_id uuid not null, service_id uuid not null, list_price_mills bigint not null check (list_price_mills >= 0), requested_price_mills bigint not null check (requested_price_mills >= 0 and requested_price_mills < list_price_mills), discount_reason text not null check (length(trim(discount_reason)) between 1 and 200), requested_by text not null, created_at timestamptz not null default now(), expires_at timestamptz not null, status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')), decided_by text, decided_at timestamptz, approval_id uuid, primary key (company_id, id), check ((status in ('approved','rejected')) = (decided_by is not null and decided_at is not null)), check ((status = 'approved') = (approval_id is not null)))`.
  - FKs `(company_id, branch_id) → branches`, `(company_id, service_id) → service_catalog`; the `approval_id` FK is added after `discount_approvals` exists (see below).
  - Index `(company_id, branch_id, status, expires_at)`.
  - The two approval tables reference each other, so create both tables first, then add the FKs
    `discount_approval_requests (company_id, approval_id) → discount_approvals(company_id, id)` and
    `discount_approvals (company_id, request_id) → discount_approval_requests(company_id, id)` with
    idempotent `alter table … add constraint` blocks (skip when the constraint already exists).
  - `revoke all … from public, pospay_app; grant select … to pospay_app;` (writes only through `request_discount_approval` / `decide_discount_approval`).
  - RLS `select`: `requested_by = public.current_app_user() or public.discount_approver(company_id, branch_id, public.current_app_user())`.
  - "Expired" is derived (`status = 'pending' and expires_at <= now()`); no background job.
- **New table `public.discount_approvals`:**
  - `(company_id uuid, id uuid default gen_random_uuid(), branch_id uuid not null, session_id uuid not null, service_id uuid not null, list_price_mills bigint not null check (list_price_mills >= 0), approved_price_mills bigint not null check (approved_price_mills >= 0), approver_user_id text not null, requested_by text not null, created_at timestamptz not null default now(), expires_at timestamptz not null, consumed_at timestamptz, source text not null check (source in ('pin','remote')), request_id uuid, primary key (company_id, id), check ((source = 'remote') = (request_id is not null)))`.
  - FK `(company_id, branch_id) references public.branches(company_id, id)`; FK
    `(company_id, service_id) references public.service_catalog(company_id, id)`.
  - `revoke all on public.discount_approvals from public, pospay_app; grant select on public.discount_approvals to pospay_app;`
  - RLS `select`: `public.discount_manager(company_id) or requested_by = public.current_app_user()`.
- **Columns added to `public.service_sessions`:**
  - `approved_by text`
  - `approved_at timestamptz`
  - `approval_id uuid` + FK `(company_id, approval_id) references public.discount_approvals(company_id, id)`
  - `updated_at timestamptz`
  - `updated_by text`
  - Index `service_sessions_duplicate_check on public.service_sessions(company_id, staff_id, service_id, occurred_at)`.
  - Partial unique index `service_sessions_approval_once on public.service_sessions(company_id, approval_id) where approval_id is not null` (Rule B5 single use).
  - No new grant: `pospay_app` keeps only `select, insert` on `service_sessions` (no `update`).
- **New table `public.closed_commission_months` (append-only month-end lock):**
  - `(company_id uuid not null references public.companies(id) on delete cascade, period_month date not null check (extract(day from period_month) = 1), closed_by text not null, closed_at timestamptz not null default now(), note text check (note is null or length(trim(note)) <= 200), primary key (company_id, period_month))`.
  - Grants: `select, insert` ONLY to `pospay_app` (no `update`, no `delete`).
  - RLS `select`: `public.is_member(company_id)`.
  - RLS `insert`: `public.has_company_role(company_id, 'owner') and closed_by = public.current_app_user()`.
- **Updated `public.role_default_permission`:** `create or replace` restating the whole 0018
  `case` and adding `'sessions.edit'` to `branch_manager` only — `branch_manager` becomes
  `('reports.view','attendance.correct','staff.manage','services.manage','discounts.manage','sessions.edit')`;
  `owner` stays `true`, `reception` stays `'pos.access'`, `accountant` / `viewer` stay
  `'reports.view'`, `else false`. Other roles get `sessions.edit` only through an owner `allow`
  row in `permission_overrides`.
- **New table `public.service_session_edits` (append-only):**
  - `(company_id uuid, id uuid default gen_random_uuid(), session_id uuid not null, edited_by text not null, edited_at timestamptz not null default now(), edit_reason text not null check (length(trim(edit_reason)) between 1 and 200), before_snapshot jsonb not null, after_snapshot jsonb not null, primary key (company_id, id))`.
  - FK `(company_id, session_id) references public.service_sessions(company_id, id)`.
  - Index `(company_id, session_id, edited_at desc)`.
  - Grants: `select` only to `pospay_app` (inserts happen atomically inside `update_recorded_session`).
  - RLS `select`: `public.session_edits_visible(company_id, session_id)`. A plain subquery on
    `service_sessions` inside the policy would itself be filtered by `sessions_report`
    (`report_reader` only), hiding history from editors who are not report readers, so the
    lookup lives in a `security definer` helper (function 13 below).
- **SQL helper & `security definer` functions** (`revoke all from public`, `grant execute to pospay_app`):
  1. `public.discount_approver(_company uuid, _branch uuid, _user text) returns boolean` (`stable`, `set search_path = public`).
  2. `public.session_editor(_company uuid, _branch uuid) returns boolean` (`stable`, `set search_path = public`) — `owner`, OR `has_permission(_company, 'sessions.edit')` with a `branch_manager` or `reception` membership covering `_branch` (Rule D1).
  3. `public.is_month_closed(_company uuid, _branch uuid, _at timestamptz) returns boolean` (`stable`, `set search_path = public`) — checks branch-local calendar month against `closed_commission_months`.
  4. `public.valid_discount_approval(_company uuid, _approval uuid, _branch uuid, _session uuid, _service uuid, _list_price bigint, _price bigint, _approver text, _approved_at timestamptz) returns boolean` (`stable`, `set search_path = pg_catalog`) — true only for an unconsumed, unexpired row matching every argument with `requested_by = current_app_user()` and `created_at = _approved_at`.
  5. `public.has_manager_pin(_company uuid) returns boolean` (`stable`, `set search_path = public`).
  6. `public.set_manager_pin(_company uuid, _pin text) returns void` (`set search_path = public, extensions, pg_catalog`).
  7. `public.list_branch_approvers(_company uuid, _branch uuid) returns table(user_id text, name text)` (`stable`, `set search_path = public`) — caller must be `session_writer` or `session_editor` for `_branch`; returns only `discount_approver`s that have a `manager_pins` row.
  8. `public.verify_manager_pin_approval(_company uuid, _branch uuid, _session_id uuid, _service_id uuid, _list_price_mills bigint, _price_mills bigint, _approver text, _pin text, _user_agent text) returns table(status text, approval_id uuid)` (`set search_path = public, extensions, pg_catalog`) — `status` is `approved` or `invalid`; no lockout; a wrong PIN inserts `manager_pin_attempts`; authorisation per Rule B3.
  9. `public.consume_discount_approval(_company uuid, _approval_id uuid) returns void` (`set search_path = pg_catalog`) — per Rule B5 (requester only, session row must exist).
  10. `public.has_similar_session(_company uuid, _branch uuid, _service_id uuid, _staff_id uuid, _client_phone text, _occurred_at timestamptz, _exclude_id uuid default null) returns boolean` (`stable`, `set search_path = pg_catalog`).
  11. `public.list_editable_sessions(_company uuid, _from timestamptz, _until timestamptz, _limit integer) returns table(...)` (`stable`, `set search_path = public`) — returns sessions in branches where caller satisfies `session_editor(_company, s.branch_id)`, with `month_closed`, `can_edit`, `client_phone_last3`, and `edit_count`.
  12. `public.update_recorded_session(...) returns void` (`set search_path = public, pg_catalog`; signature in Rule D4) — locks row `FOR UPDATE`, validates `session_editor` on old & new branches, checks `not is_month_closed` on old & new timestamps (`PERIOD_CLOSED`), validates assignment/price/approval, resolves the client itself (no `upsert_session_client`, which needs `session_writer`), consumes a fresh approval, appends `service_session_edits`, updates `service_sessions`, writes `audit_log`.
  13. `public.session_edits_visible(_company uuid, _session uuid) returns boolean` (`stable`, `set search_path = public`) — reads the session's current `branch_id` bypassing RLS and returns `report_reader(_company, branch_id) or session_editor(_company, branch_id)`.
  14. `public.request_discount_approval(_company uuid, _branch uuid, _session_id uuid, _service_id uuid, _list_price_mills bigint, _price_mills bigint, _reason text) returns uuid` (`set search_path = public`) — Rule B4.1.
  15. `public.decide_discount_approval(_company uuid, _request_id uuid, _approve boolean) returns void` (`set search_path = public`) — Rule B4.3.
  16. `public.list_pending_discount_approvals(_company uuid) returns table(id uuid, branch_id uuid, branch_name text, service_name text, list_price_mills bigint, requested_price_mills bigint, discount_reason text, requester_name text, created_at timestamptz, expires_at timestamptz)` (`stable`, `set search_path = public`) — pending, unexpired requests of branches where the caller is `discount_approver`.
  17. `public.month_close_status(_company uuid, _period_month date) returns integer` (`stable`, `set search_path = public`) — days remaining (Rule D2); owner only, else `FORBIDDEN`.
- **Updated RLS policy `sessions_insert` on `public.service_sessions`** (`drop policy if exists` +
  `create policy`, `for insert to pospay_app`). The `with check` restates every 0014 predicate
  except the price ceiling:
  - kept: `public.session_writer(company_id, branch_id)`, `recorded_by = public.current_app_user()`,
    `client_id is not null`, `list_price_mills = (select c.price_mills from public.service_catalog c
    where c.company_id = service_sessions.company_id and c.id = service_sessions.service_id)`,
    and `(price_mills = list_price_mills or length(trim(coalesce(discount_reason,''))) > 0)`.
  - dropped: `price_mills <= list_price_mills` (enabling Q3 surcharges with reason).
  - added: `not public.is_month_closed(company_id, branch_id, occurred_at)` (blocking new
    backdated inserts into a closed month in RLS).
  - added: `updated_at is null and updated_by is null`.
  - added: approval columns all null, or all non-null and
    `public.valid_discount_approval(company_id, approval_id, branch_id, id, service_id, list_price_mills, price_mills, approved_by, approved_at)`
    (`approved_at` is written from the approval row's `created_at`, Rule B5).
  - replaced price floor: `price_mills >= list_price_mills or price_mills * 100 >= list_price_mills * (100 - public.discount_cap(company_id)) or approval_id is not null`
    (the last branch is safe because of the approval predicate above).
- **Updated `db/tests/isolation.sql`:** one contiguous block with fixture ids `20000000-0000-4000-8000-…` (never `20000000-0000-0000-0000-…`, already used by `db/tests/platform-isolation.sql` and `correct-attendance.integration.test.ts`) testing all acceptance #6 assertions.

## Contract (Zod input/output)

In `src/modules/services/contracts.ts`:

- `pinCodeSchema = z.string().regex(/^\d{4}$/)`
- `managerApprovalInput = z.discriminatedUnion("kind", [z.object({ kind: z.literal("pin"), approverUserId: z.string().min(1).max(100), pin: pinCodeSchema }), z.object({ kind: z.literal("remote"), approvalRequestId: z.string().uuid() })])`
- `recordSessionInput` extends existing fields with:
  - `confirmDuplicate: z.boolean().optional()`
  - `managerApproval: managerApprovalInput.optional()`
- `RecordSessionResult` (discriminated union):
  - `{ status: "saved"; id: string; replayed: boolean; approvedBy: string | null }`
  - `{ status: "duplicate_warning" }`
  - `{ status: "pin_required"; approvers: { userId: string; name: string }[] }`
  - `{ status: "pin_invalid" }`
  - `{ status: "approval_unavailable"; state: "pending" | "rejected" | "expired" | "used" | "mismatch" }`
- `requestDiscountApprovalInput = serviceScope.extend({ sessionId: z.string().uuid(), serviceId: z.string().uuid(), staffId: z.string().uuid(), price: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/), discountReason: z.string().trim().min(1).max(200) })` — the server never trusts client-sent branch or list price: the branch always comes from the submitted `staffId`'s assignment (for an edit that moves the session, that is the **new** branch, Rule D3); the list price is the edited session's stored `list_price_mills` when an edit keeps `serviceId`, otherwise the current catalog price.
- `DiscountApprovalRequestDto`: `{ id: string; state: "waiting" | "approved" | "rejected" | "expired"; expiresAt: string; approverName: string | null }`
- `decideDiscountApprovalInput = serviceScope.extend({ requestId: z.string().uuid(), approve: z.boolean() })`
- `PendingDiscountApprovalDto`: `{ id, branchName, serviceName, listPriceMills, requestedPriceMills, discountReason, requesterName, createdAt, expiresAt }` (mills as strings; no client phone)
- `FailedPinAttemptDto`: `{ id, branchName, approverName, requesterName, userAgent, attemptedAt }`
- `setManagerPinInput = serviceScope.extend({ pin: pinCodeSchema })`
- `closeMonthInput = serviceScope.extend({ periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/), note: z.string().trim().max(200).optional(), confirmUnfinishedMonth: z.boolean().optional() })`
- `MonthCloseStatusDto`: `{ periodMonth: string; daysRemaining: number; ended: boolean }`
- `editSessionInput = serviceScope.extend({ sessionId: z.string().uuid(), serviceId: z.string().uuid(), staffId: z.string().uuid(), clientName: z.string().trim().min(1).max(120), clientPhone: z.string().trim().min(8).max(24).optional(), occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), price: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/), discountReason: z.string().trim().max(200).optional(), editReason: z.string().trim().min(1).max(200), managerApproval: managerApprovalInput.optional() })`
  (`price` is required on edit — Rule D3.)
- `listEditableSessionsInput = serviceScope.extend({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })`
  (the server passes a fixed `_limit` to `list_editable_sessions`).
- Errors that are thrown (not part of the result unions): `FORBIDDEN`, `NOT_ASSIGNED`,
  `FUTURE_SESSION`, `INVALID_PRICE`, `DISCOUNT_REASON_REQUIRED`, `PERIOD_CLOSED`,
  `APPROVER_NOT_ALLOWED`, `APPROVAL_REQUEST_CLOSED`, `EDIT_REASON_REQUIRED`,
  `CLIENT_PHONE_REQUIRED`, `MONTH_NOT_ENDED_CONFIRMATION_REQUIRED`, `IDEMPOTENCY_CONFLICT`.
- `EditSessionResult`:
  - `{ status: "updated"; id: string }`
  - `{ status: "pin_required"; approvers: { userId: string; name: string }[] }`
  - `{ status: "pin_invalid" }`
  - `{ status: "approval_unavailable"; state: "pending" | "rejected" | "expired" | "used" | "mismatch" }`
- `EditableSessionDto` (for `/pos/sessions` and `/app/services/sessions`):
  `{ id, serviceId, serviceName, staffId, staffName, branchId, timeZone, clientName, clientPhoneLast3, occurredAt, recordedAt, listPriceMills, priceMills, discountReason, approvedBy, approverName, monthClosed, canEdit, editCount }`
- `ClosedMonthDto`: `{ periodMonth: string; closedBy: string; closedAt: string; note: string | null }`
- `SessionEditHistoryDto`:
  `{ id, editedBy, editorName, editedAt, editReason, beforeSnapshot, afterSnapshot }`

In `src/modules/permissions/` (full list in Rule D1):
- Add `"sessions.edit"` to `permissionKeySchema` (`contracts.ts`), the `ALL` and `MANAGER` arrays
  (`domain/permission-matrix.ts`, so `ROLE_DEFAULTS.owner` and `ROLE_DEFAULTS.branch_manager` get it),
  `EDITABLE_PERMISSIONS` and the `toStates` literal (`domain/override-states.ts`), and the
  `EditablePermission` union (`domain/permission-admin-types.ts`). `editablePermissionSchema` and
  `saveOverridesInput` derive from `permissionKeySchema`, but with Zod 4 a
  `z.record(enumSchema, …)` is exhaustive: every overrides payload must now contain
  `"sessions.edit"`. Update every literal full-key overrides object, at least
  `toStates` in `domain/override-states.ts` (line ~44) and the expectation in
  `domain/override-states.test.ts` (line ~34); tests that spread `toStates([]).overrides` pick it
  up automatically.
- Add the `PERMISSION_ROLES` map (Rule D1) and a new save error `PERMISSION_NOT_APPLICABLE`.

## Permissions (who can, who cannot)

| Action | owner | branch_manager | reception | staff / accountant / viewer | other company |
|---|---|---|---|---|---|
| Raise price with reason (Q3) | ✓ | ✓ own branch | ✓ own branch | — | — |
| Set own 4-digit manager PIN | ✓ | ✓ | — | — | — |
| Approve over-limit discount via PIN on the device | ✓ any branch | ✓ own branch (no `discounts.manage` deny) | — | — | — |
| Request a remote approval | ✓ | ✓ own branch | ✓ own branch | — | — |
| See / approve / reject remote requests (`/app/services/approvals`) | ✓ any branch | ✓ own branch (no `discounts.manage` deny) | — | — | — |
| See failed PIN attempts | ✓ all branches | ✓ own branch | — | — | — |
| Confirm duplicate session warning | ✓ | ✓ own branch | ✓ own branch | — | — |
| Edit open-month session (anytime) | ✓ | ✓ own branch (default; owner may deny) | Only if granted `sessions.edit` by owner (own branch) | — never (not grantable) | — |
| Edit closed-month session | **✗ (`PERIOD_CLOSED`)** | **✗ (`PERIOD_CLOSED`)** | **✗ (`PERIOD_CLOSED`)** | **✗** | — |
| Close a calendar month (strong confirmation if not ended) | ✓ | — | — | — | — |
| Edit from `/pos/sessions` (recent list) | ✓ | only if also granted `pos.access` | ✓ if granted `sessions.edit` | — | — |
| View `/app/services/sessions` & edit history | ✓ | ✓ own branch | — (reception area is `pos`) | — | — |

## Tests

- **Domain (`src/modules/services/domain/` & `src/modules/permissions/domain/`):**
  - `discount.test.ts` updated for Q3: surcharge with reason allowed, surcharge without reason → `DISCOUNT_REASON_REQUIRED`, negative price → `INVALID_PRICE`, ق-1 `100.000 / 10% / 90.000 / 85.000` preserved (`DISCOUNT_OVER_LIMIT`).
  - `pin.test.ts`: pure 4-digit PIN validation (no lockout constants).
  - `approval.test.ts`: pure mapping of a request row + now to `waiting` / `approved` / `rejected` / `expired` (including `superseded` → `expired`), and the binding comparison that yields `mismatch`.
  - `permission-matrix.test.ts` & `override-states.test.ts`: `sessions.edit` default on `owner`/`branch_manager`, grantable (`allow`) to `reception` only, not applicable to `staff`/`accountant`/`viewer` (`PERMISSION_ROLES`), deny wins on `branch_manager`, owner immutable.
- **Use cases (fake repos):**
  - `record-session.test.ts`: surcharge flow; duplicate warning before any approval step; confirmed duplicate writes `duplicateConfirmed: true`; over-limit without approval returns `pin_required` + approvers; wrong PIN returns `pin_invalid` (repeated tries never lock); valid PIN saves with `approvedBy` and consumes approval; remote approval: approved saves, pending/rejected/expired/used/mismatch return `approval_unavailable` with that state; replay still skips duplicate & approval checks.
  - `edit-session.test.ts`: without `sessions.edit` → `FORBIDDEN`; granted reception edits anytime in open month → succeeds; closed month (old or new date) → `PERIOD_CLOSED` even for owner; name change without phone → `CLIENT_PHONE_REQUIRED`; preserving existing `approvedBy` when service, price and branch unchanged; branch change with over-cap price → `pin_required` with the new branch's approvers; requiring approval when lowering price below cap; mandatory `editReason`.
  - `close-month.test.ts`: validates month-start format; ended month closes with normal flag; not-ended month without `confirmUnfinishedMonth` → `MONTH_NOT_ENDED_CONFIRMATION_REQUIRED`, with it → closes.
  - `discount-approval.test.ts`: request/decide/status use cases, including reject and expiry.
  - `save-member-overrides` tests (permissions module): `sessions.edit` on a staff-only member → `PERMISSION_NOT_APPLICABLE`.
- **Integration (`POSPAY_TEST_DATABASE_URL`, fixture ids `20000000-0000-4000-8000-…` — not the `20000000-0000-0000-0000-…` ids already used by `db/tests/platform-isolation.sql` and `correct-attendance.integration.test.ts` — double-apply `0025`):**
  - All 7 acceptance criteria verified against real Postgres + RLS (including owner granting `sessions.edit` via `permission_overrides`, 6 committed failed PIN attempts without lock, the remote approve/reject/expire flow with expiry set up as the migration owner per acceptance #7, an empty PIN-approver list still allowing a remote request, closing ended and not-ended months, and `PERIOD_CLOSED` for reception, manager, and owner).
- **UI component tests:**
  - `sessions-page.test.tsx`: surcharge input visible even with `discountCap = 0`, duplicate confirmation dialog with exact Arabic copy, approval dialog offering PIN and "ask remotely", remote states waiting / approved / rejected / expired, editable sessions list when `sessions.edit` granted, closed-month lock state, name change requiring phone.
  - `discounts-page.test.tsx`: manager PIN setup form validation (4 digits); failed PIN attempts list.
  - `approvals-page.test.tsx`: pending list, approve and reject buttons, badge count.
  - `manage-sessions-page.test.tsx`: close-month strong confirmation (irreversible warning, days remaining, typed month enables the button) vs normal confirmation for an ended month.
  - `permissions-page.test.tsx`: `sessions.edit` toggle rendered and saved for branch manager / reception, hidden for a staff-only member.
- **SQL:** `0025` applied twice on `pospay_test`; `db/tests/isolation.sql` passes.

## Decisions locked (Waleed, 2026-11-19)

1. Q1: manager approval of over-limit discounts is built now — on-device PIN and remote.
2. Q3: price above list allowed with a mandatory reason.
3. Q4: duplicate (same client, service, employee, minute) → warn and save only after confirmation.
4. Q5 (as revised in chat, superseding the "short window" text recorded in
   `docs/specs/018-session-recording/spec.md`): `sessions.edit` on `/app/permissions`, default on
   for owner and branch manager, scoped to own branch, any time while the month is open, mandatory
   reason, before/after audit; owner-only irreversible month close that also blocks new sessions
   dated in a closed month (`PERIOD_CLOSED`).

## Waleed decisions — 2026-11-19 (open questions)

1. **Approvers:** the owner (any branch) and the branch manager of the session's branch only, as
   proposed (Rule B1).
2. **PIN lockout:** none. The approval stays valid 5 minutes and single-use; PINs are still hashed;
   every failed attempt is recorded (who, when, requester, device user-agent) in
   `manager_pin_attempts` and `audit_log`, and nothing is blocked (Rule B3). Risk accepted by
   Waleed: a 4-digit PIN can be guessed by repeated tries without a lockout; the attempt log makes
   such abuse visible but does not stop it.
3. **Remote approval:** built now alongside the PIN (Rule B4): request bound to the exact payload,
   approvers see pending requests in the app by polling, approve or reject in their own logged-in
   session without a PIN, the approval becomes a single-use 5-minute `discount_approvals` row with
   the same RLS guarantees, and requests expire after 5 minutes if nobody acts.
4. **Month close:** a month that has not ended may be closed after a strong confirmation
   (irreversible warning + days remaining); ended months use a normal confirmation (Rule D2).
5. **Edit changing the client name:** the phone is required with the name; a name change without
   the phone is refused (Rule D3).
6. **Branch change on edit:** needs a fresh approval from the new branch (owner or that branch's
   manager) when the price is still over the editor's cap (Rule D3).
7. **`sessions.edit` scope:** only app/pos roles (owner, branch manager, reception); hidden for
   plain staff in `/app/permissions`, and a grant for such a member is refused (Rule D1).

## Still to confirm

- Waleed's decision 7 names owner, branch manager and reception, so this spec also excludes
  `accountant` and `viewer` from `sessions.edit` (they previously could be granted it). Confirm
  that accountants should not edit sessions.
- The device identifier recorded for failed PIN attempts is the browser `user-agent`; there is no
  registered reception-device id in the codebase today.
