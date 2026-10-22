/**
 * Zod schemas for every Generative-UI block.
 *
 * The renderer ONLY renders blocks that pass this validation — any invalid or
 * incomplete agent response falls back to a safe ErrorState. No arbitrary
 * HTML/JS can ever reach the DOM.
 */
import { z } from "zod";
import type { Block } from "./types";

const priorityEnum = z.enum(["comfort", "price", "durability", "style"]);
const isoOrCommaDate = z
  .string()
  .min(4)
  .max(40)
  .regex(/^[\d\-:TZ.\/ ]+$/, "invalid date");

const productSpecsSchema = z.object({
  weightGrams: z.number().positive(),
  cushioning: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  durability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  styleRating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  upper: z.string().min(1).max(60),
  drop: z.string().min(1).max(20),
  sole: z.string().min(1).max(60),
});

const productCardDataSchema = z.object({
  id: z.string().regex(/^[a-z0-9\-]+$/),
  name: z.string().min(2).max(120),
  brand: z.string().min(1).max(40),
  model: z.string().min(1).max(60),
  image: z.string().min(1).max(200),
  priceFrom: z.number().int().positive(),
  specs: productSpecsSchema,
  highlights: z.array(z.string().max(120)).max(6),
  sizes: z.string().max(40),
  gender: z.enum(["men", "women", "unisex"]),
  useCases: z.array(z.enum(["daily", "sport"])).max(3),
  storeCount: z.number().int().nonnegative(),
  matchScore: z.number().min(0).max(100),
  matchReason: z.string().max(160),
  kind: z.enum(["sneaker", "accessory"]).optional(),
  categoryFa: z.string().max(40).optional(),
});

