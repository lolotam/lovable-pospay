# App structure (016) Implementation Plan

> **For agentic workers:** execute task by task; steps use checkbox (`- [ ]`) syntax. Read
> `AGENTS.md`, `app-architecture.md` and `docs/specs/016-app-structure/spec.md` first.

**Goal:** Give PosPay a landing page, workspace selection after sign-in, and four role areas
(`/admin`, `/app`, `/pos`, `/me`) each with its own sidebar, guarded on the server.

**Architecture:** One typed `SessionContextDto` (user, workspaces, active workspace, permission
keys) is the only thing the frontend needs. Part A (frontend, Lovable) builds layouts and
navigation against that DTO using a stub. Part B (backend) fills it from the database through a
new `permissions` module, adds `has_permission()` in SQL and guards the area routes. The contract
file is written first and shared by both parts.

**Tech Stack:** TanStack Start file routes and server functions, React, Tailwind tokens, Zod 4,
Better Auth, PostgreSQL RLS through `withUser()`, Vitest.

**Spec:** `docs/specs/016-app-structure/spec.md`

## Global Constraints

- Branches: `lovable` for Part A (Lovable), `feat/p1-016-app-structure` for Part B. Never push
  to `main`, never force push, never `git commit -a`.
- No `.env`, secret, server or production change. Migration `0018` is applied to production only
  after Waleed approves; Lovable does not apply it.
- All UI text through `t("key")` with keys added to both `src/i18n/ar.json` and `en.json`.
  Logical CSS only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). Colours from tokens only.
- Files under 400 lines, functions under 60. Arabic JSDoc on every export in `domain/`.
- Import rule: `routes → modules' index.ts / ui`, `ui → own functions + contracts`,
  `functions → use-cases → domain`. Server code in `*.server.ts`, loaded with `await import()`.
- Folder for server functions is `functions/`, never `server/`.
- Tests assert behaviour, not markup. Database tests need
  `POSPAY_TEST_DATABASE_URL=postgres://…@127.0.0.1/pospay_test` and run serially:
  `bun run test --no-file-parallelism`.
- Do not change `src/routeTree.gen.ts` by hand; it regenerates on `bun run dev`/`build`.

## File Structure

```text
src/modules/permissions/
  contracts.ts                      Zod schemas + types shared by A and B        (Task 1)
  domain/permission-matrix.ts       role defaults, effective permissions          (Task 2)
  domain/workspace.ts               area per role, landing decision, safe redirect (Task 2)
  domain/*.test.ts
  ports/session-context-repository.ts                                            (Task 9)
  use-cases/load-session-context.ts, select-workspace.ts (+ tests)               (Task 9)
  persistence/session-context.server.ts (+ integration test)                     (Task 10)
  functions/session-context.functions.ts                                         (Task 11)
  ui/navigation.ts                  sidebar definition per area                   (Task 3)
  ui/area-shell.tsx                 sidebar + top bar + drawer                    (Task 4)
  ui/workspace-switcher.tsx, user-menu.tsx, no-access.tsx                         (Task 4)
  ui/use-session-context.ts         query hook (stub in A, real in B)             (Task 3)
  index.ts
src/routes/
  index.tsx                         landing                                       (Task 5)
  workspaces.tsx                                                                  (Task 5)
  admin/route.tsx, app/route.tsx, pos/route.tsx, me/route.tsx   area layouts      (Task 6)
  admin/index.tsx, app/index.tsx, pos/index.tsx, me/index.tsx   dashboards        (Task 7)
  app/attendance/{reports,corrections,questions}.tsx, app/staff/{cards,phones}.tsx,
  app/services/{index,discounts}.tsx, pos/{qr,cards,sessions}.tsx,
  me/{attend,phone}.tsx, {admin,app,pos,me}/settings.tsx                          (Task 6)
  reports.tsx, attend.tsx, … old paths become redirects                          (Task 6)
  s/$slug.tsx                       reserved                                      (Task 5)
db/migrations/0018_app_structure.sql                                             (Task 8)
db/tests/isolation.sql              permission_overrides negative case            (Task 8)
```

`src/components/app-shell.tsx` is deleted at the end of Task 6; `__root.tsx` renders `<Outlet />`
without a shell.

---

# Part A — frontend (Lovable, branch `lovable`)

### Task 1: Shared contract

**Files:** create `src/modules/permissions/contracts.ts`; modify `src/modules/permissions/index.ts`.

- [ ] Create the contract exactly as below.

