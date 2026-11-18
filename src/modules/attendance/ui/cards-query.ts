import { queryOptions } from "@tanstack/react-query";
import { getCardsFn } from "../functions/card.functions";

export const cardQuery = (companyId: string, userId: string) =>
  queryOptions({
    queryKey: ["cards", userId, companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return {
          value: await getCardsFn({ data: { companyId, expectedUserId: userId } }),
          error: null,
        };
      } catch (error) {
        return {
          value: null,
          error:
            error instanceof Error && error.message === "FORBIDDEN"
              ? ("ops.denied" as const)
              : ("ops.forbidden" as const),
        };
      }
    },
  });
