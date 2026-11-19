import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saveMemberOverridesFn } from "@/modules/permissions";
import { PermissionsPage } from "@/modules/permissions/ui/permissions-page";
import { memberPermissionsQuery } from "@/modules/permissions/ui/permission-admin-query";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { t } from "@/i18n";

export const Route = createFileRoute("/app/permissions")({
  beforeLoad: ({ context }) => {
    const active = context.session.active;
    if (active?.kind !== "company" || active.role !== "owner") throw redirect({ to: "/app" });
    return { permissionCompanyId: active.companyId };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(memberPermissionsQuery(context.permissionCompanyId)),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("permissionAdmin.title")} — PosPay` },
      { name: "description", content: t("permissionAdmin.description") },
      { property: "og:title", content: `${t("permissionAdmin.title")} — PosPay` },
      { property: "og:description", content: t("permissionAdmin.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerPermissions,
});
function OwnerPermissions() {
  const { permissionCompanyId, session } = Route.useRouteContext();
  const cache = useQueryClient();
  const query = memberPermissionsQuery(permissionCompanyId);
  const { data: members } = useSuspenseQuery(query);
  const save = useServerFn(saveMemberOverridesFn);
  return (
    <PermissionsPage
      key={permissionCompanyId}
      companyId={permissionCompanyId}
      actorId={session.user.id}
      members={members}
      save={async (input) => {
        const updated = await save({ data: input });
        cache.setQueryData(query.queryKey, (old) =>
          old?.map((member) => (member.userId === updated.userId ? updated : member)),
        );
        return updated;
      }}
      refresh={() => cache.invalidateQueries({ queryKey: query.queryKey }, { throwOnError: true })}
    />
  );
}