```ts
import { z } from "zod";

export const companyRoleSchema = z.enum([
  "owner", "branch_manager", "reception", "staff", "accountant", "viewer",
]);
export type CompanyRole = z.infer<typeof companyRoleSchema>;

export const businessTypeSchema = z.enum(["salon", "restaurant", "laundry", "other"]);
export type BusinessType = z.infer<typeof businessTypeSchema>;

export const permissionKeySchema = z.enum([
  "pos.access", "reports.view", "attendance.correct", "staff.manage",
  "services.manage", "discounts.manage", "permissions.manage",
]);
export type PermissionKey = z.infer<typeof permissionKeySchema>;

export const areaSchema = z.enum(["admin", "app", "pos", "me"]);
export type Area = z.infer<typeof areaSchema>;

export const workspaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }),
  z.object({
    kind: z.literal("company"),
    companyId: z.uuid(),
    companyName: z.string(),
    businessType: businessTypeSchema,
    role: companyRoleSchema,
    branchId: z.uuid().nullable(),
    branchName: z.string().nullable(),
  }),
]);
export type WorkspaceDto = z.infer<typeof workspaceSchema>;

export const sessionContextSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  workspaces: z.array(workspaceSchema),
  active: workspaceSchema.nullable(),
  permissions: z.array(permissionKeySchema),
});
export type SessionContextDto = z.infer<typeof sessionContextSchema>;

export const selectWorkspaceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }),
  z.object({ kind: z.literal("company"), companyId: z.uuid(), role: companyRoleSchema }),
]);
export type SelectWorkspaceInput = z.infer<typeof selectWorkspaceInputSchema>;
```

- [ ] Export all of it from `index.ts` (`export * from "./contracts";`).
- [ ] Run `bunx tsgo --noEmit` (or the project typecheck). Expected: no errors. Commit
  `Add the session context contract for workspaces and permissions`.

### Task 2: Pure rules (domain)

**Files:** create `src/modules/permissions/domain/permission-matrix.ts`, `workspace.ts` and
their `*.test.ts`.

- [ ] Write the failing tests first.

```ts
// permission-matrix.test.ts
import { describe, it, expect } from "vitest";
import { effectivePermissions } from "./permission-matrix";

describe("effectivePermissions", () => {
  it("gives the owner every permission and ignores overrides", () => {
    const p = effectivePermissions("owner", [{ permission: "pos.access", effect: "deny" }]);
    expect(p).toContain("pos.access");
    expect(p).toContain("permissions.manage");
    expect(p).toHaveLength(7);
  });
  it("gives a branch manager the defaults without the reception area", () => {
    expect(effectivePermissions("branch_manager", []).sort()).toEqual(
      ["attendance.correct", "discounts.manage", "reports.view", "services.manage", "staff.manage"],
    );
  });
  it("adds an allowed permission", () => {
    expect(effectivePermissions("branch_manager", [{ permission: "pos.access", effect: "allow" }]))
      .toContain("pos.access");
  });
  it("lets deny win over a default and over an allow", () => {
    const p = effectivePermissions("branch_manager", [
      { permission: "reports.view", effect: "deny" },
      { permission: "pos.access", effect: "allow" },
      { permission: "pos.access", effect: "deny" },
    ]);
    expect(p).not.toContain("reports.view");
    expect(p).not.toContain("pos.access");
  });
  it("gives reception only the reception area and staff nothing", () => {
    expect(effectivePermissions("reception", [])).toEqual(["pos.access"]);
    expect(effectivePermissions("staff", [])).toEqual([]);
  });
});
```

