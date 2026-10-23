/**
 * REST API — parity with TorobYar `app/api/routes/products.py`.
 *
 *   GET /api/products/search?q=کتانی+راحتی&limit=5&budget=4000000&gender=men&use_case=sport
 */
import { NextRequest, NextResponse } from "next/server";
import { searchProductsByText } from "@/server/services/product-service";
import { SERVER_CONFIG } from "@/server/core/config";
import type { Gender, Priority } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json(
      { error: "invalid_request", message: "پارامتر q الزامی است" },
      { status: 400 }
    );
  }
  const limit = Number(sp.get("limit") ?? SERVER_CONFIG.search.defaultLimit);
  const budget = Number(sp.get("budget") ?? 0) || undefined;
  const gender = sp.get("gender") as Gender | null;
  const useCase = sp.get("use_case") ?? undefined;
  const priorities = (sp.get("priorities") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Priority => ["comfort", "price", "durability", "style"].includes(p));

  const res = searchProductsByText({
    query: q,
    limit: Number.isFinite(limit) ? limit : SERVER_CONFIG.search.defaultLimit,
    budgetMax: budget,
    ...(gender && ["men", "women", "unisex"].includes(gender) ? { gender } : {}),
    ...(useCase === "daily" || useCase === "sport" ? { useCase } : {}),
    ...(priorities.length ? { priorities } : {}),
    includeAccessories: sp.get("include_accessories") === "1",
  });

  return NextResponse.json({
    query: res.query,
    search_mode: res.searchMode,
    count: res.count,
    total_matches: res.totalMatches,
    results: res.results.map(({ product, matchScore }) => ({
      product_id: product.id,
      name: product.name,
      brand: product.brand,
      model: product.model,
      image: product.image,
      price_from_toman: product.priceFrom,
      kind: product.kind ?? "sneaker",
      match_score: matchScore,
      price_is_live: false,
    })),
  });
}
