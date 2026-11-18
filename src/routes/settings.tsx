import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { resolveLegacyPath } from "@/modules/permissions";
export const Route = createFileRoute("/settings")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionContextQuery);
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (!session.active) throw redirect({ to: "/workspaces", search: { redirect: location.href } });
    throw redirect({
      href: resolveLegacyPath(location.pathname, session.active) + location.searchStr,
      statusCode: 307,
    });
  },
});
