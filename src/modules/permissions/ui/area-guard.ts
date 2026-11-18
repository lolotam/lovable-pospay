import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { Area, SessionContextDto } from "../contracts";
import { canEnterArea } from "../domain/workspace";
import { sessionContextQuery } from "./use-session-context";
import { visibleNavigation } from "./navigation";
import { serviceSessionRecordingAvailable } from "@/modules/services";

export async function loadArea(cache: QueryClient, href: string, area: Area) {
  const session = await cache.fetchQuery(sessionContextQuery);
  if (!session) throw redirect({ to: "/sign-in", search: { redirect: href } });
  if (!session.active) throw redirect({ to: "/workspaces" });
  return { session, allowed: canEnterArea(session.active, session.permissions, area) };
}

export function pageAllowed(session: SessionContextDto, path: string) {
  if (!session.active) return false;
  const area = path.split("/")[1] as Area;
  if (
    !["admin", "app", "pos", "me"].includes(area) ||
    !canEnterArea(session.active, session.permissions, area)
  )
    return false;
  return visibleNavigation(area, session.permissions, serviceSessionRecordingAvailable).some(
    (item) => item.to === path || item.children?.some((child) => child.to === path),
  );
}
