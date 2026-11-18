import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/reports")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/attendance/reports" + location.searchStr, statusCode: 307 });
  },
});
