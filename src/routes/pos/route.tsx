import { createFileRoute, Outlet } from "@tanstack/react-router";
import { loadArea } from "@/modules/permissions/ui/area-guard";
import { AreaShell } from "@/modules/permissions/ui/area-shell";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
export const Route = createFileRoute("/pos")({
  ssr: false,
  beforeLoad: ({ context, location }) => loadArea(context.queryClient, location.href, "pos"),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: AreaLayout,
});
function AreaLayout() {
  const { session, allowed } = Route.useRouteContext();
  return (
    <AreaShell area="pos" context={session}>
      {allowed ? <Outlet /> : <NoAccess workspace={session.active} />}
    </AreaShell>
  );
}