```ts
// workspace.test.ts
import { describe, it, expect } from "vitest";
import { areaForWorkspace, canEnterArea, landingPath, safeRedirectPath } from "./workspace";
import type { WorkspaceDto } from "../contracts";

const company = (role: "owner" | "branch_manager" | "reception" | "staff"): WorkspaceDto => ({
  kind: "company", companyId: "40000000-0000-4000-8000-000000000001", companyName: "Salon",
  businessType: "salon", role, branchId: null, branchName: null,
});

describe("workspace rules", () => {
  it("maps each workspace to its home area", () => {
    expect(areaForWorkspace({ kind: "platform" })).toBe("admin");
    expect(areaForWorkspace(company("owner"))).toBe("app");
    expect(areaForWorkspace(company("reception"))).toBe("pos");
    expect(areaForWorkspace(company("staff"))).toBe("me");
  });
  it("opens the reception area for a manager only with pos.access", () => {
    expect(canEnterArea(company("branch_manager"), [], "pos")).toBe(false);
    expect(canEnterArea(company("branch_manager"), ["pos.access"], "pos")).toBe(true);
    expect(canEnterArea(company("staff"), [], "app")).toBe(false);
    expect(canEnterArea({ kind: "platform" }, [], "app")).toBe(false);
  });
  it("decides where to land after sign-in", () => {
    expect(landingPath([], null)).toBe("/workspaces");
    expect(landingPath([company("staff")], null)).toBe("/me");
    expect(landingPath([company("owner"), company("staff")], null)).toBe("/workspaces");
    expect(landingPath([company("owner"), company("staff")], company("owner"))).toBe("/app");
  });
  it("accepts only same-origin relative redirect paths", () => {
    expect(safeRedirectPath("/app/services?x=1")).toBe("/app/services?x=1");
    expect(safeRedirectPath("//evil.example")).toBeNull();
    expect(safeRedirectPath("https://evil.example")).toBeNull();
    expect(safeRedirectPath("/\\evil")).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });
});
```

- [ ] Run `bun run test src/modules/permissions/domain`. Expected: FAIL, modules not found.
- [ ] Implement.

```ts
// permission-matrix.ts
import type { CompanyRole, PermissionKey } from "../contracts";

/** تجاوز فردي لصلاحية واحدة: سماح أو منع. */
export interface PermissionOverride { permission: PermissionKey; effect: "allow" | "deny" }

const ALL: PermissionKey[] = [
  "pos.access", "reports.view", "attendance.correct", "staff.manage",
  "services.manage", "discounts.manage", "permissions.manage",
];
const MANAGER: PermissionKey[] = [
  "reports.view", "attendance.correct", "staff.manage", "services.manage", "discounts.manage",
];

/** الصلاحيات الافتراضية لكل دور (المواصفة 016، القاعدة R4). */
export const ROLE_DEFAULTS: Record<CompanyRole, readonly PermissionKey[]> = {
  owner: ALL,
  branch_manager: MANAGER,
  reception: ["pos.access"],
  staff: [],
  accountant: ["reports.view"],
  viewer: ["reports.view"],
};

/**
 * يحسب الصلاحيات الفعلية: افتراضيات الدور + السماح − المنع. المنع يغلب دائماً (D-31).
 * المالك لا يتأثر بأي تجاوز.
 * @param role دور العضوية النشطة
 * @param overrides تجاوزات هذا الشخص في هذه الشركة
 */
export function effectivePermissions(
  role: CompanyRole,
  overrides: readonly PermissionOverride[],
): PermissionKey[] {
  if (role === "owner") return [...ALL];
  const denied = new Set(overrides.filter((o) => o.effect === "deny").map((o) => o.permission));
  const granted = new Set<PermissionKey>(ROLE_DEFAULTS[role]);
  for (const o of overrides) if (o.effect === "allow") granted.add(o.permission);
  return ALL.filter((p) => granted.has(p) && !denied.has(p));
}
```

```ts
// workspace.ts
import type { Area, PermissionKey, WorkspaceDto } from "../contracts";

/** المنطقة الرئيسية لمساحة العمل (R3). */
export function areaForWorkspace(ws: WorkspaceDto): Area {
  if (ws.kind === "platform") return "admin";
  if (ws.role === "reception") return "pos";
  if (ws.role === "staff") return "me";
  return "app";
}

/** هل تسمح مساحة العمل النشطة بدخول هذه المنطقة؟ الاستقبال يُفتح أيضاً بصلاحية pos.access. */
export function canEnterArea(
  ws: WorkspaceDto,
  permissions: readonly PermissionKey[],
  area: Area,
): boolean {
  if (areaForWorkspace(ws) === area) return true;
  return area === "pos" && ws.kind === "company" && permissions.includes("pos.access");
}

/** وجهة المستخدم بعد الدخول (R2): مساحة واحدة تُفتح مباشرة، غير ذلك صفحة الاختيار. */
export function landingPath(workspaces: readonly WorkspaceDto[], active: WorkspaceDto | null): string {
  const target = active ?? (workspaces.length === 1 ? workspaces[0] : null);
  return target ? `/${areaForWorkspace(target)}` : "/workspaces";
}

/** يقبل مساراً نسبياً داخل الموقع فقط، ويرفض أي عنوان خارجي. */
export function safeRedirectPath(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
```

