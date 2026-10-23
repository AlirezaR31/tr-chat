/**
 * Product service — mirrors TorobYar `app/services/product_service.py`.
 *
 * Adopts its weighted Persian text search verbatim in spirit:
 *   - aggressive Persian normalization (ي/ك/ۀ/ة/أ, tatweel, diacritics, ZWNJ)
 *   - colloquial token aliases (کتونی↔کفش ورزشی, ارزون↔ارزان, …)
 *   - stop-word stripping + price-phrase removal
 *   - field weights: name 5 / category 3 / tags-specs 2 / brand 2 / model 1
 *   - full-phrase bonus, min-matched-terms threshold, relaxed fallback
 *
 * On top of that it composes our structured filters (budget / gender /
 * use-case / accessories) and the explainable priority scoring.
 */
import { makeScoreContext, priorityScore } from "@/lib/scoring";
import type { Gender, Priority, Product, UseCase } from "@/lib/types";
import { dataset } from "@/server/repositories/dataset";

/* --------------------------- normalization --------------------------- */

export function normalizeFa(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/ـ/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200c/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "میخوام", "میخواهم", "می خوام", "می‌خواهم", "میخری", "میخرم",
  "لطفا", "لطفاً", "یه", "یک", "برای", "با", "از", "تا", "توی",
  "در", "رو", "را", "من", "قیمت", "حدود", "حداکثر", "زیر",
  "مناسب", "میخوامش", "چیزی", "دوست", "دخترم", "داداشم",
  "بده", "بگیر", "پیدا", "کن", "بکن", "چی", "کدوم", "بهترین",
]);

/** Colloquial → canonical token pairs (extended TorobYar TOKEN_ALIASES). */
const TOKEN_ALIASES: Record<string, string[]> = {
  "مردونه": ["مردانه", "مردونه"],
  "مردانه": ["مردانه", "مردونه"],
  "زنونه": ["زنانه", "زنونه"],
  "زنانه": ["زنانه", "زنونه"],
  "کتونی": ["کتانی", "کتونی", "کفش ورزشی", "اسنیکر"],
  "کتانی": ["کتانی", "کتونی", "کفش ورزشی", "اسنیکر"],
  "کدونی": ["کتانی", "کتونی"],
  "اسنیکر": ["اسنیکر", "کتانی", "کتونی"],
  "اسپرت": ["اسپرت", "ورزشی"],
  "ورزشی": ["ورزشی", "اسپرت"],
  "ارزون": ["ارزان", "ارزون", "اقتصادی"],
  "ارزان": ["ارزان", "ارزون", "اقتصادی"],
  "باکیفیت": ["با کیفیت", "باکیفیت", "دوام"],
  "شیک": ["استایل", "شیک", "زیبا"],
  "قشنگ": ["استایل", "قشنگ", "زیبا", "شیک"],
  "پیاده روی": ["پیاده روی", "روزمره", "روزانه"],
  "دویدن": ["دویدن", "ورزش", "دو"],
  "بچگونه": ["بچگانه", "بچگونه"],
  "گوشی": ["موبایل", "گوشی"],
};

/** Pre-computed searchable index row. */
interface IndexedProduct {
  product: Product;
  fields: { text: string; weight: number }[];
}

const INDEX: IndexedProduct[] = dataset.products().map((product) => ({
  product,
  fields: [
    { text: normalizeFa(`${product.name} ${product.model} ${product.brand}`), weight: 5 },
    { text: normalizeFa(product.categoryFa ?? (product.kind === "accessory" ? "لوازم جانبی کتانی" : "کتانی کفش")), weight: 3 },
    { text: normalizeFa([...product.highlights, ...product.useCases, product.gender === "men" ? "مردانه" : product.gender === "women" ? "زنانه" : "یونیسکس", product.sizes].join(" ")), weight: 2 },
    { text: normalizeFa(product.brand), weight: 2 },
    { text: normalizeFa(product.model), weight: 1 },
  ],
}));

/** Strip budget phrases («زیر ۴ میلیون تومان») then split to search tokens. */
export function cleanSearchQuery(query: string): string[] {
  const text = normalizeFa(query).replace(
    /(تا|زیر|کمتر از|حداکثر|حدود|بودجه)?\s*[\d۰-۹0-9,.]+\s*(میلیون|ملیون|هزار)?\s*(تومان|تومن)?/g,
    " "
  );
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^[\d.,]+$/.test(token));
}

