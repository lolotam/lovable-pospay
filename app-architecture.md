# app-architecture.md — Code architecture for the PosPay app

> Read fully before any task. Adapted from the old `CLAUDE.architecture.md` (A1.0) to the
> approved Phase 1 direction (PRD §10): **one React app (TanStack Start), server functions,
> self-hosted Supabase Postgres, Better Auth, RLS, GitHub → Dokploy.**
> NestJS, BullMQ, Redis, Next.js, `apps/*` and `packages/*` from the old docs do **not** apply here.
>
> On conflict: the PRD wins on business rules, this file wins on structure and imports,
> `AGENTS.md` wins on workflow.

## 0. الفكرة بالعربي

الكود متقسّم حسب **الشغل** مش حسب التقنية: فولدر لكل وحدة (الحضور، العمولات، الجلسات…).
جوّه كل وحدة، قواعد البيزنس في `domain/` ودي دوال صافية من غير قاعدة بيانات ولا شبكة.
الاعتماد دايماً للداخل: الواجهة تنادي الـ server function، والـ server function تنادي الـ use case،
والـ use case يستخدم `domain/`. عمر `domain/` ما يعرف حاجة عن Postgres أو React.
مثال صالون: حساب عمولة أخصائية الأظافر (10% بعد 3 أضعاف الراتب) دالة في `commissions/domain/`،
تقدر تختبرها بأرقام بس من غير ما تفتح قاعدة بيانات.

## 1. Folder layout (do not invent new top-level folders)

```text
src/
  routes/                 TanStack file routes (UI pages + /api/* server routes). Thin.
  components/ui/          shadcn primitives only. No business logic.
  modules/<module>/       one folder per business capability (Screaming Architecture)
    domain/               pure functions + types. Zero imports outside shared/kernel.
    use-cases/            one file per use case; orchestrates domain + ports.
    ports/                interfaces (repository, clock, id, notifier). Types only.
    persistence/          *.server.ts — SQL through withUser(); implements ports.
    functions/            *.functions.ts — createServerFn entry points (auth + validation).
                          Never name it `server/`: the bundler blocks any `server/` folder from the browser.
    ui/                   React components and hooks for this module.
    contracts.ts          Zod schemas shared by functions/ and ui/.
    index.ts              the module's public API. Other modules import only this.
  shared/kernel/          Money (bigint mills), Percentage, KWD rounding, ids, clock. Zero deps.
  lib/server/             db.server.ts, auth.server.ts, session.server.ts, whatsapp.server.ts
  i18n/                   ar.json, en.json, t() helper.
db/migrations/            numbered idempotent SQL (schema + RLS + grants)
db/tests/                 SQL negative isolation tests
docs/                     PRD, deploy guide, ADRs (docs/adr/NNNN-title.md)
```

Phase 1 modules: `staff`, `attendance`, `services` (sessions, packages, clients),
`commissions`, `ratings`, `notifications`, `permissions`, `imports`, and `platform`
(operator-level AI/API connectors, super admin only; its tables have no `company_id`).

Banned folder names anywhere: `utils/` (except the existing `src/lib/utils.ts`), `helpers/`,
`common/`, `misc/`, `managers/`, `services/` as a technical layer.

## 2. The dependency rule

Dependencies point inward only: `routes/ui → functions → use-cases → domain`.

| A file in… | may import | may never import |
|---|---|---|
| `domain/` | `shared/kernel` | React, pg, Zod runtime, Better Auth, another module, `ports/` |
| `use-cases/` | own `domain/`, own `ports/`, `shared/kernel`, `contracts.ts` types | pg, SQL, `process.env`, HTTP/request objects |
| `ports/` | own `domain/` types, `shared/kernel` | anything else |
| `persistence/` | own `ports/`, own `domain/`, `lib/server/db.server` | `functions/`, `ui/`, another module |
| `functions/` | own `use-cases/`, own `persistence/` (wiring), `contracts.ts`, `lib/server/*` (dynamic import) | `domain/` directly for business logic |
| `ui/` | own `contracts.ts`, own `functions/`, `components/ui`, `i18n` | `persistence/`, `lib/server/*`, `*.server.ts` |
| `routes/` | modules' `index.ts` and `ui/` | `persistence/`, SQL |
| any module | another module's `index.ts` only | deep paths like `../attendance/persistence/x` |

