/** Geo helpers: real haversine distance + linear projection for the schematic map. */
import type { GeoPoint } from "./types";

const EARTH_R = 6371; // km

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const faDigits = (s: string | number) =>
  String(s).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

/** Great-circle distance in km — real calculation on provided coordinates. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${faDigits(Math.round(km * 1000))} متر`;
  return `${faDigits(km.toFixed(km < 10 ? 1 : 0).replace(".", "٫"))} کیلومتر`;
}

/**
 * Equirectangular projection normalized to a padded 0..100 box (y flipped so
 * north is up). Used by the schematic StoreMap to place pins from real
 * lat/lng — deterministic and dependency-free.
 */
export function projectBounds(
  points: GeoPoint[],
  width = 100,
  height = 100,
  pad = 12
): { project: (p: GeoPoint) => { x: number; y: number }; bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } } {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // average latitude for x-scale correction (Tehran ~35.7N)
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanLng = Math.max(maxLng - minLng, 1e-4);
  const spanLat = Math.max(maxLat - minLat, 1e-4);
  // fit into (width-2pad, height-2pad) preserving aspect
  const drawW = width - pad * 2;
  const drawH = height - pad * 2;
  const scaleX = drawW / (spanLng * cosLat);
  const scaleY = drawH / spanLat;
  const scale = Math.min(scaleX, scaleY);
  const project = (p: GeoPoint) => {
    const x =
      width / 2 +
      ((p.lng - (minLng + maxLng) / 2) * cosLat * scale);
    const y =
      height / 2 -
      (p.lat - (minLat + maxLat) / 2) * scale;
    return { x, y };
  };
  return {
    project,
    bounds: { minLat, maxLat, minLng, maxLng },
  };
}
