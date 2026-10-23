/**
 * GET /api/products/:id/nearby?lat=&lng=&radius=5 — parity with TorobYar
 * find_nearby_product_shops. Straight-line haversine distance, disclosed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getNearbyOffers } from "@/server/services/shop-service";
import { dataset } from "@/server/repositories/dataset";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = dataset.product(id);
  if (!product) {
    return NextResponse.json(
      { error: "product_not_found", count: 0, results: [] },
      { status: 404 }
    );
  }
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radius = Number(sp.get("radius") ?? 5);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "invalid_request", message: "lat و lng الزامی است" },
      { status: 400 }
    );
  }
  const offers = getNearbyOffers(id, { lat, lng }, Number.isFinite(radius) ? radius : 5);
  return NextResponse.json({
    product_id: product.id,
    product_title: product.name,
    radius_km: radius,
    count: offers.length,
    results: offers,
    distance_type: "straight_line",
    price_is_live: false,
  });
}
