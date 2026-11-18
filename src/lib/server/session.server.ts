import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuth } from "./auth.server";

export async function requireUserId(): Promise<string> {
  if (!process.env["DATABASE_URL"] || !process.env["BETTER_AUTH_SECRET"])
    throw new Error("AUTH_NOT_CONFIGURED");
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders() as unknown as Headers,
  });
  if (!session) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}
