# Domain app2.pospay.systems + Responsive pass (mobile → iPad → desktop)

## 1. Domain change (Dokploy, needs DNS)
- Add domain `app2.pospay.systems` to Dokploy app `pospay-app` (port 3000, HTTPS, Let's Encrypt).
- Keep the sslip.io domain until the new one is live, then ask before removing it.
- Update `BETTER_AUTH_URL=https://app2.pospay.systems` in Dokploy env (production saveEnvironment — approved by this request) and redeploy.
- Waleed adds DNS: **A record `app2` → 82.29.164.194** at the pospay.systems DNS provider.
- Google OAuth callback becomes `https://app2.pospay.systems/api/auth/callback/google`.
- Update `docs/DEPLOY.md` + `mem://deployment/approvals.md`.

## 2. Responsive pass (all screens)
Mobile-first, breakpoints: mobile <768, iPad 768–1279, desktop ≥1280.
Screens: home, sign-in, reset-password, settings, phone, attend, reception/qr, attendance-questions, admin/connectors, admin/diagnose, plus `AppShell`.

Rules applied everywhere:
- `AppShell`: mobile = sticky top bar + horizontally scrollable nav that auto-scrolls the active item into view; iPad = collapsible icon rail; desktop = full sidebar.
- Header rows: `grid-cols-[minmax(0,1fr)_auto]` → `sm:flex`, `min-w-0`, `truncate`, `shrink-0`.
- Touch targets ≥44px, inputs ≥16px font on mobile (no iOS zoom).
- Forms: single column mobile, max-width card on iPad/desktop.
- Connector rows / lists: stacked cards on mobile, 2 columns iPad, table-like rows desktop.
- QR: fluid size `min(80vw, 360px)`.
- `100dvh` instead of `100vh`; safe-area padding for notch.
- Logical CSS only (`ps/pe/ms/me`), RTL preserved, no new UI strings without i18n.

## 3. Verification
- Playwright screenshots of every screen at 390, 820, 1280 in light and dark; check no horizontal overflow (`scrollWidth <= innerWidth`).
- `curl https://app2.pospay.systems` → 200 after DNS propagates.

## Waiting on Waleed
- DNS A record `app2` → 82.29.164.194.
