import { createServerFn } from "@tanstack/react-start";
import { sessionContextSchema, selectWorkspaceInputSchema } from "../contracts";
import { loadSessionContext } from "../use-cases/load-session-context";
import { selectWorkspace as selectWorkspaceUseCase } from "../use-cases/select-workspace";
export const getSessionContext = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/lib/server/session.server");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    if (
      error instanceof Error &&
      ["UNAUTHENTICATED", "AUTH_NOT_CONFIGURED"].includes(error.message)
    )
      return null;
    throw error;
  }
  const { withUser } = await import("@/lib/server/db.server");
  const { pgSessionContextRepository } = await import("../persistence/session-context.server");
  const { readWorkspaceCookie, clearWorkspaceCookie } =
    await import("../persistence/workspace-cookie.server");
  const { remembered, invalid } = readWorkspaceCookie();
  const result = await withUser(session.user.id, (db) =>
    loadSessionContext(
      pgSessionContextRepository(db, session.user.id),
      { id: session.user.id, name: session.user.name, email: session.user.email },
      remembered,
    ),
  );
  if (result.staleChoice || invalid) clearWorkspaceCookie();
  return sessionContextSchema.parse(result.context);
});
export const selectWorkspace = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => selectWorkspaceInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionContextRepository } = await import("../persistence/session-context.server");
    const { writeWorkspaceCookie } = await import("../persistence/workspace-cookie.server");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const userId = await requireUserId();
    const selected = await withUser(userId, (db) =>
      selectWorkspaceUseCase(pgSessionContextRepository(db, userId), data),
    );
    writeWorkspaceCookie(selected);
    return selected;
  });
