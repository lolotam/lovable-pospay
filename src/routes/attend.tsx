import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/attend")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/attend"] + location.searchStr,
      statusCode: 307,
    });
  },
});