- [ ] Run the same test command. Expected: PASS (9 tests). Export the four workspace functions
  and `effectivePermissions` from `index.ts`. Commit `Add permission matrix and workspace rules`.

### Task 3: Navigation definition and session hook

**Files:** create `src/modules/permissions/ui/navigation.ts`, `navigation.test.ts`,
`use-session-context.ts`; add i18n keys.

- [ ] Write the failing test.

```ts
import { describe, it, expect } from "vitest";
import { visibleNavigation } from "./navigation";

const paths = (area: "admin" | "app" | "pos" | "me", perms: string[], recording = false) =>
  visibleNavigation(area, perms as never, recording).flatMap((g) =>
    g.children ? g.children.map((c) => c.to) : [g.to],
  );

describe("visibleNavigation", () => {
  it("shows a branch manager only permitted items", () => {
    const p = paths("app", ["reports.view", "staff.manage"]);
    expect(p).toContain("/app/attendance/reports");
    expect(p).toContain("/app/staff/cards");
    expect(p).not.toContain("/app/attendance/corrections");
    expect(p).not.toContain("/app/services");
  });
  it("drops a group whose children are all hidden", () => {
    const groups = visibleNavigation("app", ["reports.view"] as never, false);
    expect(groups.some((g) => g.label === "nav.group.services")).toBe(false);
  });
  it("hides sessions until recording is available", () => {
    expect(paths("pos", ["pos.access"])).not.toContain("/pos/sessions");
    expect(paths("pos", ["pos.access"], true)).toContain("/pos/sessions");
  });
  it("lists the platform items for the admin area", () => {
    expect(paths("admin", [])).toEqual(["/admin", "/admin/connectors", "/admin/diagnose", "/admin/settings"]);
  });
});
```

- [ ] Run it. Expected: FAIL.
- [ ] Implement `navigation.ts` with this shape and content.

```ts
import type { MessageKey } from "@/i18n";
import type { Area, PermissionKey } from "../contracts";

export interface NavLeaf { to: string; label: MessageKey; icon: string; requires?: PermissionKey; needsRecording?: boolean }
export interface NavGroup { label: MessageKey; icon: string; to?: string; requires?: PermissionKey; children?: NavLeaf[] }

const NAV: Record<Area, NavGroup[]> = {
  admin: [
    { to: "/admin", label: "nav.dashboard", icon: "⌂" },
    { to: "/admin/connectors", label: "nav.connectors", icon: "⚙" },
    { to: "/admin/diagnose", label: "nav.diagnose", icon: "✚" },
    { to: "/admin/settings", label: "nav.settings", icon: "◐" },
  ],
  app: [
    { to: "/app", label: "nav.dashboard", icon: "⌂" },
    { label: "nav.group.attendance", icon: "✓", children: [
      { to: "/app/attendance/reports", label: "nav.reports", icon: "≡", requires: "reports.view" },
      { to: "/app/attendance/corrections", label: "nav.corrections", icon: "✓", requires: "attendance.correct" },
      { to: "/app/attendance/questions", label: "nav.insights", icon: "?", requires: "reports.view" },
    ] },
    { label: "nav.group.staff", icon: "▤", children: [
      { to: "/app/staff/cards", label: "nav.cards", icon: "▤", requires: "staff.manage" },
      { to: "/app/staff/phones", label: "nav.phones", icon: "▢", requires: "staff.manage" },
    ] },
    { label: "nav.group.services", icon: "◇", children: [
      { to: "/app/services", label: "nav.services", icon: "◇", requires: "services.manage" },
      { to: "/app/services/discounts", label: "nav.discounts", icon: "%", requires: "discounts.manage" },
    ] },
    { to: "/pos", label: "nav.openReception", icon: "▦", requires: "pos.access" },
    { to: "/app/settings", label: "nav.settings", icon: "◐" },
  ],
  pos: [
    { to: "/pos", label: "nav.receptionHome", icon: "⌂" },
    { to: "/pos/qr", label: "nav.reception", icon: "▦" },
    { to: "/pos/cards", label: "nav.cardScan", icon: "▥" },
    { label: "nav.group.sessions", icon: "◆", children: [
      { to: "/pos/sessions", label: "nav.sessions", icon: "◆", needsRecording: true },
    ] },
    { to: "/pos/settings", label: "nav.settings", icon: "◐" },
  ],
  me: [
    { to: "/me", label: "nav.myDashboard", icon: "⌂" },
    { to: "/me/attend", label: "nav.attend", icon: "✓" },
    { to: "/me/phone", label: "nav.phone", icon: "▢" },
    { to: "/me/settings", label: "nav.settings", icon: "◐" },
  ],
};

const allowed = (item: { requires?: PermissionKey; needsRecording?: boolean }, perms: readonly PermissionKey[], recording: boolean) =>
  (!item.requires || perms.includes(item.requires)) && (!item.needsRecording || recording);

export function visibleNavigation(area: Area, perms: readonly PermissionKey[], recording: boolean): NavGroup[] {
  return NAV[area].flatMap((group) => {
    if (!group.children) return allowed(group, perms, recording) ? [group] : [];
    const children = group.children.filter((c) => allowed(c, perms, recording));
    return children.length ? [{ ...group, children }] : [];
  });
}
```

