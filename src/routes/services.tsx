import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/services")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/services" + location.searchStr, statusCode: 307 });
  },
});
