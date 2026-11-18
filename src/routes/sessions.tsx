import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/sessions")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/pos/sessions" + location.searchStr, statusCode: 307 });
  },
});
