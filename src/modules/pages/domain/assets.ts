/** يتحقق من حجم الصورة وتوقيع الملف بدلاً من الثقة في نوع المتصفح. */
export function inspectImage(bytes: Uint8Array): { ext: string; contentType: string } {
  if (!bytes.length || bytes.length > 2097152) throw new Error("IMAGE_SIZE");
  const starts = (values: number[]) => values.every((v, i) => bytes[i] === v);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return { ext: "png", contentType: "image/png" };
  if (starts([255, 216, 255])) return { ext: "jpg", contentType: "image/jpeg" };
  if (
    bytes.length >= 12 &&
    starts([82, 73, 70, 70]) &&
    [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v)
  )
    return { ext: "webp", contentType: "image/webp" };
  throw new Error("IMAGE_TYPE");
}
/** الحد الأعلى عشرون صورة لكل شركة. */
export function assertAssetCapacity(count: number): void {
  if (count >= 20) throw new Error("ASSET_LIMIT");
}
interface AssetDocument {
  logoAssetId?: string | null | undefined;
  heroImageAssetId?: string | null | undefined;
  blocks: Array<{ type: string; images?: Array<{ assetId: string }> }>;
}
/** يجمع مراجع الصور بما فيها البلوكات المخفية لحماية المسودة. */
export function referencedAssets(doc: AssetDocument): string[] {
  return [
    ...new Set(
      [
        doc.logoAssetId,
        doc.heroImageAssetId,
        ...doc.blocks.flatMap((b) =>
          b.type === "gallery" ? (b.images ?? []).map((i) => i.assetId) : [],
        ),
      ].filter((id): id is string => typeof id === "string"),
    ),
  ];
}
/** يرفض صور الشركات الأخرى أو الصور المحذوفة. */
export function assertOwnedAssets(ids: string[], ownedIds: string[]): void {
  if (ids.some((id) => !ownedIds.includes(id))) throw new Error("FOREIGN_ASSET");
}
/** يمنع حذف صورة مستخدمة في المسودة أو النسخة المنشورة. */
export function assertAssetUnused(id: string, documents: AssetDocument[]): void {
  if (documents.some((doc) => referencedAssets(doc).includes(id))) throw new Error("ASSET_IN_USE");
}
