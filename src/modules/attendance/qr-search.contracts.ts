import { z } from "zod";

export const receptionQrSearchSchema = z.object({
  branch: z.string().uuid().optional().catch(undefined),
});
