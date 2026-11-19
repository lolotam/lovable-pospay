import { requireSession } from "@/lib/server/session.server";
import { readWorkspaceCookie } from "@/modules/permissions/index.server";
import { setResponseHeader } from "@tanstack/react-start/server";
export async function assetContext() {
  const { user } = await requireSession();
  const active = readWorkspaceCookie().remembered;
  if (active?.kind !== "company" || active.role !== "owner") throw new Error("FORBIDDEN");
  setResponseHeader("Cache-Control", "private, no-store");
  return { userId: user.id, companyId: active.companyId };
}
