# lovable-pospay-systems — Guidelines

## Components

The design system exports these components — import them from `@ws-adcee88d2daedf822faa/8383791a-56f2-45cc-994a-2694653e6172` and compose them before building anything from scratch:

`AppShell`, `AttendScan`, `AuthRejected`, `Button`, `ConnectorRow`, `ConnectorsPage`, `Input`, `ReceptionQr`

Per-component details (import stanzas, props, variants, examples) live in `.lovable/rules/libraries/{slug}/components.md` — on disk, not auto-loaded. Read that file or the component source when the name alone isn't enough.

## Theme Files

The design system's theme is delivered through the following files. The author's original source files carry the full wiring the design system needs — variable declarations, framework-specific directives, provider objects, etc. — and are the canonical import target.

- `@ws-adcee88d2daedf822faa/8383791a-56f2-45cc-994a-2694653e6172/styles.css` (source — preferred import)
- `@ws-adcee88d2daedf822faa/8383791a-56f2-45cc-994a-2694653e6172/dist/tokens.css` (auto-generated flat list of CSS custom properties — a raw-values fallback only; does NOT carry framework-specific wiring that the source files above provide)

