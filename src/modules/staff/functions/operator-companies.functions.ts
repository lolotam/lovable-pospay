import { createServerFn } from "@tanstack/react-start";
import { isAuthNotConfigured } from "@/lib/auth-errors";

export const getOperatorUserId = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUserId } = await import("@/lib/server/session.server");
  try {
    return await requireUserId();
  } catch (error) {
    if (
      isAuthNotConfigured(error) ||
      (error instanceof Error && error.message === "UNAUTHENTICATED")
    )
      return null;
    throw error;
  }
});
