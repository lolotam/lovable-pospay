import type { SaveServiceInput, ServiceCatalogDto } from "../contracts";
import type { CatalogReader, CatalogWriter } from "../ports/catalog-repository";
import { servicePrice } from "./service-price";

export async function loadCatalog(repo: CatalogReader): Promise<ServiceCatalogDto> {
  const access = await repo.access();
  if (!access?.member) throw new Error("FORBIDDEN");
  const catalog = await repo.read();
  return {
    canManage: access.manager,
    services: catalog.services.map(({ id, name, priceMills, version, staffIds }) => ({
      id,
      name,
      priceMills: priceMills.toString(),
      version,
      staffIds,
    })),
    staff: catalog.staff.map(({ id, name }) => ({ id, name })),
  };
}

export async function saveService(repo: CatalogWriter, input: SaveServiceInput) {
  if (!(await repo.canManage())) throw new Error("FORBIDDEN");

  const details = {
    name: input.name,
    priceMills: servicePrice(input.price),
    staffIds: [...new Set(input.staffIds.map((id) => id.toLowerCase()))],
  };
  const previous = input.id ? await repo.lock(input.id) : undefined;
  if (input.id && (!previous || previous.version !== input.version))
    throw new Error("SERVICE_CONFLICT");

  const requestId = input.requestId?.toLowerCase();
  let id = input.id;
  if (id) {
    await repo.update(id, details);
  } else {
    id = (await repo.create(details, requestId)) ?? undefined;
    if (!id) {
      if (!requestId || !(await repo.matchesCreation(requestId, details)))
        throw new Error("SERVICE_REQUEST_CONFLICT");
      return { id: requestId };
    }
  }

  if (!(await repo.replaceAssignments(id, details.staffIds))) throw new Error("FORBIDDEN");
  await repo.audit(id, previous ?? null, details);
  return { id };
}
