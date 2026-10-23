/**
 * Contextual product recommendations for the Smart Shopping Basket.
 *
 * Three kinds, all with a REQUIRED reason:
 *  - complementary:      semantic relation to the added product
 *  - nearby:             dataset-backed availability at a store already on
 *                        the basket's route / same cluster as basket stores
 *  - basket_optimization: a small additional purchase (or store overlap)
 *                        that can save a stop / cost — only when the dataset
 *                        supports the claim
 *
 * Honesty rules (hard):
 *  - availability is ONLY ever populated from the dataset; when null, the UI
 *    must not imply the item is stocked anywhere.
 *  - dismissed products never come back; muted users get nothing.
 *  - no urgency, no upsell pressure: reasons explain relevance, period.
 */
import type {
  ConversationContext,
  Product,
  ProductCardData,
  RecommendationItem,
  StockStatusKind,
} from "@/lib/types";
import { ALL_PRODUCTS } from "@/lib/data/catalog";
import { getStoreStock, STORES, STORE_CLUSTER } from "@/lib/data/stores";
import { haversineKm } from "@/lib/geo";
import { toCardData } from "@/lib/agent/tools";
import { formatTomanShort } from "@/lib/format";
import { resolveCandidates } from "@/lib/basket/basket-view";

const STATUS_RANK: Record<StockStatusKind, number> = {
  confirmed: 0,
  reported: 1,
  listing_only: 2,
  unknown: 3,
};

function availabilityFor(
  productId: string,
  ctx: ConversationContext,
  preferStoreIds: string[] = []
): RecommendationItem["availability"] {
  const product = ALL_PRODUCTS.find((p) => p.id === productId);
  if (!product) return null;
  const cands = resolveCandidates(productId, ctx.contacted);
  if (!cands.length) return null;
  const withMeta = cands.map((c) => {
    const store = STORES.find((s) => s.id === c.storeId)!;
    const dist = ctx.location ? haversineKm(ctx.location, store) : null;
    return { ...c, dist, prefer: preferStoreIds.includes(c.storeId) ? 0 : 1 };
  });
  withMeta.sort(
    (a, b) =>
      a.prefer - b.prefer ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (a.dist ?? 99) - (b.dist ?? 99) ||
      a.price - b.price
  );
  const best = withMeta[0];
  return {
    storeId: best.storeId,
    storeName: best.storeName,
    area: best.area,
    price: best.price,
    stockStatus: best.status,
    distanceKm: best.dist !== null ? Math.round(best.dist * 10) / 10 : null,
  };
}

function toRec(
  kind: RecommendationItem["kind"],
  p: Product,
  ctx: ConversationContext,
  reason: string,
  preferStoreIds: string[] = []
): RecommendationItem {
  const params = {
    budgetMax: ctx.budgetMax,
    gender: ctx.gender,
    useCase: ctx.useCase,
    priorities: ctx.priorities,
  };
  const card: ProductCardData = toCardData(p, params, 100);
  return {
    kind,
    product: card,
    reason,
    availability: availabilityFor(p.id, ctx, preferStoreIds),
  };
}

/* ------------------------------------------------------------------ */
/* Complementary — semantic relation (documented mapping)              */
/* ------------------------------------------------------------------ */