const quickReplySchema = z.object({
  label: z.string().min(1).max(60),
  message: z.string().max(200).optional(),
  action: z
    .enum([
      "contact_store",
      "update_context",
      "select_product",
      "toggle_compare",
      "add_to_basket",
      "remove_from_basket",
      "update_basket_item",
      "clear_basket",
      "recalculate_route",
      "remove_stop",
      "move_stop",
      "dismiss_recommendation",
      "set_recs_muted",
    ])
    .optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const geoPointSchema = z.object({ lat: z.number(), lng: z.number() });

const userLocationSchema = geoPointSchema.extend({
  name: z.string().min(1).max(60),
  source: z.enum(["neighborhood", "gps"]),
});

const stockInfoSchema = z.object({
  status: z.enum(["confirmed", "reported", "listing_only", "unknown"]),
  verifiedAt: isoOrCommaDate.nullable(),
  method: z.string().max(60).nullable(),
});

const installmentInfoSchema = z.object({
  verified: z.boolean(),
  provider: z.string().max(60).optional(),
  verifiedAt: isoOrCommaDate.nullable().optional(),
  claim: z.string().max(60).optional(),
});

const storeCardDataSchema = z.object({
  id: z.string().regex(/^[a-z0-9\-]+$/),
  name: z.string().min(2).max(80),
  area: z.string().min(1).max(60),
  address: z.string().min(2).max(160),
  lat: z.number(),
  lng: z.number(),
  price: z.number().int().positive(),
  distanceKm: z.number().min(0),
  openNow: z.boolean(),
  hoursLabel: z.string().max(40),
  stock: stockInfoSchema,
  installment: installmentInfoSchema,
  rating: z.number().min(0).max(5),
  contacted: z
    .object({
      kind: z.enum(["contacting", "confirmed", "reported", "no_answer", "closed", "price_changed"]),
      at: z.number(),
      method: z.string().max(60),
      note: z.string().max(200),
      newPrice: z.number().int().positive().optional(),
    })
    .nullable()
    .optional(),
});

const comparisonEntrySchema = z.object({
  productId: z.string(),
  name: z.string(),
  brand: z.string(),
  image: z.string(),
  price: z.number().int().positive(),
  scores: z.record(priorityEnum, z.number().min(0).max(100)),
  attributes: z.array(
    z.object({
      label: z.string().max(40),
      value: z.string().max(40),
      score: z.number().min(0).max(1),
    })
  ),
  pros: z.array(z.string().max(90)).max(4),
  cons: z.array(z.string().max(90)).max(4),
});

const comparisonDataSchema = z.object({
  entries: z.array(comparisonEntrySchema).min(2).max(4),
  winnerBy: z.record(priorityEnum, z.string()),
  methodology: z.string().max(240),
  contextSummary: z.string().max(240),
  criteria: priorityEnum.optional(),
});

const contactOutcomeSchema = z.object({
  kind: z.enum(["contacting", "confirmed", "reported", "no_answer", "closed", "price_changed"]),
  at: z.number(),
  method: z.string().max(60),
  note: z.string().max(200),
  newPrice: z.number().int().positive().optional(),
});

/* ---------------- Smart Shopping Basket schemas ---------------- */

const basketOptimizeModeEnum = z.enum(["fastest", "cheapest", "fewest_stops", "balanced"]);
const transportModeEnum = z.enum(["car", "walk", "transit"]);
const assignmentConfidenceEnum = z.enum([
  "confirmed",
  "reported",
  "listing_only",
  "unknown",
  "unassigned",
]);

const basketAssignmentSchema = z.object({
  storeId: z.string().regex(/^[a-z0-9\-]+$/),
  storeName: z.string().min(2).max(80),
  area: z.string().min(1).max(60),
  price: z.number().int().positive(),
  confidence: assignmentConfidenceEnum,
  openNow: z.boolean(),
});

const basketItemViewSchema = z.object({
  productId: z.string().regex(/^[a-z0-9\-]+$/),
  name: z.string().min(2).max(120),
  brand: z.string().min(1).max(40),
  model: z.string().min(1).max(60),
  image: z.string().min(1).max(200),
  kind: z.enum(["sneaker", "accessory"]),
  categoryFa: z.string().max(40).optional(),
  quantity: z.number().int().min(1).max(10),
  variant: z.string().max(40).optional(),
  targetPrice: z.number().int().positive().optional(),
  bestPrice: z.number().int().positive(),
  assignment: basketAssignmentSchema.nullable().optional(),
  storeCount: z.number().int().nonnegative(),
  note: z.string().max(80).optional(),
});

const basketViewSchema = z.object({
  items: z.array(basketItemViewSchema).max(12),
  estimatedTotal: z.number().int().nonnegative(),
  savingsVsMax: z.number().int().nonnegative(),
  optimizeMode: basketOptimizeModeEnum,
  transport: transportModeEnum,
  hasRoute: z.boolean(),
  lastPlannedAt: z.number().optional(),
});

const recommendationItemSchema = z.object({
  kind: z.enum(["complementary", "nearby", "basket_optimization"]),
  product: productCardDataSchema,
  reason: z.string().min(3).max(200),
  availability: z
    .object({
      storeId: z.string().regex(/^[a-z0-9\-]+$/),
      storeName: z.string().min(2).max(80),
      area: z.string().min(1).max(60),
      price: z.number().int().positive(),
      stockStatus: z.enum(["confirmed", "reported", "listing_only", "unknown"]),
      distanceKm: z.number().min(0).nullable(),
    })
    .nullable(),
});

const routeStopItemSchema = z.object({
  productId: z.string().regex(/^[a-z0-9\-]+$/),
  productName: z.string().min(2).max(120),
  quantity: z.number().int().min(1).max(10),
  price: z.number().int().positive(),
  stockStatus: z.enum(["confirmed", "reported", "listing_only", "unknown"]),
  stockLabel: z.string().min(2).max(60),
  verifiedAt: isoOrCommaDate.nullable(),
  installmentVerified: z.boolean(),
});

const routeStopSchema = z.object({
  order: z.number().int().min(1).max(12),
  storeId: z.string().regex(/^[a-z0-9\-]+$/),
  storeName: z.string().min(2).max(80),
  area: z.string().min(1).max(60),
  address: z.string().min(2).max(160),
  lat: z.number(),
  lng: z.number(),
  items: z.array(routeStopItemSchema).min(1).max(12),
  subtotal: z.number().int().nonnegative(),
  openNow: z.boolean(),
  hoursLabel: z.string().max(40),
  etaLabel: z.string().max(40).nullable(),
  closedAtArrival: z.boolean(),
  legKm: z.number().min(0).nullable(),
  legMin: z.number().min(0).nullable(),
  shopMin: z.number().min(0),
  waitingMin: z.number().min(0),
  clusterLabel: z.string().max(60),
});

const planAlternativeSchema = z.object({
  planId: z.string().regex(/^[ABC]$/),
  mode: basketOptimizeModeEnum,
  label: z.string().min(1).max(60),
  totalProductCost: z.number().int().nonnegative(),
  totalTravelMin: z.number().nonnegative(),
  totalDistanceKm: z.number().min(0),
  stopCount: z.number().int().min(1).max(12),
  unconfirmedCount: z.number().int().nonnegative(),
  closedCount: z.number().int().nonnegative(),
  score: z.number().min(0).max(100),
  tradeoff: z.string().max(220),
});

const routePlanSchema = z.object({
  planId: z.string().max(40),
  mode: basketOptimizeModeEnum,
  transport: transportModeEnum,
  startLocation: userLocationSchema,
  stops: z.array(routeStopSchema).min(1).max(8),
  unassigned: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-z0-9\-]+$/),
        productName: z.string().min(2).max(120),
        reason: z.string().min(3).max(160),
      })
    )
    .max(8),
  totalProductCost: z.number().int().nonnegative(),
  totalDistanceKm: z.number().min(0),
  totalTravelMin: z.number().nonnegative(),
  totalShopMin: z.number().min(0),
  totalWaitMin: z.number().min(0),
  score: z.number().min(0).max(100),
  tradeoff: z.string().max(220),
  methodology: z.string().min(3).max(240),
  alternatives: z.array(planAlternativeSchema).max(3),
  generatedAt: z.number(),
  changes: z.array(z.string().max(160)).max(6),
});

