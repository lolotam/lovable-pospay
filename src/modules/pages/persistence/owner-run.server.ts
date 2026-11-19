import { requireSession } from "@/lib/server/session.server";
import { withUser } from "@/lib/server/db.server";
import { readWorkspaceCookie } from "@/modules/permissions/index.server";
import { setResponseHeader } from "@tanstack/react-start/server";
import { pgPageRepository } from "./page.server";
import type { PageRepository } from "../ports/page-repository";

export async function ownerRun<T>(run: (repo: PageRepository) => Promise<T>): Promise<T> {
  const { user } = await requireSession();
  const active = readWorkspaceCookie().remembered;
  if (active?.kind !== "company" || active.role !== "owner") throw new Error("FORBIDDEN");
  setResponseHeader("Cache-Control", "private, no-store");
  return withUser(user.id, (db) => run(pgPageRepository(db, active.companyId, user.id)));
}
