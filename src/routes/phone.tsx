import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { areaForWorkspace } from "@/modules/permissions";
export const Route = createFileRoute("/phone")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionContextQuery);
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (!session.active) throw redirect({ to: "/workspaces" });
    const target = areaForWorkspace(session.active) === "me" ? "/me/phone" : "/app/staff/phones";
    throw redirect({ href: target + location.searchStr, statusCode: 307 });
  },
});