- [ ] Add i18n keys to `ar.json` and `en.json`: `nav.dashboard`, `nav.myDashboard`,
  `nav.receptionHome`, `nav.openReception`, `nav.phones`, `nav.attend`, `nav.group.attendance`,
  `nav.group.staff`, `nav.group.services`, `nav.group.sessions`, `ws.title`, `ws.empty`,
  `ws.platform`, `ws.switch`, `ws.role.owner`, `ws.role.branch_manager`, `ws.role.reception`,
  `ws.role.staff`, `ws.role.accountant`, `ws.role.viewer`, `ws.type.salon`, `ws.type.restaurant`,
  `ws.type.laundry`, `ws.type.other`, `auth.signOut`, `access.denied.title`,
  `access.denied.body`, `access.denied.home`, `landing.cta`, `landing.openDashboard`.
  Reuse existing keys (`nav.reports`, `nav.cards`, …) where they exist.
- [ ] Create `use-session-context.ts`: `sessionContextQuery = queryOptions({ queryKey:
  ["session-context"], queryFn: () => getSessionContext() })` and
  `useSessionContext()` returning `useSuspenseQuery(sessionContextQuery).data`. Until Part B
  lands, `getSessionContext` is a stub server function in
  `src/modules/permissions/functions/session-context.functions.ts` that returns `null` when
  signed out and otherwise builds the DTO from the existing `getMyCompanies` (role defaults via
  `effectivePermissions(role, [])`, `businessType: "salon"`, `active` = single workspace or `null`).
- [ ] Run `bun run test src/modules/permissions`. Expected: PASS. Commit
  `Define area navigation and the session context hook`.

### Task 4: Area shell components

**Files:** create `src/modules/permissions/ui/area-shell.tsx`, `workspace-switcher.tsx`,
`user-menu.tsx`, `no-access.tsx`.

- [ ] `AreaShell({ area, context, children })`:
  - desktop (`md:` and up): sticky sidebar `w-52 lg:w-60`, `border-e`, `bg-sidebar`; order top to
    bottom: app name, `WorkspaceSwitcher`, navigation from `visibleNavigation(area,
    context.permissions, serviceSessionRecordingAvailable)`, then `UserMenu` pinned to the bottom.
  - groups with `children` render a `<button aria-expanded>` that toggles the sub-list; a group
    containing the active path starts open. Leaves are `<Link>` with
    `data-[status=active]:bg-sidebar-accent`.
  - phone (below `md`): a sticky top bar with a menu button (`aria-controls`), the active
    workspace name and the user menu; the same navigation opens as a drawer from the start edge,
    closes on navigation, on Escape and on backdrop tap, and traps focus while open.
  - every interactive target is at least 44px high on phones.
- [ ] `WorkspaceSwitcher({ context })`: button showing company name + role label (or
  `ws.platform`); opens a list of `context.workspaces`; choosing one calls `selectWorkspace`,
  invalidates `["session-context"]` and navigates to `/${areaForWorkspace(ws)}`. With one
  workspace it renders as plain text.
- [ ] `UserMenu({ user })`: name, email, and a `auth.signOut` button calling
  `authClient.signOut()`, then clearing the query cache and navigating to `/`.
- [ ] `NoAccess()`: `access.denied.title`, `access.denied.body`, a link to the workspace home.
- [ ] Check at 390 / 820 / 1280 px in light and dark: no horizontal overflow, drawer reachable
  by keyboard. Commit `Add the area shell with sidebar, switcher and user menu`.

### Task 5: Landing, workspace chooser, reserved path