export interface TextSearchParams {
  query: string;
  limit?: number;
  budgetMax?: number;
  gender?: Gender;
  useCase?: UseCase;
  priorities?: Priority[];
  includeAccessories?: boolean;
}

export interface TextSearchResult {
  query: string;
  count: number;
  totalMatches: number;
  /** "ranked" = enough distinct terms matched; "relaxed" = fallback ≥1 term */
  searchMode: "ranked" | "relaxed" | "no_results";
  results: Array<{ product: Product; matchScore: number }>;
}

/**
 * Weighted Persian text search over the dataset (TorobYar algorithm).
 * Structured filters apply AFTER text ranking so a colloquial query like
 * «کتونی مردونه ارزون برای دویدن» still resolves its tokens correctly.
 */
export function searchProductsByText(params: TextSearchParams): TextSearchResult {
  const query = String(params.query ?? "").trim();
  const limit = Math.max(1, Math.min(params.limit ?? 6, 20));

  if (!query) {
    return { query, count: 0, totalMatches: 0, searchMode: "no_results", results: [] };
  }

  const tokens = cleanSearchQuery(query);
  if (!tokens.length) {
    return { query, count: 0, totalMatches: 0, searchMode: "no_results", results: [] };
  }

  const normalizedPhrase = normalizeFa(query);

  // score every indexed product across weighted fields with alias expansion
  const scored = INDEX.map(({ product, fields }) => {
    let score = 0;
    let matchedTerms = 0;
    for (const token of tokens) {
      const aliases = TOKEN_ALIASES[token] ?? [token];
      let termMatched = false;
      for (const field of fields) {
        const hit = aliases.some((alias) => field.text.includes(normalizeFa(alias)));
        if (hit) {
          score += field.weight;
          termMatched = true;
        }
      }
      if (termMatched) matchedTerms += 1;
    }
    if (fields[0].text.includes(normalizedPhrase)) score += 5; // full-phrase bonus
    return { product, score, matchedTerms };
  });

  const minimumMatches = Math.max(1, tokens.length - 1);
  let pool = scored.filter((row) => row.matchedTerms >= minimumMatches && row.score > 0);
  let searchMode: TextSearchResult["searchMode"] = "ranked";

  if (!pool.length) {
    pool = scored.filter((row) => row.matchedTerms >= 1);
    searchMode = "relaxed";
  }
  if (!pool.length) {
    return { query, count: 0, totalMatches: 0, searchMode: "no_results", results: [] };
  }

  pool.sort((a, b) => b.score - a.score || b.matchedTerms - a.matchedTerms || a.product.priceFrom - b.product.priceFrom);
  const totalMatches = pool.length;

  // structured filters (never fabricate: unmatched products are dropped honestly)
  const filtered = pool.filter(({ product }) => {
    if (!params.includeAccessories && product.kind === "accessory") return false;
    if (params.budgetMax && product.priceFrom > params.budgetMax) return false;
    if (params.gender === "men" && product.gender === "women") return false;
    if (params.gender === "women" && product.gender === "men") return false;
    if (params.useCase === "daily" && !product.useCases.includes("daily")) return false;
    if (params.useCase === "sport" && !product.useCases.includes("sport")) return false;
    return true;
  });

  // explainable re-ranking by declared priorities when provided
  let rows = filtered;
  if (params.priorities?.length) {
    const priorities = params.priorities as never;
    const ctx = makeScoreContext(rows.map((r) => r.product));
    rows = [...rows].sort(
      (a, b) =>
        priorityScore(b.product, priorities, ctx) - priorityScore(a.product, priorities, ctx) ||
        b.score - a.score
    );
  }

  const results = rows.slice(0, limit).map((row) => ({ product: row.product, matchScore: row.score }));
  return { query, count: results.length, totalMatches, searchMode, results };
}

/** Plain Persian display line for an offer (honesty note included). */
export function describeSearchMode(mode: TextSearchResult["searchMode"]): string {
  switch (mode) {
    case "ranked":
      return "جست‌وجوی وزن‌دار روی کاتالوگ";
    case "relaxed":
      return "تطابق گسترده‌تر (نزدیک‌ترین‌ها)";
    default:
      return "بدون نتیجه";
  }
}
