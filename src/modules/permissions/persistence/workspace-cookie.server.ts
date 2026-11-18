import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { selectWorkspaceInputSchema, type SelectWorkspaceInput } from "../contracts";
const name = "pospay-ws";
const options = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/" };
export function readWorkspaceCookie(): {
  remembered: SelectWorkspaceInput | null;
  invalid: boolean;
} {
  const raw = getCookie(name);
  if (raw === undefined) return { remembered: null, invalid: false };
  try {
    const parsed = selectWorkspaceInputSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? { remembered: parsed.data, invalid: false }
      : { remembered: null, invalid: true };
  } catch {
    return { remembered: null, invalid: true };
  }
}
export function clearWorkspaceCookie() {
  deleteCookie(name, options);
}
export function writeWorkspaceCookie(input: SelectWorkspaceInput) {
  setCookie(name, JSON.stringify(input), { ...options, maxAge: 180 * 24 * 60 * 60 });
}