function complementaryFor(added: Product, basketIds: string[]): Array<{ id: string; reason: string }> {
  const out: Array<{ id: string; reason: string }> = [];
  const isSneaker = (added.kind ?? "sneaker") === "sneaker";

  if (isSneaker) {
    if (!basketIds.includes("acc-sport-socks")) {
      out.push({
        id: "acc-sport-socks",
        reason: "جوراب ورزشی مکمل طبیعی هر کتانی است — راحتی و سلامت پا را در استفاده روزمره کامل می‌کند.",
      });
    }
    if (added.specs.cushioning <= 3 && !basketIds.includes("acc-insole")) {
      out.push({
        id: "acc-insole",
        reason: `کوشینگ ${added.name} متوسط است؛ یک کفی ارتوپدیک راحتی آن را واقعا بالا می‌برد.`,
      });
    }
    if ((added.specs.styleRating >= 4 || ["nb530", "vans-classic-canvas"].includes(added.id)) && !basketIds.includes("acc-care-kit")) {
      out.push({
        id: "acc-care-kit",
        reason: "ظاهر تمیز کتانی‌های استایلی‌ش به مراقبت منظم نیاز دارد؛ این کیت همان کار را می‌کند.",
      });
    }
    if (added.useCases.includes("sport") && !basketIds.includes("acc-gym-bag")) {
      out.push({
        id: "acc-gym-bag",
        reason: "چون این مدل را برای ورزش انتخاب کردی، کیف دوشی با محفظه کتانی حملش را راحت می‌کند.",
      });
    }
  } else {
    // accessory added — pair with the natural partner
    if (added.id === "acc-insole" && !basketIds.includes("acc-sport-socks")) {
      out.push({ id: "acc-sport-socks", reason: "کفی و جوراب ورزشی با هم راحتی روزانه را کامل می‌کنند." });
    }
    if (added.id === "acc-sport-socks" && !basketIds.includes("acc-insole")) {
      out.push({ id: "acc-insole", reason: "اگر کفی ارتوپدیک هم اضافه کنی، فشار پا در پیاده‌روی طولانی کمتر می‌شود." });
    }
    if (added.id === "acc-laces" && !basketIds.includes("acc-care-kit")) {
      out.push({ id: "acc-care-kit", reason: "بند نو با یک تمیزکاری کامل، کتانی را مثل روز اول می‌کند." });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main builder                                                        */
/* ------------------------------------------------------------------ */

export function buildRecommendations(
  added: Product,
  ctx: ConversationContext,
  max = 3
): RecommendationItem[] {
  if (ctx.recsMuted) return [];
  const basketIds = ctx.basket.map((b) => b.productId);

  const pool = ALL_PRODUCTS.filter(
    (p) => p.id !== added.id && !basketIds.includes(p.id) && !ctx.dismissedRecs.includes(p.id)
  );
  if (!pool.length) return [];

  const recs: RecommendationItem[] = [];

  /* 1) complementary (semantic) */
  for (const c of complementaryFor(added, basketIds)) {
    const p = pool.find((x) => x.id === c.id);
    if (!p) continue;
    recs.push(toRec("complementary", p, ctx, c.reason));
  }

  /* 2) nearby — dataset-backed availability at basket-route stores / clusters */
  const basketStores: string[] = [];
  for (const it of ctx.basket) {
    for (const c of resolveCandidates(it.productId, ctx.contacted)) {
      if (!basketStores.includes(c.storeId)) basketStores.push(c.storeId);
    }
  }
  if (basketStores.length) {
    const clusters = new Set(basketStores.map((s) => STORE_CLUSTER[s]).filter(Boolean));
    for (const p of pool) {
      if (recs.length >= max) break;
      if (p.kind !== "accessory") continue;
      const cands = resolveCandidates(p.id, ctx.contacted);
      const atBasketStore = cands.find((c) => basketStores.includes(c.storeId));
      const inCluster = cands.find((c) => clusters.has(STORE_CLUSTER[c.storeId]));
      if (atBasketStore) {
        recs.push(
          toRec(
            "nearby",
            p,
            ctx,
            `در «${atBasketStore.storeName}» ثبت شده که فروشگاهی از سبد خرید توست؛ می‌توانی همان‌جا برداری.`,
            basketStores
          )
        );
      } else if (inCluster) {
        const store = STORES.find((s) => s.id === inCluster.storeId)!;
        recs.push(
          toRec(
            "nearby",
            p,
            ctx,
            `در «${store.name}» (${store.area}) موجودی ثبت شده — همان محله‌ای که فروشگاه‌های سبد تو آن‌جاست.`,
            basketStores
          )
        );
      }
    }
  }

  /* 3) basket_optimization — small add that rides an existing planned stop */
  if (ctx.lastPlannedAt && ctx.location && ctx.basket.length) {
    for (const p of pool) {
      if (recs.length >= max) break;
      if (p.kind !== "accessory") continue;
      const cands = resolveCandidates(p.id, ctx.contacted);
      if (!cands.length) continue;
      const cheapest = [...cands].sort((a, b) => a.price - b.price)[0];
      // is the cheapest store already reachable on the user's route?
      const basketStorePts = basketStores.map((sid) => STORES.find((s) => s.id === sid)!).filter(Boolean);
      if (!basketStorePts.length) break;
      const cheapestStore = STORES.find((s) => s.id === cheapest.storeId)!;
      const nearPlanned = basketStorePts.find(
        (s) => haversineKm(s, cheapestStore) <= 1.5 || s.id === cheapest.storeId
      );
      const plannedStore = cands.find((c) => basketStores.includes(c.storeId));
      if (plannedStore) {
        const delta = plannedStore.price - cheapest.price;
        const plannedName = STORES.find((s) => s.id === plannedStore.storeId)!.name;
        if (delta <= Math.max(30_000, cheapest.price * 0.05)) {
          recs.push(
            toRec(
              "basket_optimization",
              p,
              ctx,
              `با خرید از «${plannedName}» که در مسیر سبد توست، ایستگاه اضافی لازم نمی‌شود${
                delta > 0 ? `؛ فقط ${formatTomanShort(delta)} بیشتر` : " و حتی ارزون‌تر است"
              }.`,
              basketStores
            )
          );
        }
      } else if (!nearPlanned) {
        // honest case: relevant item but NOT near the route — semantic only
        recs.push(
          toRec(
            "complementary",
            p,
            ctx,
            `ارزون‌ترین فروشگاه این قلم (${cheapestStore.name}) خارج از مسیر سبد توست؛ اگر بری، ایستگاه جدا می‌شود.`,
          )
        );
      }
    }
  }

  // dedupe by product id (first occurrence wins), cap
  const seen = new Set<string>();
  const out: RecommendationItem[] = [];
  for (const r of recs) {
    if (seen.has(r.product.id)) continue;
    seen.add(r.product.id);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}
