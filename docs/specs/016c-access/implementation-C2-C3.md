# C2 then C3 implementation

Spec: docs/specs/016c-access/spec.md and plan.md, tasks 7–10; Waleed's 2026-11-19 order update removes the C1 merge dependency.

## C2
1. Use Better Auth authentication.afterVerification before session creation to verify owned credential and current company membership through withUser.
2. Return credential_id from authorized unbind and delete its passkey through getAuth().$context.adapter; retain current unbind permissions and audit.
3. Add progressive-enhancement phone sign-in to the existing sign-in flow, using the same verified-session destination and generic failure.
4. Test the approved seams: passkey verification, authorized unbind, sign-in UI and disposable integration sources. No SQL execution.

## C3
1. Add authenticated invitation acceptance using session email and withUser, without account creation.
2. Read trusted session context alongside public invitation preview; render matching, mismatched and signed-out states without account lookup.
3. After joining, refresh workspaces, select the new company/role and navigate; preserve the invitation URL through sign-in.
4. Test approved server/UI and disposable integration seams, then run the full suite serially and viewport/theme checks.

## Delivery
Separate commits/reports for C2 and C3. Requested feature branches cannot be created/switched in this environment; commits remain on connected lovable. No PR, merge, database commands, production or secret changes.
