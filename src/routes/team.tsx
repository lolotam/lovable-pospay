import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/team")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/team"] + location.searchStr,
      statusCode: 307,
    });
  },
});
