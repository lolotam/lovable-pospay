import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { areaForWorkspace } from "@/modules/permissions";
export const Route = createFileRoute("/settings")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionContextQuery);
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (!session.active) throw redirect({ to: "/workspaces" });
    throw redirect({
      href: `/${areaForWorkspace(session.active)}/settings` + location.searchStr,
      statusCode: 307,
    });
  },
});
