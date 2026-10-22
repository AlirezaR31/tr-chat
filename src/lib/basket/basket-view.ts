/**
 * Basket view builder — resolves every basket line against the dataset
 * (prices, stock confidence, store availability) into a renderable view.
 * Server-side only; the client receives the resolved view, never the matrix.
 */
import type {
  AssignmentConfidence,
  BasketItem,
  BasketItemView,
  BasketOptimizeMode,
  BasketView,
  ContactOutcome,
  StockStatusKind,
  TransportMode,
} from "@/lib/types";
import { getProduct } from "@/lib/data/catalog";
import { getStoreStock, STORES } from "@/lib/data/stores";
import { tehranNow } from "@/lib/format";

const STATUS_RANK: Record<StockStatusKind, number> = {
  confirmed: 0,
  reported: 1,
  listing_only: 2,
  unknown: 3,
};

interface ResolvedCand {
  storeId: string;
  storeName: string;
  area: string;
  price: number;
  status: StockStatusKind;
  openNow: boolean;
}

export function resolveCandidates(
  productId: string,
  contacted: Record<string, ContactOutcome> = {}
): ResolvedCand[] {
  const product = getProduct(productId);
  if (!product) return [];
  const out: ResolvedCand[] = [];
  for (const s of STORES) {
    const stock = getStoreStock(s.id, productId, product.priceFrom);
    if (!stock) continue;
    let price = stock.price;
    const c = contacted[s.id];
    if (c?.kind === "price_changed" && c.newPrice) price = c.newPrice;
    out.push({
      storeId: s.id,
      storeName: s.name,
      area: s.area,
      price,
      status: stock.status,
      openNow: isOpenNowSafe(s.openHour, s.closeHour),
    });
  }
  return out;
}

function isOpenNowSafe(open: number, close: number): boolean {
  const { hour } = tehranNow();
  return hour >= open && hour < close;
}

/** Pick the per-item "best" store: most confident stock, then cheapest. */
function pickBestStore(cands: ResolvedCand[]): ResolvedCand | undefined {
  if (!cands.length) return undefined;
  return [...cands].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.price - b.price
  )[0];
}

export function buildBasketView(
  basket: BasketItem[],
  opts: {
    optimizeMode: BasketOptimizeMode;
    transport: TransportMode;
    hasRoute: boolean;
    lastPlannedAt?: number;
    contacted?: Record<string, ContactOutcome>;
  }
): BasketView {
  const items: BasketItemView[] = [];
  let estimatedTotal = 0;
  let savingsVsMax = 0;

  for (const it of basket) {
    const p = getProduct(it.productId);
    if (!p) continue;
    const cands = resolveCandidates(it.productId, opts.contacted);
    const best = pickBestStore(cands);
    const bestPrice = cands.length ? Math.min(...cands.map((c) => c.price)) : p.priceFrom;
    const maxPrice = cands.length ? Math.max(...cands.map((c) => c.price)) : p.priceFrom;
    const chosen = best?.price ?? bestPrice;

    let note: string | undefined;
    if (cands.length === 0) {
      note = "در فروشگاه‌های داده فعلی ثبت نشده";
    } else if (cands.length === 1) {
      note = "فقط در ۱ فروشگاه ثبت شده";
    } else if (best && best.status !== "confirmed") {
      note = "موجودی تاییدشده نیست";
    }
    if (it.targetPrice && chosen > it.targetPrice && !note) {
      note = "بالاتر از قیمت هدف شما";
    }

    const confidence: AssignmentConfidence = best ? best.status : "unassigned";
    items.push({
      productId: it.productId,
      name: p.name,
      brand: p.brand,
      model: p.model,
      image: p.image,
      kind: p.kind ?? "sneaker",
      categoryFa: p.categoryFa,
      quantity: it.quantity,
      variant: it.variant,
      targetPrice: it.targetPrice,
      bestPrice,
      assignment: best
        ? {
            storeId: best.storeId,
            storeName: best.storeName,
            area: best.area,
            price: best.price,
            confidence,
            openNow: best.openNow,
          }
        : null,
      storeCount: cands.length,
      note,
    });

    estimatedTotal += chosen * it.quantity;
    savingsVsMax += Math.max(maxPrice - chosen, 0) * it.quantity;
  }

  return {
    items,
    estimatedTotal,
    savingsVsMax,
    optimizeMode: opts.optimizeMode,
    transport: opts.transport,
    hasRoute: opts.hasRoute,
    lastPlannedAt: opts.lastPlannedAt,
  };
}
