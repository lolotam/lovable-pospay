import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/attendance-questions")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/app/attendance/questions" + location.searchStr, statusCode: 307 });
  },
});