**Files:** rewrite `src/routes/index.tsx`; create `src/routes/workspaces.tsx`,
`src/routes/s/$slug.tsx`; modify `src/routes/sign-in.tsx`.

- [ ] `/`: public landing — product name, one-sentence value (existing `app.tagline`,
  `app.description`), the six module names, and one primary button: `landing.cta` → `/sign-in`
  when signed out, `landing.openDashboard` → `landingPath(...)` when signed in. Move the system
  status block out of the landing into `/admin` (Task 7). Keep the route's `head()` metadata.
- [ ] `/workspaces`: requires sign-in (`beforeLoad`: `null` context → `redirect({ to:
  "/sign-in", search: { redirect: "/workspaces" } })`). Cards: company name, role label,
  business type label, branch name when present; a "Platform" card for platform admins. Empty
  state `ws.empty` with sign-out. Choosing a card behaves like the switcher.
- [ ] `sign-in.tsx` `finish()`: replace `navigate({ to: "/" })` with: refetch
  `["session-context"]`, then go to `safeRedirectPath(search.redirect) ?? landingPath(ctx.workspaces,
  ctx.active)`. Extend the route's existing `validateSearch` to also return `redirect` when it is a string.
- [ ] `/s/$slug`: `beforeLoad: () => { throw notFound(); }` with `robots: noindex`.
- [ ] Commit `Add landing page, workspace chooser and post-sign-in routing`.

### Task 6: Area layouts, page moves and redirects

**Files:** create `src/routes/{admin,app,pos,me}/route.tsx`; move pages per the spec route map;
turn old route files into redirects; modify `src/routes/__root.tsx`; delete
`src/components/app-shell.tsx`.

- [ ] Each `route.tsx` is the layout for its folder:

```tsx
export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context, location }) => {
    const ctx = await context.queryClient.ensureQueryData(sessionContextQuery);
    if (!ctx) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (!ctx.active) throw redirect({ to: "/workspaces" });
    return { session: ctx, allowed: canEnterArea(ctx.active, ctx.permissions, "app") };
  },
  component: AppArea,
});
function AppArea() {
  const { session, allowed } = Route.useRouteContext();
  return <AreaShell area="app" context={session}>{allowed ? <Outlet /> : <NoAccess />}</AreaShell>;
}
```

  Same for `admin`, `pos`, `me` with their area name.
- [ ] Move each page: the new route file only changes `createFileRoute("<new path>")`; the page
  component stays in its module `ui/`. A leaf that needs a permission adds
  `beforeLoad: ({ context }) => { if (!context.session.permissions.includes("reports.view")) throw redirect({ to: "/app" }); }`.
- [ ] `/phone` splits. Today `src/routes/phone.tsx` holds both parts in the route file. Move
  the staff binding part (`startBindingFn`, `finishBindingFn`) to
  `src/modules/staff/ui/phone-binding.tsx` for `/me/phone`, and the manager part
  (`getPhoneManagementFn`, `unbindPhoneFn`) to `src/modules/staff/ui/phone-management.tsx` for
  `/app/staff/phones`. Behaviour and server functions stay unchanged.
- [ ] Old paths: replace each old route file body with
  `createFileRoute("/reports")({ beforeLoad: ({ search }) => { throw redirect({ to: "/app/attendance/reports", search }); } })`.
  List: `/reports`, `/attendance-corrections`, `/attendance-questions`, `/cards`, `/services`,
  `/discounts`, `/sessions`, `/reception/qr`, `/reception/cards`, `/attend`, `/phone` (→ `/me/phone`),
  `/settings` (→ `/${area}/settings` of the active workspace, `/sign-in` when signed out).
- [ ] `__root.tsx`: `RootComponent` renders `<Outlet />` directly inside `QueryClientProvider`;
  translate the 404 and error texts through i18n while there. Delete `app-shell.tsx` and its
  export from the design-system list if referenced.
- [ ] Run `bun run build` and `bun run lint`. Expected: build OK, 0 lint errors. Open each new
  path signed out (→ sign-in) and each old path (→ new path, query preserved). Commit
  `Move pages into role areas and redirect the old paths`.

### Task 7: Dashboard shells

**Files:** create `src/routes/{admin,app,pos,me}/index.tsx` and one small card component
`src/modules/permissions/ui/stat-card.tsx`.

- [ ] `/admin`: cards "companies", "users", connector summary, system status block (moved from
  landing), link to diagnose. Numbers come from `getPlatformOverview()` (Part B, Task 11); until
  then show the status block and links only.