Cross-module: prefer reading through the other module's `index.ts` query function; never write
to another module's tables.

## 3. Where logic goes

- **Arithmetic and business rules live only in `domain/`.** Commission tiers, discount limits,
  package rounding (ق-5), 16-hour open session rule, geofence check — all pure functions.
- **use-cases** load data via ports, call domain, save via ports, write the audit log.
- **`Date.now()`, `new Date()`, `randomUUID()` are forbidden in `domain/` and `use-cases/`** —
  inject `Clock` and `IdGenerator` ports.
- **Money is `bigint` mills** (1 KWD = 1000 mills), via `shared/kernel/money.ts`. Never a JS
  `number`, never float. Format to `0.000 KWD` only in `ui/`.
- Time zone per branch (D-10): domain takes a branch timezone argument, never the server's zone.

## 4. Database and tenancy

- Every tenant table has `company_id` and is keyed `(company_id, id)`. `companies` is the root.
- Every query runs through `withUser()` (role `pospay_app`, `app.user_id`). No runtime role has
  `BYPASSRLS`. Service-level bypass needs an ADR.
- Same PR as a new table: migration + grants to `pospay_app` + RLS policies (`is_member`,
  `has_company_role`) + a negative case in `db/tests/isolation.sql`.
- Corrections never overwrite: keep the old value and a mandatory reason (D-32), log in `audit_log`.

## 5. Server functions

- Each `*.functions.ts` handler: authenticate (`requireUserId`) → validate input with the
  module's Zod contract → call one use case → return a plain DTO.
- Server-only code is in `*.server.ts` and loaded with `await import()` inside the handler.
- Secrets only from `process.env[...]` inside handlers. Never `VITE_` for secrets.
- Staff screens use polling (PRD §10), no websockets in Phase 1.

## 6. Frontend

- Arabic-first, RTL. **Logical CSS only**: `ms-/me-/ps-/pe-/start-/end-`, never `ml-/mr-/left-/right-`.
- **All UI strings through i18n** (`t("key")`), no literal Arabic or English text in JSX.
- Colors only from tokens in `src/styles.css`.
- Initial reads: route loader + `ensureQueryData`, component `useSuspenseQuery`.

## 7. Size and comments

- Files under 400 lines, functions under 60 lines.
- Arabic JSDoc required on every export in `domain/`, `ports/` and module events.
- Banned: closing comments, `FIXME`, `HACK`, commented-out code. A doc comment changes in the
  same commit as its code.

```ts
/**
 * يحسب عمولة الموظفة لفترة واحدة حسب خطتها (قاعدة + شرائح).
 * @param sales صافي المبيعات المؤهلة بالملّيم
 * @returns العمولة بالملّيم، مقرّبة لأقرب فلس
 */
export function computeCommission(sales: bigint, plan: CommissionPlan): bigint { … }
```

## 8. When not to abstract

No port for something used once with no test need. No generic repository. No event bus in
Phase 1 — direct calls through `index.ts`. Add an abstraction only when a second real caller or
a test needs it.

## 9. Tests

- `domain/` unit tests (vitest) next to the code: one test per PRD rule with concrete numbers
  (e.g. ق-1 … ق-7, §6.3 examples), never snapshots.
- SQL isolation tests in `db/tests/` for every tenant table.
- Never loosen a bound or delete a test to make it pass.

## 10. Definition of done for a slice

1. Spec of the use case written (rules, edge cases, acceptance, permissions).
2. Contract → migration + RLS + grants → domain + tests → use case → persistence → server fn → UI.
3. Isolation test updated and passing.
4. No import-matrix violation, no `number` money, no direct clock/uuid in domain/use-cases.
5. All strings through i18n, logical CSS only, Arabic JSDoc where required.
6. Typecheck, lint and tests green; results reported as facts.
7. Any business rule not in the PRD is marked `TODO(spec)` and asked, never guessed.
