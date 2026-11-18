import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEGACY_PATHS } from "@/modules/permissions";
export const Route = createFileRoute("/reception/qr")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: LEGACY_PATHS["/reception/qr"] + location.searchStr,
      statusCode: 307,
    });
  },
});
