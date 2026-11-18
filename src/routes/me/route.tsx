import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { loadArea, pageAllowed } from "@/modules/permissions/ui/area-guard";
import { areaForWorkspace } from "@/modules/permissions";
import { AreaShell } from "@/modules/permissions/ui/area-shell";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
export const Route = createFileRoute("/me")({
  ssr: false,
  beforeLoad: ({ context, location }) => loadArea(context.queryClient, location.href, "me"),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: AreaLayout,
});
function AreaLayout() {
  const { session, allowed } = Route.useRouteContext();
  const { pathname } = useLocation();
  // موظفة بدور آخر تفتح /me/attend من QR داخل قائمة منطقتها هي.
  const shared = !allowed && pageAllowed(session, pathname);
  const area = shared && session.active ? areaForWorkspace(session.active) : "me";
  return (
    <AreaShell area={area} context={session}>
      {allowed || shared ? <Outlet /> : <NoAccess workspace={session.active} />}
    </AreaShell>
  );
}
