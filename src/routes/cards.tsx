import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/cards")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/cards"] + location.searchStr,
      statusCode: 307,
    });
  },
});
