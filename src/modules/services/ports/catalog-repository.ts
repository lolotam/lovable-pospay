import type { ServiceCatalogDto } from "../contracts";

export interface CatalogDetails {
  name: string;
  priceMills: string;
  staffIds: string[];
}

export interface CatalogSnapshot {
  name: string;
  price_mills: string;
  version: number;
}

export interface CatalogReader {
  access(): Promise<{ member: boolean; manager: boolean } | undefined>;
  read(): Promise<Omit<ServiceCatalogDto, "canManage">>;
}

export interface CatalogWriter {
  canManage(): Promise<boolean>;
  lock(id: string): Promise<CatalogSnapshot | undefined>;
  update(id: string, details: CatalogDetails): Promise<void>;
  create(details: CatalogDetails, requestId?: string): Promise<string | null>;
  matchesCreation(id: string, details: CatalogDetails): Promise<boolean>;
  replaceAssignments(id: string, staffIds: string[]): Promise<boolean>;
  audit(id: string, previous: CatalogSnapshot | null, details: CatalogDetails): Promise<void>;
}
