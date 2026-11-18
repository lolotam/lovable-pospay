import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/sessions")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/sessions"] + location.searchStr,
      statusCode: 307,
    });
  },
});
