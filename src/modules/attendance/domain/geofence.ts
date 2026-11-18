/** إحداثيات جغرافية بالدرجات. */
export interface GeoPoint {
  /** خط العرض. */
  latitude: number;
  /** خط الطول. */
  longitude: number;
}

/** سبب الاستثناء عند المسح: بدون موقع أو خارج النطاق (D-12). */
export type LocationException = "no_location" | "outside_geofence";

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * يحسب المسافة بالمتر بين نقطتين بمعادلة هافرساين.
 * @returns المسافة بالمتر
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * يحدد هل المسح داخل نطاق الفرع، ويُرجع سبب الاستثناء لو لا. خارج النطاق لا يُرفض أبداً.
 * @param scan موقع الموظفة، أو null لو الموقع غير متاح
 * @param branch موقع الفرع
 * @param radiusMeters نصف قطر النطاق (الافتراضي 150 متر)
 * @returns null لو داخل النطاق، وإلا سبب الاستثناء
 */
export function locationException(
  scan: GeoPoint | null,
  branch: GeoPoint | null,
  radiusMeters: number,
): LocationException | null {
  if (!scan) return "no_location";
  if (!branch) return "outside_geofence";
  return distanceMeters(scan, branch) <= radiusMeters ? null : "outside_geofence";
}