- [ ] `/app`: cards "present today", "open exceptions", "staff", plus quick links filtered by
  `permissions`. Numbers from `getCompanyOverview()` (Part B); until then links only.
- [ ] `/pos`: three large buttons (QR, card scan, sessions when available).
- [ ] `/me`: check-in button to `/me/attend`, phone binding link.
- [ ] No charts, no placeholder numbers: a card without data is not rendered. Commit
  `Add dashboard home pages for the four areas`.

**Part A done when:** build and lint pass, `bun run test` passes, the six acceptance checks that
do not need Part B (1 landing/sidebar/sign-out, 5 redirects, 6 responsive) are verified in the
preview, and the commit list is reported.

---

# Part B — backend (branch `feat/p1-016-app-structure`, after Part A is merged into it)

### Task 8: Migration 0018 and isolation

**Files:** create `db/migrations/0018_app_structure.sql`; modify `db/tests/isolation.sql`.

- [ ] Write the migration.

```sql
-- 016: workspace label and effective permission check (role defaults + overrides, deny wins).
alter table public.companies add column if not exists business_type text not null default 'salon';
do $$ begin
  alter table public.companies add constraint companies_business_type_chk
    check (business_type in ('salon','restaurant','laundry','other'));
exception when duplicate_object then null; end $$;

create or replace function public.role_default_permission(_role public.company_role, _permission text)
returns boolean language sql immutable as $$
  select case _role
    when 'owner' then true
    when 'branch_manager' then _permission in
      ('reports.view','attendance.correct','staff.manage','services.manage','discounts.manage')
    when 'reception' then _permission = 'pos.access'
    when 'accountant' then _permission = 'reports.view'
    when 'viewer' then _permission = 'reports.view'
    else false end $$;

create or replace function public.has_permission(_company uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.has_company_role(_company, 'owner') then true
    when exists (select 1 from public.permission_overrides o
                 where o.company_id = _company and o.user_id = public.current_app_user()
                   and o.permission = _permission and o.effect = 'deny') then false
    else exists (select 1 from public.memberships m
                 where m.company_id = _company and m.user_id = public.current_app_user()
                   and public.role_default_permission(m.role, _permission))
      or exists (select 1 from public.permission_overrides o
                 where o.company_id = _company and o.user_id = public.current_app_user()
                   and o.permission = _permission and o.effect = 'allow'
                   and public.is_member(_company))
  end $$;

create or replace function public.platform_overview()
returns table(companies bigint, users bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.companies), (select count(*) from public."user")
  where public.is_super_admin() $$;

revoke all on function public.role_default_permission(public.company_role, text) from public;
revoke all on function public.has_permission(uuid, text) from public;
revoke all on function public.platform_overview() from public;
grant execute on function public.role_default_permission(public.company_role, text) to pospay_app;
grant execute on function public.has_permission(uuid, text) to pospay_app;
grant execute on function public.platform_overview() to pospay_app;
```

- [ ] Add to `db/tests/isolation.sql`: as company A's owner, `select count(*) from
  public.permission_overrides where company_id = <B>` must be 0 and an insert for company B must
  raise; `has_permission(<B>, 'reports.view')` must be false.
- [ ] Apply the migration twice on local `pospay_test`, then run
  `psql "$POSPAY_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/isolation.sql`. Expected: both
  passes exit 0. Commit `Add business type and the effective permission check`.

### Task 9: Use cases

**Files:** create `ports/session-context-repository.ts`,
`use-cases/load-session-context.ts`, `use-cases/select-workspace.ts` and tests.

- [ ] Port:

```ts
export interface SessionContextRepository {
  /** عضويات المستخدم في كل الشركات مع اسم الفرع ونوع النشاط. */
  listCompanyWorkspaces(): Promise<Extract<WorkspaceDto, { kind: "company" }>[]>;
  /** هل المستخدم مدير منصة؟ */
  isPlatformAdmin(): Promise<boolean>;
  /** تجاوزات المستخدم في شركة واحدة. */
  listOverrides(companyId: string): Promise<PermissionOverride[]>;
}
```

- [ ] Tests first (fake repository): platform admin without memberships → one `platform`
  workspace, `active` = it, permissions `[]`; two memberships and a remembered choice that still
  exists → that one active with its effective permissions; remembered choice no longer present →
  `active: null`, `staleChoice: true`; `selectWorkspace` with a company the user does not hold →
  throws `FORBIDDEN`; with a held one → returns the same value to store.
