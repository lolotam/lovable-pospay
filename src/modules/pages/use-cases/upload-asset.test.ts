import { expect, it, vi } from "vitest";
import { deleteAsset, uploadAsset } from "./upload-asset";
import type { AssetRepository, AssetStorage } from "../ports/asset-repository";
const input = { companyId: "company-a", id: "asset-a", bytes: Uint8Array.from([255, 216, 255]), alt: { ar: "", en: "" } };
function setup() {
  const repo: AssetRepository = { lock: vi.fn(async () => {}), isOwner: async () => true, list: async () => [], insert: vi.fn(async () => {}), remove: vi.fn(async () => "companies/company-a/pages/asset-a.jpg") };
  const storage: AssetStorage = { putObject: vi.fn(async () => {}), deleteObject: vi.fn(async () => {}) };
  return { repo, storage };
}
it("chooses the company key and stores detected type, not caller MIME", async () => {
  const { repo, storage } = setup();
  const result = await uploadAsset(repo, storage, input);
  expect(result.key).toBe("companies/company-a/pages/asset-a.jpg");
  expect(repo.insert).toHaveBeenCalledWith({ id: "asset-a", contentType: "image/jpeg", byteSize: 3, alt: input.alt }, result.key);
  expect(storage.putObject).toHaveBeenCalledWith(result.key, input.bytes, "image/jpeg");
});
it("rejects non-owners before storage calls", async () => {
  const { repo, storage } = setup();
  repo.isOwner = async () => false;
  await expect(uploadAsset(repo, storage, input)).rejects.toThrow("FORBIDDEN");
  await expect(deleteAsset(repo, storage, input.id)).rejects.toThrow("FORBIDDEN");
  expect(storage.putObject).not.toHaveBeenCalled();
  expect(repo.remove).not.toHaveBeenCalled();
});
it("refuses image 21 before upload", async () => {
  const { repo, storage } = setup();
  repo.list = async () => Array(20).fill({ id: "asset" });
  await expect(uploadAsset(repo, storage, input)).rejects.toThrow("ASSET_LIMIT");
  expect(storage.putObject).not.toHaveBeenCalled();
});
it("compensates a failed metadata insert by deleting the uploaded object", async () => {
  const { repo, storage } = setup();
  repo.insert = async () => { throw new Error("INSERT_FAILED"); };
  await expect(uploadAsset(repo, storage, input)).rejects.toThrow("INSERT_FAILED");
  expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith("companies/company-a/pages/asset-a.jpg");
});
it("does not delete storage if the asset is in use", async () => {
  const { repo, storage } = setup();
  repo.remove = async () => { throw new Error("ASSET_IN_USE"); };
  await expect(deleteAsset(repo, storage, input.id)).rejects.toThrow("ASSET_IN_USE");
  expect(storage.deleteObject).not.toHaveBeenCalled();
});