/* ------------------------------------------------------------------ */

export const blockSchema: z.ZodType<Block> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(1200) }),
  z.object({
    type: z.literal("search_context"),
    queryLabel: z.string().min(1).max(60),
    productCount: z.number().int().nonnegative(),
    sourceCount: z.number().int().nonnegative(),
    appliedFilters: z.array(z.string().max(40)).max(6),
  }),
  z.object({
    type: z.literal("product_carousel"),
    products: z.array(productCardDataSchema).min(1).max(12),
    title: z.string().max(80).optional(),
  }),
  z.object({ type: z.literal("product_details"), product: productCardDataSchema }),
  z.object({ type: z.literal("comparison_panel"), comparison: comparisonDataSchema }),
  z.object({
    type: z.literal("preference_selector"),
    active: z.array(priorityEnum).max(4),
  }),
  z.object({
    type: z.literal("store_panel"),
    stores: z.array(storeCardDataSchema).max(20),
    productId: z.string(),
    productName: z.string().max(120),
    location: userLocationSchema,
    filters: z.object({
      sort: z.enum(["price", "distance", "stock"]),
      installmentOnly: z.boolean(),
      openNow: z.boolean(),
      confirmedStockOnly: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("contact_status"),
    storeName: z.string().max(80),
    productId: z.string(),
    outcome: contactOutcomeSchema,
  }),
  z.object({
    type: z.literal("alternative_stores"),
    stores: z.array(storeCardDataSchema).min(1).max(6),
    productId: z.string(),
    reason: z.string().max(160),
  }),
  z.object({
    type: z.literal("empty_state"),
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(200),
    replies: z.array(quickReplySchema).max(4),
  }),
  z.object({ type: z.literal("quick_replies"), replies: z.array(quickReplySchema).min(1).max(10) }),
  z.object({ type: z.literal("demo_notice"), label: z.string().min(1).max(80) }),
  z.object({
    type: z.literal("basket_summary"),
    basket: basketViewSchema,
    intro: z.string().max(200).optional(),
  }),
  z.object({
    type: z.literal("basket_recommendations"),
    forProductId: z.string().regex(/^[a-z0-9\-]+$/),
    forProductName: z.string().min(2).max(120),
    recs: z.array(recommendationItemSchema).min(1).max(4),
    hint: z.string().min(3).max(160),
  }),
  z.object({ type: z.literal("route_plan"), plan: routePlanSchema }),
  z.object({
    type: z.literal("plan_comparison"),
    alternatives: z.array(planAlternativeSchema).min(2).max(3),
    mode: basketOptimizeModeEnum,
  }),
]);

/** Validate a block; returns null when invalid (renderer shows safe fallback). */
export function validateBlock(block: unknown): Block | null {
  const res = blockSchema.safeParse(block);
  return res.success ? (res.data as Block) : null;
}

export function validateBlocks(blocks: unknown[]): Block[] {
  return blocks
    .map((b) => validateBlock(b))
    .filter((b): b is Block => b !== null);
}
