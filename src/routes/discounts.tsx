import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/discounts")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/services/discounts" + location.searchStr, statusCode: 307 });
  },
});
