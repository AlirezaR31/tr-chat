/**
 * Agent tool registry — mirrors TorobYar `app/agent/tools.py`.
 *
 * Same five core tools as the reference (search_products,
 * get_product_offers, find_payment_shops, find_nearby_product_shops,
 * update_shopping_preferences) plus basket-aware ones (get_basket,
 * find_similar_products) so the LLM tier can ground answers in the SAME
 * honest data the deterministic tier uses.
 *
 * Every tool is a pure server function over the dataset repository —
 * no model output can invent prices/stock/coords: whatever the model
 * claims must come from one of these result objects.
 */
import { z } from "zod";
import { dataset, type OfferRow } from "@/server/repositories/dataset";
import {
  getProductOffers,
  getNearbyOffers,
  getInstallmentOffers,
  SHOP_SERVICE_NOTE,
} from "@/server/services/shop-service";
import { searchProductsByText, describeSearchMode } from "@/server/services/product-service";
import type { ConversationContext, Priority } from "@/lib/types";
import { buildBasketView } from "@/lib/basket/basket-view";
import { formatTomanShort } from "@/lib/format";

/* ------------------------------ schemas ------------------------------ */

export const ToolArgs = {
  search_products: z.object({
    query: z.string().min(1).describe("عبارت فارسی جست‌وجو"),
    limit: z.number().int().min(1).max(10).optional(),
    budget_max_toman: z.number().positive().optional(),
    gender: z.enum(["men", "women", "unisex"]).optional(),
    use_case: z.enum(["daily", "sport"]).optional(),
    priorities: z.array(z.enum(["comfort", "price", "durability", "style"])).max(2).optional(),
  }),
  get_product_offers: z.object({
    product_id: z.string().min(1).describe("شناسه محصول از خروجی search_products"),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  find_nearby_product_shops: z.object({
    product_id: z.string().min(1),
    radius_km: z.number().min(0.5).max(50).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  find_payment_shops: z.object({
    product_id: z.string().min(1),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  find_similar_products: z.object({
    product_id: z.string().min(1),
    limit: z.number().int().min(1).max(6).optional(),
  }),
  get_basket: z.object({}),
  update_shopping_preferences: z.object({
    budget_max_toman: z.number().positive().nullable().optional(),
    gender: z.enum(["men", "women", "unisex"]).nullable().optional(),
    use_case: z.enum(["daily", "sport"]).nullable().optional(),
    priorities: z.array(z.enum(["comfort", "price", "durability", "style"])).nullable().optional(),
    location_label: z.string().nullable().optional(),
    clear_fields: z.array(z.enum(["budget_max_toman", "gender", "use_case", "priorities", "location_label"])).optional(),
  }),
} as const;

export type ToolName = keyof typeof ToolArgs;

export const TOOL_SPECS: Array<{ name: ToolName; description: string }> = [
  { name: "search_products", description: "جست‌وجوی محصول با عبارت فارسی (وزن‌دار، محاوره‌پسند). اولین قدم برای هر درخواست محصول." },
  { name: "get_product_offers", description: "قیمت‌ها و فروشگاه‌های یک محصول با product_id. قیمت‌ها ثبت‌شده‌اند، نه لحظه‌ای." },
  { name: "find_nearby_product_shops", description: "فروشگاه‌های نزدیک کاربر برای یک محصول (فاصله خط مستقیم). به location کاربر نیاز دارد." },
  { name: "find_payment_shops", description: "فروشگاه‌های دارای گزینه اقساط ثبت‌شده برای یک محصول. ثبت ≠ تضمین اقساط." },
  { name: "find_similar_products", description: "محصولات مشابه/هم‌رده یک محصول برای جایگزین یا مقایسه." },
  { name: "get_basket", description: "وضعیت فعلی سبد خرید کاربر (اقلام، فروشگاه منتخب، جمع تخمینی)." },
  { name: "update_shopping_preferences", description: "ذخیره صریح ترجیحات کاربر (بودجه، جنسیت، نوع استفاده، اولویت‌ها، محل)." },
];

/* ------------------------------ execution ------------------------------ */

export interface ToolContext {
  ctx: ConversationContext;
  /** preferences the model updated this turn (merged into context after dispatch) */
  prefDraft: Partial<ConversationContext>;
  /** product names the model saw this turn (helps intent mapping) */
  seenProducts: Array<{ id: string; name: string }>;
}

function offerLite(row: OfferRow) {
  return {
    offer_id: row.offerId,
    product_id: row.productId,
    store_id: row.storeId,
    store_name: row.storeName,
    area: row.storeArea,
    address: row.address,
    price_toman: row.priceToman,
    price_display: formatTomanShort(row.priceToman),
    stock_status: row.stockStatus,
    installment_declared: row.installmentVerified,
    hours: `${row.openHour} تا ${row.closeHour}`,
    distance_km: row.distanceKm !== undefined ? Number(row.distanceKm.toFixed(2)) : undefined,
    distance_type: row.distanceType,
    cluster: row.cluster,
  };
}

function productLite(p: { id: string; name: string; brand: string; model: string; priceFrom: number; kind?: string }) {
  return {
    product_id: p.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    price_from_toman: p.priceFrom,
    price_display: formatTomanShort(p.priceFrom),
    kind: p.kind ?? "sneaker",
  };
}

/** Resolve a fuzzy product reference (id, brand, model or Persian name). */
function resolveProduct(ref: string) {
  const direct = dataset.product(ref);
  if (direct) return direct;
  const text = ref.toLowerCase();
  const found = dataset.products().find(
    (p) =>
      p.id.toLowerCase().includes(text) ||
      p.model.toLowerCase().includes(text) ||
      p.brand.toLowerCase().includes(text) ||
      p.name.includes(ref)
  );
  return found;
}

export function runTool(
  name: ToolName,
  rawArgs: unknown,
  toolCtx: ToolContext
): Record<string, unknown> {
  switch (name) {
    case "search_products": {
      const args = ToolArgs.search_products.parse(rawArgs ?? {});
      const res = searchProductsByText({
        query: args.query,
        limit: args.limit ?? 5,
        budgetMax: args.budget_max_toman,
        gender: args.gender,
        useCase: args.use_case,
        priorities: args.priorities as Priority[] | undefined,
        includeAccessories: true,
      });
      for (const r of res.results) toolCtx.seenProducts.push({ id: r.product.id, name: r.product.name });
      return {
        query: res.query,
        search_mode: res.searchMode,
        search_mode_fa: describeSearchMode(res.searchMode),
        count: res.count,
        results: res.results.map((r) => productLite(r.product)),
        price_is_live: false,
      };
    }

    case "get_product_offers": {
      const args = ToolArgs.get_product_offers.parse(rawArgs ?? {});
      const product = resolveProduct(args.product_id);
      if (!product) {
        return { error: "product_not_found", message: "این شناسه در کاتالوگ نیست.", results: [], count: 0 };
      }
      toolCtx.seenProducts.push({ id: product.id, name: product.name });
      const offers = getProductOffers(product.id, args.limit ?? 5);
      return {
        product: productLite(product),
        count: offers.length,
        results: offers.map(offerLite),
        price_is_live: false,
        note: "قیمت‌ها ثبت‌شده‌اند و ممکن است قدیمی باشند؛ موجودی حضوری را باید با فروشگاه تایید کرد.",
      };
    }

    case "find_nearby_product_shops": {
      const args = ToolArgs.find_nearby_product_shops.parse(rawArgs ?? {});
      const product = resolveProduct(args.product_id);
      if (!product) return { error: "product_not_found", results: [], count: 0 };
      if (!toolCtx.ctx.location) {
        return {
          error: "location_required",
          message: "برای پیدا کردن فروشگاه نزدیک، موقعیت کاربر لازم است.",
          results: [],
          count: 0,
        };
      }
      toolCtx.seenProducts.push({ id: product.id, name: product.name });
      const offers = getNearbyOffers(product.id, toolCtx.ctx.location, args.radius_km ?? 8, args.limit ?? 6);
      return {
        product: productLite(product),
        user_location: toolCtx.ctx.location.name,
        radius_km: args.radius_km ?? 8,
        count: offers.length,
        results: offers.map(offerLite),
        distance_type: "straight_line",
        price_is_live: false,
      };
    }

    case "find_payment_shops": {
      const args = ToolArgs.find_payment_shops.parse(rawArgs ?? {});
      const product = resolveProduct(args.product_id);
      if (!product) return { error: "product_not_found", results: [], count: 0 };
      toolCtx.seenProducts.push({ id: product.id, name: product.name });
      const offers = getInstallmentOffers(product.id, args.limit ?? 6);
      return {
        product: productLite(product),
        count: offers.length,
        results: offers.map(offerLite),
        payment_channel_status: "in_person_declared",
        price_is_live: false,
        note: SHOP_SERVICE_NOTE,
      };
    }

    case "find_similar_products": {
      const args = ToolArgs.find_similar_products.parse(rawArgs ?? {});
      const product = resolveProduct(args.product_id);
      if (!product) return { error: "product_not_found", results: [], count: 0 };
      toolCtx.seenProducts.push({ id: product.id, name: product.name });
      const res = searchProductsByText({
        query: `${product.brand} ${product.kind === "accessory" ? (product.categoryFa ?? "لوازم جانبی") : "کتانی"}`,
        limit: (args.limit ?? 4) + 2,
        includeAccessories: product.kind === "accessory",
      });
      const similar = res.results.filter((r) => r.product.id !== product.id).slice(0, args.limit ?? 4);
      return {
        reference: productLite(product),
        count: similar.length,
        results: similar.map((r) => productLite(r.product)),
      };
    }

    case "get_basket": {
      ToolArgs.get_basket.parse(rawArgs ?? {});
      const view = buildBasketView(toolCtx.ctx.basket, {
        optimizeMode: toolCtx.ctx.optimizeMode,
        transport: toolCtx.ctx.transport,
        hasRoute: Boolean(toolCtx.ctx.lastPlannedAt),
        contacted: toolCtx.ctx.contacted,
      });
      return {
        items: toolCtx.ctx.basket.map((b) => {
          const p = dataset.product(b.productId);
          return {
            product_id: b.productId,
            name: p?.name ?? b.productId,
            quantity: b.quantity,
            variant: b.variant ?? null,
            target_price: b.targetPrice ?? null,
          };
        }),
        estimated_total_toman: view.estimatedTotal,
        estimated_total_display: formatTomanShort(view.estimatedTotal),
        count: toolCtx.ctx.basket.length,
      };
    }

    case "update_shopping_preferences": {
      const args = ToolArgs.update_shopping_preferences.parse(rawArgs ?? {});
      const draft = toolCtx.prefDraft;
      for (const field of args.clear_fields ?? []) {
        if (field === "budget_max_toman") draft.budgetMax = undefined;
        if (field === "gender") draft.gender = undefined;
        if (field === "use_case") draft.useCase = undefined;
        if (field === "priorities") draft.priorities = undefined;
      }
      if (args.budget_max_toman != null) {
        if (args.budget_max_toman <= 0) return { error: "بودجه باید بیشتر از صفر باشد." };
        draft.budgetMax = args.budget_max_toman;
      }
      if (args.gender != null) draft.gender = args.gender;
      if (args.use_case != null) draft.useCase = args.use_case;
      if (args.priorities != null && args.priorities.length) draft.priorities = args.priorities as Priority[];
      if (args.location_label != null && args.location_label.trim()) {
        draft.pendingIntent = args.location_label.trim();
      }
      return {
        saved_preferences: {
          budget_max_toman: draft.budgetMax ?? null,
          gender: draft.gender ?? null,
          use_case: draft.useCase ?? null,
          priorities: draft.priorities ?? null,
          location_label: draft.pendingIntent ?? null,
        },
      };
    }
  }
}
