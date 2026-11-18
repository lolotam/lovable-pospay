import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/cards")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/staff/cards" + location.searchStr, statusCode: 307 });
  },
});
