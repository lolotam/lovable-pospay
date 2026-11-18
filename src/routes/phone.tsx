import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/phone")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/me/phone" + location.searchStr, statusCode: 307 });
  },
});