- [ ] Implement `loadSessionContext(repo, user, remembered: SelectWorkspaceInput | null)`
  returning `{ context: SessionContextDto; staleChoice: boolean }` and
  `selectWorkspace(repo, input)` returning the validated `SelectWorkspaceInput`. Active
  resolution: remembered if present in the list, else the only workspace, else `null`.
  Permissions: `effectivePermissions(active.role, overrides)` for a company workspace, `[]` for
  platform. No clock or id use.
- [ ] Run `bun run test src/modules/permissions/use-cases`. Expected: PASS. Commit
  `Load the session context and validate workspace selection`.

### Task 10: Persistence

**Files:** create `persistence/session-context.server.ts` and
`session-context.integration.test.ts`.

- [ ] `pgSessionContextRepository(db, userId)`: 
  `listCompanyWorkspaces` = `select c.id, c.name, c.business_type, m.role::text, m.branch_id,
  b.name from memberships m join companies c on c.id = m.company_id left join branches b on b.id
  = m.branch_id where m.user_id = $1 order by c.name, m.role`; `isPlatformAdmin` = `select
  public.is_super_admin()`; `listOverrides` = `select permission, effect from
  permission_overrides where company_id = $1 and user_id = $2`, dropping unknown keys with
  `permissionKeySchema.safeParse`.
- [ ] Integration test (pattern of `session.integration.test.ts`, guard on `127.0.0.1` +
  `/pospay_test`, migrations applied twice): for every role × every permission key,
  `select public.has_permission($company, $key)` under `withUser` equals
  `effectivePermissions(role, []).includes(key)`; then with one `allow` and one `deny` row the
  two still agree; a second company's rows are not returned.
- [ ] Run `bun run test --no-file-parallelism src/modules/permissions`. Expected: PASS, 0
  skipped. Commit `Read workspaces and overrides under RLS`.

### Task 11: Server functions and guards

**Files:** replace the stub in `functions/session-context.functions.ts`; add
`functions/overview.functions.ts`; modify the four `route.tsx` only if the DTO changed (it must not).

- [ ] `getSessionContext` (GET): `requireSession()` in try/catch — `UNAUTHENTICATED` or
  `AUTH_NOT_CONFIGURED` returns `null`; read cookie `pospay-ws` (JSON, parsed with
  `selectWorkspaceInputSchema.safeParse`); call `loadSessionContext`; when `staleChoice`, delete
  the cookie; parse the result with `sessionContextSchema` before returning.
- [ ] `selectWorkspace` (POST): `requireUserId()`, validate input, call the use case, set cookie
  `pospay-ws` with `httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"`,
  `maxAge` 180 days.
- [ ] `getPlatformOverview` (GET): `select * from public.platform_overview()`; no row →
  `FORBIDDEN`. `getCompanyOverview` (GET, input `{ companyId }`): staff present today, open
  attendance exceptions and staff count through reader functions exported by the attendance and
  staff modules (add `src/modules/attendance/index.server.ts`; `staff` already has one); a branch manager's `branchId` narrows the counts (R5).
- [ ] Add `has_permission` checks to the existing server functions behind the moved pages where
  they only checked the role today: reports → `reports.view`, corrections →
  `attendance.correct`, cards/phones → `staff.manage`, catalog → `services.manage`, discounts →
  `discounts.manage`, reception QR/cards/sessions → `pos.access`. Each gets one integration case:
  a `deny` override refuses the call.
- [ ] Run full `bun run test --no-file-parallelism`, `bun run lint`, typecheck, `bun run build`.
  Expected: all pass. Commit `Serve the session context and enforce permissions on the server`.

### Task 12: Acceptance and delivery

- [ ] Verify spec acceptance 1–7 against a local build with seeded users; record evidence in
  `docs/specs/016-app-structure/verification.md`.
- [ ] Run the guard reviews (`clean-code-guard`, `test-guard`, `docs-guard`), fix findings.
- [ ] Update `roadmap.md`; add one line to `AGENTS.md` under "PosPay architecture": areas,
  workspace cookie, `has_permission`.
- [ ] Open the PR to `main` with checks output and what waits on Waleed: approval to apply
  migration `0018` in production and to deploy.

## Not in this plan (016-C)

`/app/permissions` management page, staff passkey sign-in, invitation acceptance page, dashboard
charts, page builder at `/s/$slug`, per-policy use of `has_permission` in RLS.
