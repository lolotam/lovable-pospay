import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/reception/qr")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/pos/qr" + location.searchStr, statusCode: 307 });
  },
});
