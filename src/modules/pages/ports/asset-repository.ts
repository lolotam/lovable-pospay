/** بيانات الصورة الآمنة التي تظهر للمالك دون مفتاح التخزين. */
export interface PageAsset { id: string; contentType: string; byteSize: number; alt: { ar: string; en: string }; }
/** منفذ صور الشركة؛ التنسيق والحماية في معاملة واحدة. */
export interface AssetRepository {
  lock(): Promise<void>;
  isOwner(): Promise<boolean>;
  list(): Promise<PageAsset[]>;
  insert(asset: PageAsset, key: string): Promise<void>;
  remove(id: string): Promise<string>;
}
/** منفذ التخزين الخارجي للصور. */
export interface AssetStorage {
  putObject(key: string, bytes: Uint8Array, contentType: string): Promise<unknown>;
  deleteObject(key: string): Promise<unknown>;
}
