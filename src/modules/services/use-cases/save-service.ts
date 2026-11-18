import type { z } from "zod";
import type { saveServiceInput, ServiceCatalogDto } from "../contracts";
import type { CatalogReader, CatalogWriter } from "../ports/catalog-repository";
import { servicePrice } from "./service-price";

export async function loadCatalog(repo: CatalogReader): Promise<ServiceCatalogDto> {
  const access = await repo.access();
  if (!access?.member) throw new Error("FORBIDDEN");
  return { ...(await repo.read()), canManage: access.manager };
}

export async function saveService(repo: CatalogWriter, input: z.infer<typeof saveServiceInput>) {
  if (!(await repo.canManage())) throw new Error("FORBIDDEN");

  const details = {
    name: input.name,
    priceMills: servicePrice(input.price).toString(),
    staffIds: [...new Set(input.staffIds)],
  };
  const previous = input.id ? await repo.lock(input.id) : undefined;
  if (input.id && (!previous || previous.version !== input.version))
    throw new Error("SERVICE_CONFLICT");

  let id = input.id;
  if (id) {
    await repo.update(id, details);
  } else {
    id = (await repo.create(details, input.requestId)) ?? undefined;
    if (!id) {
      if (!input.requestId || !(await repo.matchesCreation(input.requestId, details)))
        throw new Error("SERVICE_REQUEST_CONFLICT");
      return { id: input.requestId };
    }
  }

  if (!(await repo.replaceAssignments(id, details.staffIds))) throw new Error("FORBIDDEN");
  await repo.audit(id, previous ?? null, details);
  return { id };
}
