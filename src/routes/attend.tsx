import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/attend")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/me/attend" + location.searchStr, statusCode: 307 });
  },
});
