import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/team")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/staff/team" + location.searchStr, statusCode: 307 });
  },
});
