import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionsPage } from "./permissions-page";
import type { MemberPermissionsDto } from "../contracts";
import { toStates } from "../domain/override-states";
import { t } from "@/i18n";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const companyId = "70000000-0000-4000-8000-000000000001";
const owner: MemberPermissionsDto = {
  userId: "owner",
  name: "Owner",
  email: "owner@example.test",
  roles: ["owner"],
  isOwner: true,
  overrides: toStates([]),
  otherRestrictions: [],
  effective: [],
};
const member: MemberPermissionsDto = {
  ...owner,
  userId: "mona",
  name: "Mona",
  email: "mona@example.test",
  roles: ["branch_manager"],
  isOwner: false,
};
function setup(members = [owner, member], save = vi.fn().mockResolvedValue(member)) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <PermissionsPage
      companyId={companyId}
      actorId="owner"
      members={members}
      save={save}
      refresh={refresh}
    />,
  );
  return { save, refresh };
}
describe("owner permission editor", () => {
  it("never exposes owner editing controls", () => {
    setup();
    const card = screen.getAllByText("owner@example.test")[0]?.closest("article");
    expect(card).toBeTruthy();
    if (!card) throw new Error("Owner card absent");
    fireEvent.click(within(card).getByRole("button"));
    expect(within(card).queryByRole("button", { name: t("permissionAdmin.allow") })).toBeNull();
  });
  it("sends exactly the six-key payload after changing pos.access", async () => {
    const { save } = setup();
    const group = screen.getAllByRole("group", { name: t("permissionAdmin.pos.access") })[0];
    if (!group) throw new Error("Permission control absent");
    fireEvent.click(within(group).getByRole("button", { name: t("permissionAdmin.allow") }));
    fireEvent.click(screen.getByRole("button", { name: t("permissionAdmin.save") }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        companyId,
        userId: "mona",
        overrides: { ...toStates([]), "pos.access": "allow" },
      }),
    );
  });
  it("offers the team link when only the owner exists", () => {
    setup([owner]);
    expect(screen.getByText(t("permissionAdmin.empty"))).toBeInTheDocument();
  });
  it("reloads the directory when a target was removed", async () => {
    const { refresh } = setup(
      [owner, member],
      vi.fn().mockRejectedValue(new Error("MEMBER_NOT_FOUND")),
    );
    const group = screen.getAllByRole("group", { name: t("permissionAdmin.pos.access") })[0];
    if (!group) throw new Error("Permission control absent");
    fireEvent.click(within(group).getByRole("button", { name: t("permissionAdmin.allow") }));
    fireEvent.click(screen.getByRole("button", { name: t("permissionAdmin.save") }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent(t("permissionAdmin.removed"));
  });
});
