/**
 * GET /api/products/:id/payment-shops?limit=6 — parity with TorobYar
 * find_payment_shops: declared in-person installment options.
 * Declaration ≠ guaranteed eligibility (note is attached).
 */
import { NextRequest, NextResponse } from "next/server";
import { getInstallmentOffers, SHOP_SERVICE_NOTE } from "@/server/services/shop-service";
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
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 6);
  const offers = getInstallmentOffers(id, Number.isFinite(limit) ? limit : 6);
  return NextResponse.json({
    product_id: product.id,
    product_title: product.name,
    channel_filter: "in_person",
    payment_channel_status: "in_person_declared",
    count: offers.length,
    results: offers,
    price_is_live: false,
    note: SHOP_SERVICE_NOTE,
  });
}
