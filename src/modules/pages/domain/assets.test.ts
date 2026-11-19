import { describe, expect, it } from "vitest";
import {
  assertAssetCapacity,
  assertAssetUnused,
  assertOwnedAssets,
  inspectImage,
  referencedAssets,
} from "./assets";
import { pageDocumentSchema } from "../contracts";

const id = "92000000-0000-4000-8000-000000000001";
describe("page image rules", () => {
  it.each([
    [[137, 80, 78, 71, 13, 10, 26, 10], "png", "image/png"],
    [[255, 216, 255], "jpg", "image/jpeg"],
    [[82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], "webp", "image/webp"],
  ])("detects signature %s", (bytes, ext, contentType) => {
    expect(inspectImage(Uint8Array.from(bytes))).toEqual({ ext, contentType });
  });
  it.each([
    [60, 115, 118, 103],
    [82, 73, 70, 70],
    [137, 80, 78, 71],
    [1, 2, 3],
  ])("refuses unsupported/truncated signature %s", (...bytes) => {
    expect(() => inspectImage(Uint8Array.from(bytes))).toThrow("IMAGE_TYPE");
  });
  it("accepts exactly 2 MB, refuses 2 MB + 1", () => {
    const bytes = new Uint8Array(2097152);
    bytes.set([255, 216, 255]);
    expect(inspectImage(bytes).ext).toBe("jpg");
    expect(() => inspectImage(new Uint8Array(2097153))).toThrow("IMAGE_SIZE");
  });
  it("refuses an empty file", () =>
    expect(() => inspectImage(new Uint8Array())).toThrow("IMAGE_SIZE"));
  it("permits the twentieth image but refuses the twenty-first", () => {
    expect(() => assertAssetCapacity(19)).not.toThrow();
    expect(() => assertAssetCapacity(20)).toThrow("ASSET_LIMIT");
  });
  it("refuses a foreign asset id", () => {
    expect(() => assertOwnedAssets([id], [])).toThrow("FOREIGN_ASSET");
    expect(() => assertOwnedAssets([id], [id])).not.toThrow();
  });
  it.each(["logoAssetId", "heroImageAssetId"])("protects %s references", (key) => {
    expect(() => assertAssetUnused(id, [{ blocks: [], [key]: id }])).toThrow("ASSET_IN_USE");
  });
  it("protects hidden gallery references in either draft or published document", () => {
    const document = { blocks: [{ type: "gallery", images: [{ assetId: id }] }] };
    expect(referencedAssets(document)).toEqual([id]);
    expect(() => assertAssetUnused(id, [{ blocks: [] }, document])).toThrow("ASSET_IN_USE");
  });
  it("allows six gallery images and refuses seven", () => {
    const image = { assetId: id, alt: { ar: "", en: "" } };
    const block = { id, type: "gallery", hidden: false, images: Array(6).fill(image) };
    expect(pageDocumentSchema.safeParse({ blocks: [block] }).success).toBe(true);
    expect(
      pageDocumentSchema.safeParse({ blocks: [{ ...block, images: [...block.images, image] }] })
        .success,
    ).toBe(false);
  });
});
