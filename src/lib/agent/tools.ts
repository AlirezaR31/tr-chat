/**
 * Agent tools — pure data functions the orchestrator composes into turns.
 * Every function is deterministic so outcomes are testable and honest
 * (no fabricated verification: statuses come straight from the dataset).
 */
import { CATALOG, getProduct } from "@/lib/data/catalog";
import { STORES, getStoreStock, STOCK_METHOD } from "@/lib/data/stores";
import type {
  ComparisonData,
  ComparisonEntry,
  ConversationContext,
  Criteria,
  Priority,
  Product,
  ProductCardData,
  StoreCardData,
  UserLocation,
} from "@/lib/types";
import {
  criterionScore,
  makeScoreContext,
  priorityScore,
  type ScoreContext,
} from "@/lib/scoring";
import { haversineKm } from "@/lib/geo";
import { tehranNow } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Product search                                                      */
/* ------------------------------------------------------------------ */

export interface SearchParams {
  budgetMax?: number;
  gender?: string;
  useCase?: string;
  priorities: string[];
}

export function searchProducts(params: SearchParams): Product[] {
  let items = CATALOG.filter((p) => {
    if (params.budgetMax && p.priceFrom > params.budgetMax) return false;
    if (params.gender === "men" && p.gender === "women") return false;
    if (params.gender === "women" && p.gender === "men") return false;
    if (params.useCase === "daily" && !p.useCases.includes("daily")) return false;
    if (params.useCase === "sport" && !p.useCases.includes("sport")) return false;
    return true;
  });

  const ctx = makeScoreContext(items.length ? items : CATALOG);
  const priorities = params.priorities.length ? params.priorities : ["comfort", "price"];
  items = [...items].sort(
    (a, b) =>
      priorityScore(b, priorities as never, ctx) - priorityScore(a, priorities as never, ctx) ||
      a.priceFrom - b.priceFrom
  );
  return items;
}

/** Build ProductCardData with per-user match explanation. */
export function toCardData(
  p: Product,
  params: SearchParams,
  maxScore: number
): ProductCardData {
  const items = CATALOG;
  const ctx = makeScoreContext(items);
  const priorities = (params.priorities.length ? params.priorities : ["comfort", "price"]) as never;
  const raw = priorityScore(p, priorities, ctx);
  // scale within this result set so top item ≈ 95-100
  const matchScore = Math.max(
    35,
    Math.min(99, Math.round((raw / Math.max(maxScore, 1)) * 97))
  );
  const top = params.priorities[0];
  const reason = top
    ? top === "comfort"
      ? p.specs.cushioning >= 4
        ? "کوشینگ قوی و وزن متعادل — مناسب راحتی"
        : "راحتی متوسط؛ بیشتر برای استایل روزمره"
      : top === "price"
        ? "قیمت پایین‌تر از میانگین با کیفیت قابل قبول"
        : top === "durability"
          ? "جنس رویه و کف با دوام بالا"
          : "امتیاز استایل بالا در این مدل"
    : "هماهنگ با ترجیحات شما";
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    image: p.image,
    priceFrom: p.priceFrom,
    specs: p.specs,
    highlights: p.highlights,
    sizes: p.sizes,
    gender: p.gender,
    useCases: p.useCases,
    storeCount: STORES.filter((s) => getStoreStock(s.id, p.id, p.priceFrom)).length,
    matchScore,
    matchReason: reason,
  };
}

/* ------------------------------------------------------------------ */
/* Comparison builder                                                  */
/* ------------------------------------------------------------------ */

