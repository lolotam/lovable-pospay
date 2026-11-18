import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/attendance-questions")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/attendance-questions"] + location.searchStr,
      statusCode: 307,
    });
  },
});
