/**
 * GET /api/products/:id/offers?limit=5 — parity with TorobYar
 * get_product_offers: price-sorted offer rows with honesty flags.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProductOffers } from "@/server/services/shop-service";
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
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 5);
  const offers = getProductOffers(id, Number.isFinite(limit) ? limit : 5);
  return NextResponse.json({
    product_id: product.id,
    product_title: product.name,
    count: offers.length,
    results: offers,
    price_is_live: false,
    note: "قیمت‌ها ثبت‌شده‌اند و ممکن است قدیمی باشند؛ موجودی حضوری را باید با فروشگاه تایید کرد.",
  });
}
