import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/services")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/services"] + location.searchStr,
      statusCode: 307,
    });
  },
});
