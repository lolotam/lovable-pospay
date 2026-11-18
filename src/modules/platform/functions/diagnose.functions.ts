import { createServerFn } from "@tanstack/react-start";
import { diagnoseSchema, type DiagnosisDto } from "../contracts";

/** يشخّص رسالة خطأ أو سجل موصل بالنموذج الافتراضي المختار (للمشرف الأعلى فقط). */
export const diagnoseFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => diagnoseSchema.parse(v))
  .handler(async ({ data }): Promise<DiagnosisDto> => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const store = await import("../persistence/credentials.server");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      await store.requireSuperAdmin(db);
      const { defaultProvider, defaultModel } = await store.listStatus(db);
      if (!defaultProvider || !defaultModel) throw new Error("NO_DEFAULT_AI");
      const { DIAGNOSIS_SYSTEM_PROMPT, redactSecrets } = await import("../domain/diagnosis");
      const { callConnector } = await import("../persistence/ai-call.server");
      const answer = await callConnector(
        db,
        userId,
        defaultProvider,
        defaultModel,
        DIAGNOSIS_SYSTEM_PROMPT,
        redactSecrets(data.text),
      );
      await store.audit(db, userId, "diagnosis.run", defaultProvider);
      return { provider: defaultProvider, model: defaultModel, answer: answer.slice(0, 12_000) };
    });
  });
