# 010 — attendance: safe reception QR lifecycle

## Requirement
Complete the remaining independent reception-screen safety work in 001/008.
Authenticated physical-phone acceptance remains blocked, not replaced by this slice.

## Business rules
- PRD §4.1 / approved س3: QR lifetime remains 60 seconds; polling remains 50 seconds.
- Existing server authorization and signature verification remain authoritative.
- Never show a code after its conservative display deadline or for a previous branch.

## Edge cases
Refresh hangs, QR rendering is slow, branch changes during a request, refresh fails,
tab timers pause, malformed branch search values.

## Acceptance criteria
- A 60-second response requested at time 0 disappears by 60,000 ms even if refresh hangs.
- A response or rendered bitmap arriving after that deadline is never shown.
- Requests never overlap within one mounted branch; failures remove stale QR immediately;
  subsequent polling can restore a fresh code.
- Changing branch immediately hides the previous image and ignores its eventual response.
- Missing or invalid branch values show the existing localized missing-branch state;
  no request is made and no root error boundary is entered.

## Schema / contract / permissions
No database or server changes. BranchQrDto and existing permissions are unchanged.
The public presentation seam is the QR hook's observable image/name/error state;
search parsing is the other seam. Tests use controlled RPC/bitmap/clock boundaries.

## Tests
Vitest lifecycle regression tests, search-input tests, full serial suite including
real disposable database isolation, full lint, browser invalid/missing/unconfigured
states at phone/iPad/desktop in both themes. Real signed-in acceptance stays open.

## Open questions
None for this slice. Barcode, Google, secrets, production and PR/CI remain untouched.