export function buildComparison(
  products: Product[],
  priorities: Priority[]
): ComparisonData {
  const ctx: ScoreContext = makeScoreContext(products);
  const entries: ComparisonEntry[] = products.map((p) => {
    const attrs: ComparisonEntry["attributes"] = [
      {
        label: "کوشینگ",
        value: `${["خیلی کم", "کم", "متوسط", "خوب", "عالی"][p.specs.cushioning - 1]}`,
        score: p.specs.cushioning / 5,
      },
      {
        label: "وزن",
        value: `${p.specs.weightGrams.toLocaleString("fa-IR")} گرم`,
        score:
          1 -
          (p.specs.weightGrams - ctx.minWeight) /
            Math.max(ctx.maxWeight - ctx.minWeight, 1),
      },
      {
        label: "قیمت",
        value: `${p.priceFrom.toLocaleString("fa-IR")} تومان`,
        score:
          (ctx.maxPrice - p.priceFrom) / Math.max(ctx.maxPrice - ctx.minPrice, 1),
      },
      {
        label: "دوام",
        value: `${["کم", "متوسط رو به کم", "متوسط", "خوب", "بالا"][p.specs.durability - 1]}`,
        score: p.specs.durability / 5,
      },
      {
        label: "استایل",
        value: `${["ساده", "معمولی", "خوب", "قوی", "ویژه"][p.specs.styleRating - 1]}`,
        score: p.specs.styleRating / 5,
      },
    ];
    const pros: string[] = [];
    const cons: string[] = [];
    if (p.specs.cushioning === Math.max(...products.map((x) => x.specs.cushioning)))
      pros.push("نرم‌ترین کفه بین گزینه‌ها");
    if (p.priceFrom === Math.min(...products.map((x) => x.priceFrom)))
      pros.push("ارزان‌ترین گزینه");
    if (p.specs.weightGrams === Math.min(...products.map((x) => x.specs.weightGrams)))
      pros.push("سبک‌ترین گزینه");
    if (p.specs.styleRating === Math.max(...products.map((x) => x.specs.styleRating)))
      pros.push("قوی‌ترین استایل");
    if (p.specs.cushioning <= 2) cons.push("کفه‌ی صاف؛ برای پیاده‌روی خیلی طولانی مناسب نیست");
    if (p.priceFrom === Math.max(...products.map((x) => x.priceFrom)))
      cons.push("گران‌ترین گزینه لیست");
    if (p.specs.durability <= 3 && products.length > 1) cons.push("دوام در حد متوسط");
    return {
      productId: p.id,
      name: p.name,
      brand: p.brand,
      image: p.image,
      price: p.priceFrom,
      scores: {
        comfort: criterionScore(p, "comfort", ctx),
        price: criterionScore(p, "price", ctx),
        durability: criterionScore(p, "durability", ctx),
        style: criterionScore(p, "style", ctx),
      },
      attributes: attrs,
      pros: pros.length ? pros : ["تعادل قابل قبول بین مشخصات"],
      cons: cons.slice(0, 2),
    };
  });

  const winnerBy = {} as Record<Criteria, string>;
  (["comfort", "price", "durability", "style"] as Criteria[]).forEach((c) => {
    const best = [...entries].sort((a, b) => b.scores[c] - a.scores[c])[0];
    winnerBy[c] = best.productId;
  });

  const FA: Record<string, string> = { comfort: "راحتی", price: "قیمت", durability: "دوام", style: "استایل" };
  const faPrioritiesLabel = priorities.map((p) => FA[p]).join(" و ");

  return {
    entries,
    winnerBy,
    methodology:
      "امتیاز هر معیار فقط از مشخصات فنی اعلام‌شده و قیمت محاسبه شده است؛ بدون امتیازدهی نظرسنجی.",
    contextSummary: priorities.length
      ? `مقایسه با اولویت ${faPrioritiesLabel}`
      : "مقایسه بر اساس مشخصات",
    criteria: priorities[0],
  };
}

/* ------------------------------------------------------------------ */
/* Store discovery                                                     */
/* ------------------------------------------------------------------ */

export function isOpenNow(openHour: number, closeHour: number): boolean {
  const { hour } = tehranNow();
  return hour >= openHour && hour < closeHour;
}

