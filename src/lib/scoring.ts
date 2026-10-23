/**
 * Transparent scoring methodology.
 *
 * All scores are derived ONLY from the product's declared specs and price —
 * no invented "expert ratings". Method is documented in the UI so scores are
 * defensible (requirement: preference-specific scoring must have a
 * defensible methodology and sufficient data).
 *
 *  - comfort:     normalized cushioning (weight 70%) + inverse weight (30%)
 *  - durability:  normalized durability spec
 *  - style:       normalized styleRating spec
 *  - price/value: inverse price — cheapest in the comparison set = 100
 *
 * Final priority score = weighted mean of the user's selected priorities
 * (weights equal across selected priorities).
 */
import type { Product, Priority, Criteria } from "@/lib/types";

const CUSH_MAX = 5;
const DUR_MAX = 5;
const STYLE_MAX = 5;

export function comfortScore(p: Product, minW: number, maxW: number): number {
  const cushion = (p.specs.cushioning / CUSH_MAX) * 100;
  // lighter is better; map weight range to 0..100
  const wr = maxW > minW ? (maxW - p.specs.weightGrams) / (maxW - minW) : 0.5;
  const light = wr * 100;
  return Math.round(cushion * 0.7 + light * 0.3);
}

export function priceScore(p: Product, minPrice: number, maxPrice: number): number {
  if (maxPrice <= minPrice) return 100;
  const v = ((maxPrice - p.priceFrom) / (maxPrice - minPrice)) * 100;
  return Math.round(Math.max(0, Math.min(100, v)));
}

export interface ScoreContext {
  minWeight: number;
  maxWeight: number;
  minPrice: number;
  maxPrice: number;
}

export function makeScoreContext(products: Product[]): ScoreContext {
  return {
    minWeight: Math.min(...products.map((p) => p.specs.weightGrams)),
    maxWeight: Math.max(...products.map((p) => p.specs.weightGrams)),
    minPrice: Math.min(...products.map((p) => p.priceFrom)),
    maxPrice: Math.max(...products.map((p) => p.priceFrom)),
  };
}

export function criterionScore(
  p: Product,
  c: Criteria,
  ctx: ScoreContext
): number {
  switch (c) {
    case "comfort":
      return comfortScore(p, ctx.minWeight, ctx.maxWeight);
    case "durability":
      return Math.round((p.specs.durability / DUR_MAX) * 100);
    case "style":
      return Math.round((p.specs.styleRating / STYLE_MAX) * 100);
    case "price":
      return priceScore(p, ctx.minPrice, ctx.maxPrice);
  }
}

export function priorityScore(
  p: Product,
  priorities: Priority[],
  ctx: ScoreContext
): number {
  if (priorities.length === 0) priorities = ["comfort", "price"];
  const sum = priorities.reduce(
    (acc, pr) => acc + criterionScore(p, pr, ctx),
    0
  );
  return Math.round(sum / priorities.length);
}

export const METHOD_LABEL =
  "امتیازها فقط از مشخصات اعلام‌شده و قیمت محاسبه شده‌اند (بدون نظرسنجی).";

export const PRIORITY_FA: Record<Priority, string> = {
  comfort: "راحتی",
  price: "قیمت",
  durability: "دوام",
  style: "استایل",
};

export const CRITERIA_HINT: Record<Criteria, string> = {
  comfort: "بر اساس کوشینگ، وزن و کیفیت فوم",
  price: "ارزان‌ترین گزینه بالاترین امتیاز می‌گیرد",
  durability: "بر اساس جنس رویه و کف",
  style: "بر اساس رتبه استایل مدل",
};
