import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/reception/cards")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/pos/cards" + location.searchStr, statusCode: 307 });
  },
});
