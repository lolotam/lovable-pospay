import { describe, expect, it } from "vitest";
import { Route } from "./phone";
import type { SessionContextDto, WorkspaceDto } from "@/modules/permissions/contracts";

const company = (role: "staff" | "owner" | "branch_manager"): WorkspaceDto => ({
  kind: "company",
  companyId: "40000000-0000-4000-8000-000000000001",
  companyName: "Salon",
  businessType: "salon",
  role,
  branchId: null,
  branchName: null,
});
const session = (active: WorkspaceDto): SessionContextDto => ({
  user: { id: "u", name: "Mona", email: "mona@example.test" },
  workspaces: [active],
  active,
  permissions: [],
});

async function redirectFor(context: SessionContextDto | null) {
  const beforeLoad = Route.options.beforeLoad as unknown as (arg: unknown) => Promise<void>;
  try {
    await beforeLoad({
      context: { queryClient: { fetchQuery: async () => context } },
      location: { href: "/phone?x=1", searchStr: "?x=1" },
    });
  } catch (thrown) {
    return (thrown as { options: { href?: string; to?: string } }).options;
  }
  throw new Error("expected a redirect");
}

describe("legacy /phone", () => {
  it.each([
    ["staff", "/me/phone?x=1"],
    ["owner", "/app/staff/phones?x=1"],
    ["branch_manager", "/app/staff/phones?x=1"],
  ] as const)("sends a %s workspace to its own phone page", async (role, href) => {
    expect((await redirectFor(session(company(role)))).href).toBe(href);
  });
  it("sends a signed-out visitor to sign-in", async () => {
    expect((await redirectFor(null)).to).toBe("/sign-in");
  });
});