export function findStores(
  productId: string,
  basePrice: number,
  location: UserLocation,
  opts: { installmentOnly?: boolean; openNow?: boolean; confirmedStockOnly?: boolean } = {}
): StoreCardData[] {
  const cards: StoreCardData[] = [];
  for (const s of STORES) {
    const stock = getStoreStock(s.id, productId, basePrice);
    if (!stock) continue;
    if (opts.installmentOnly && !s.installment.verified) continue;
    if (opts.confirmedStockOnly && stock.status !== "confirmed") continue;
    const openNow = isOpenNow(s.openHour, s.closeHour);
    if (opts.openNow && !openNow) continue;
    const distanceKm = haversineKm(location, s);
    cards.push({
      id: s.id,
      name: s.name,
      area: s.area,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      price: stock.price,
      distanceKm,
      openNow,
      hoursLabel: `${s.openHour} تا ${s.closeHour}`,
      stock: {
        status: stock.status,
        verifiedAt: stock.verifiedAt,
        method: STOCK_METHOD[stock.status] ?? null,
      },
      installment: s.installment,
      rating: s.rating,
    });
  }
  return cards;
}

export function sortStores(
  stores: StoreCardData[],
  sort: "price" | "distance" | "stock"
): StoreCardData[] {
  const stockRank = { confirmed: 0, reported: 1, listing_only: 2, unknown: 3 };
  return [...stores].sort((a, b) => {
    if (sort === "price") return a.price - b.price;
    if (sort === "distance") return a.distanceKm - b.distanceKm;
    return (
      stockRank[a.stock.status] - stockRank[b.stock.status] || a.price - b.price
    );
  });
}

/** Next-best alternatives after a failed contact — honest ranking. */
export function alternativeStores(
  excludeStoreId: string,
  productId: string,
  basePrice: number,
  location: UserLocation,
  max = 3
): StoreCardData[] {
  // NOTE: no openNow filter — at night every store is closed, but the user
  // still needs next-best options (cards show open/closed honestly).
  const all = findStores(productId, basePrice, location);
  const stockRank = { confirmed: 0, reported: 1, listing_only: 2, unknown: 3 };
  return all
    .filter((s) => s.id !== excludeStoreId)
    .sort(
      (a, b) =>
        stockRank[a.stock.status] - stockRank[b.stock.status] ||
        a.price - b.price
    )
    .slice(0, max);
}

/* ------------------------------------------------------------------ */
/* Contact simulator — honest by design                                */
/* ------------------------------------------------------------------ */

export interface ContactSimResult {
  kind: "confirmed" | "reported" | "no_answer" | "closed" | "price_changed";
  note: string;
  newPrice?: number;
  waitMs: number;
}

/**
 * The simulator is driven by the store's declared contactScenario.
 * It NEVER claims real verification — every result is labelled
 * "شبیه‌سازی تماس (نمایشی)" in the UI.
 */
export function simulateContact(
  storeId: string,
  productId: string
): ContactSimResult | null {
  const store = STORES.find((s) => s.id === storeId);
  const product = getProduct(productId);
  if (!store || !product) return null;
  const stock = getStoreStock(storeId, productId, product.priceFrom);
  if (!stock) return null;
  const waitMs = 1800 + (storeId.length * 217) % 1200;

  switch (store.contactScenario) {
    case "confirm":
      return {
        kind: stock.status === "confirmed" ? "confirmed" : "reported",
        note:
          stock.status === "confirmed"
            ? "فروشگاه موجودی را تایید کرد. زمان تحویل حضوری: امروز ساعات کاری."
            : "فروشنده گفت موجودی دارد؛ این گزارش به‌صورت مستقل تایید نشده است.",
        waitMs,
      };
    case "no_answer":
      return {
        kind: "no_answer",
        note: "پس از چند زنگ، پاسخی دریافت نشد. گزینه‌های جایگزین را ببین.",
        waitMs,
      };
    case "closed":
      return {
        kind: "closed",
        note: "فروشگاه در حال حاضر بسته است؛ می‌توانی سر ساعت کاری تماس بگیری یا گزینه‌های باز را ببینی.",
        waitMs,
      };
    case "price_changed":
      return {
        kind: "price_changed",
        newPrice: Math.round(stock.price * 1.06 / 10) * 10,
        note: "فروشگاه گفت قیمت به‌روزرسانی شده. قیمت جدید در کارت فروشگاه اعمال شد.",
        waitMs,
      };
  }
}
