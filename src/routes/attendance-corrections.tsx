import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/attendance-corrections")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/attendance/corrections" + location.searchStr, statusCode: 307 });
  },
});
