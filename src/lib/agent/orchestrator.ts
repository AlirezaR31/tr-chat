/**
 * Orchestrator — the agent's brain.
 *
 * Takes (message | action) + context, runs the right tools, updates the
 * context, and returns a ChatTurn made ONLY of typed, validated blocks.
 * Deterministic and testable; no LLM in the loop (zero hallucination risk
 * on prices/availability).
 */
import type {
  Block,
  ChatTurn,
  ConversationContext,
  Criteria,
  Priority,
  Product,
  QuickReply,
} from "@/lib/types";
import { CATALOG, ALL_PRODUCTS, getProduct } from "@/lib/data/catalog";
import { STORES as STORE_LIST } from "@/lib/data/stores";
import {
  alternativeStores,
  buildComparison,
  findStores,
  searchProducts,
  simulateContact,
  sortStores,
  toCardData,
} from "@/lib/agent/tools";
import { parseMessage, normalize, type NluResult } from "@/lib/agent/nlu";
import { formatToman, formatTomanShort, toFaDigits } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { makeScoreContext, priorityScore } from "@/lib/scoring";
import { buildBasketView } from "@/lib/basket/basket-view";
import { buildRecommendations } from "@/lib/basket/recommendations";
import { MODE_FA, TRANSPORT_FA, planRoute } from "@/lib/basket/route-engine";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const faPriorities: Record<Priority, string> = {
  comfort: "راحتی",
  price: "قیمت",
  durability: "دوام",
  style: "استایل",
};

/* ------------------------------------------------------------------ */
/* Basket helpers                                                      */
/* ------------------------------------------------------------------ */

const RECS_HINT =
  "پیشنهادها فقط بعد از افزودن هر آیتم می‌آیند؛ هر کدام را می‌توانی رد کنی یا بگویی «پیشنهاد نده».";

function basketSummaryBlock(ctx: ConversationContext, intro?: string): Block {
  return {
    type: "basket_summary",
    basket: buildBasketView(ctx.basket, {
      optimizeMode: ctx.optimizeMode,
      transport: ctx.transport,
      hasRoute: Boolean(ctx.lastPlannedAt),
      lastPlannedAt: ctx.lastPlannedAt,
      contacted: ctx.contacted,
    }),
    intro,
  };
}

function recsBlock(added: Product, ctx: ConversationContext): Block | null {
  const recs = buildRecommendations(added, ctx, 3);
  if (!recs.length) return null;
  return {
    type: "basket_recommendations",
    forProductId: added.id,
    forProductName: added.name,
    recs,
    hint: RECS_HINT,
  };
}

function locationChips(): Block {
  return {
    type: "quick_replies",
    replies: [
      { label: "سعادت‌آباد", message: "سعادت‌آباد" },
      { label: "ونک", message: "ونک" },
      { label: "تجریش", message: "تجریش" },
      { label: "پاسداران", message: "پاسداران" },
      { label: "آرژانتین", message: "آرژانتین" },
      { label: "نارمک", message: "نارمک" },
      { label: "صادقیه", message: "صادقیه" },
      { label: "📍 موقعیت من (GPS)", payload: { requestGps: true }, message: "مسیر سبد خریدم رو بچین" },
    ],
  };
}

/* Neighborhood anchors (approx real landmark coordinates, as in Task 1). */
const NEIGHBORHOOD_ANCHORS: Record<string, { lat: number; lng: number }> = {
  "سعادت‌آباد": { lat: 35.7797, lng: 51.3746 },
  "شهرک غرب": { lat: 35.762, lng: 51.366 },
  "ونک": { lat: 35.757, lng: 51.41 },
  "آرژانتین": { lat: 35.731, lng: 51.416 },
  "تجریش": { lat: 35.801, lng: 51.434 },
  "پاسداران": { lat: 35.787, lng: 51.47 },
  "نیاوران": { lat: 35.811, lng: 51.47 },
  "نارمک": { lat: 35.742, lng: 51.51 },
  "صادقیه": { lat: 35.716, lng: 51.348 },
  "بازار بزرگ تهران": { lat: 35.672, lng: 51.421 },
  "ولیعصر": { lat: 35.744, lng: 51.421 },
  "شریعتی": { lat: 35.764, lng: 51.44 },
};

function routeTurn(
  ctx: ConversationContext,
  intro?: string
): { turn: ChatTurn; context: ConversationContext } {
  if (!ctx.location) {
    ctx.pendingIntent = "route_location";
    return {
      context: ctx,
      turn: {
        text: "برای چیدن مسیر چند‌ایستگاهی، نقطه شروع (محله یا موقعیت GPS) رو بگو تا فاصله‌ها و ترتیب واقعی حساب بشه.",
        blocks: [locationChips()],
      },
    };
  }
  const result = planRoute({
    basket: ctx.basket,
    location: ctx.location,
    mode: ctx.optimizeMode,
    transport: ctx.transport,
    contacted: ctx.contacted,
    excludeStores: ctx.excludedStoreIds,
  });
  if (!result) {
    return {
      context: ctx,
      turn: {
        text: "هیچ‌کدوم از آیتم‌های سبد در فروشگاه‌های داده فعلی ثبت نشدن؛ اول از کارت‌های محصول مدل‌های موجود رو انتخاب کن.",
        blocks: [],
      },
    };
  }
  ctx.stage = "routing";
  ctx.lastPlannedAt = Date.now();
  const plan = result.plan;

  const blocks: Block[] = [{ type: "route_plan", plan }];
  if (plan.alternatives.length >= 2) {
    blocks.push({ type: "plan_comparison", alternatives: plan.alternatives, mode: plan.mode });
  }
  blocks.push({
    type: "quick_replies",
    replies: [
      { label: "سریع‌ترین مسیر", message: "مسیر رو برای سریع‌ترین زمان حساب کن" },
      { label: "کم‌هزینه‌ترین", message: "مسیر رو برای کمترین هزینه حساب کن" },
      { label: "کمترین توقف", message: "همه رو از کمترین فروشگاه بخرم" },
      { label: "با ماشین", message: "مسیر رو با ماشین حساب کن" },
      { label: "پیاده", message: "مسیر پیاده رو حساب کن" },
      { label: "مترو", message: "مسیر رو با مترو حساب کن" },
    ],
  });

  const stopCount = toFaDigits(plan.stops.length);
  const text =
    (intro ? intro + " " : "") +
    `برنامه ${MODE_FA[plan.mode]} با ${stopCount} ایستگاه آماده‌ست؛ جمع کالا ${formatTomanShort(plan.totalProductCost)} و حدود ${toFaDigits(plan.totalTravelMin + plan.totalShopMin + plan.totalWaitMin)} دقیقه زمان می‌بره. ${plan.tradeoff}`;
  return { context: ctx, turn: { text, blocks } };
}

function productDetailsBlock(p: Product, params: Parameters<typeof toCardData>[1], maxScore: number): Block {
  return { type: "product_details", product: toCardData(p, params, maxScore) };
}

function recommendationBlocks(
  products: Product[],
  ctx: ConversationContext,
  opts: { question?: string; introPrefix?: string; changed?: string[] } = {}
): { blocks: Block[]; context: ConversationContext } {
  const params = {
    budgetMax: ctx.budgetMax,
    gender: ctx.gender,
    useCase: ctx.useCase,
    priorities: ctx.priorities,
  };
  const filtered = searchProducts(params);
  const items = filtered.slice(0, 6);
  const next: ConversationContext = {
    ...ctx,
    recommendedIds: items.map((p) => p.id),
    stage: "recommendations",
  };

  if (items.length === 0) {
    const cheapest = [...CATALOG].sort((a, b) => a.priceFrom - b.priceFrom)[0];
    return {
      context: { ...next, recommendedIds: [] },
      blocks: [
        {
          type: "empty_state",
          title: "با این بودجه گزینه‌ای پیدا نشد",
          description: ctx.budgetMax
            ? `ارزان‌ترین کتانی موجود حدود ${formatTomanShort(cheapest.priceFrom)} است.`
            : "فیلترها رو کمی بازتر کن.",
          replies: [
            { label: `بودجه ${formatTomanShort(cheapest.priceFrom)}`, message: `بودجه‌ام ${Math.round(cheapest.priceFrom / 1_000_000)} میلیونه` },
            { label: "ارزون‌ترین‌ها رو نشون بده", message: "ارزون‌ترین کتانی‌ها رو نشون بده" },
            { label: "بودجه مهم نیست", message: "بودجه مهم نیست، بهترین‌ها رو نشون بده" },
          ],
        },
      ],
    };
  }

  const allCtx = makeScoreContext(products.length ? products : items);
  const maxScore = Math.max(
    ...items.map((p) => priorityScore(p, ctx.priorities as never, allCtx))
  );

  const appliedFilters: string[] = [];
  if (ctx.budgetMax) appliedFilters.push(`زیر ${formatTomanShort(ctx.budgetMax)}`);
  if (ctx.gender === "men") appliedFilters.push("مردانه");
  if (ctx.gender === "women") appliedFilters.push("زنانه");
  if (ctx.useCase === "daily") appliedFilters.push("روزمره");
  if (ctx.useCase === "sport") appliedFilters.push("ورزشی");
  if (ctx.priorities.length)
    appliedFilters.push(`اولویت ${ctx.priorities.map((p) => faPriorities[p]).join(" و ")}`);

  const cheapest = items.reduce((a, b) => (a.priceFrom <= b.priceFrom ? a : b));
  const intro =
    (opts.introPrefix ? opts.introPrefix + " " : "") +
    (ctx.budgetMax
      ? `با بودجه ${formatTomanShort(ctx.budgetMax)}، ${items.length} مدل مناسب پیدا کردم. ارزون‌ترین‌ش ${cheapest.brand} ${cheapest.model} از ${formatTomanShort(cheapest.priceFrom)} شروع می‌شه.`
      : `${items.length} مدل مناسب پیدا کردم؛ ارزون‌ترین‌ش ${cheapest.brand} ${cheapest.model} از ${formatTomanShort(cheapest.priceFrom)} شروع می‌شه.`) +
    (opts.changed && opts.changed.length ? ` ${opts.changed.join(" ")}` : "");

  const blocks: Block[] = [
    {
      type: "search_context",
      queryLabel: ctx.category ? "جستجوی کتانی" : "جستجوی محصول",
      productCount: items.length,
      sourceCount: items.reduce((a, p) => a + p.sourceCount, 0),
      appliedFilters,
    },
    { type: "text", text: intro.trim() },
  ];

  const question = opts.question ?? (ctx.useCase ? undefined : "کتانی رو برای استفاده‌ی روزمره می‌خوای یا ورزشی؟");

  blocks.push({
    type: "product_carousel",
    products: items.map((p) => toCardData(p, params, maxScore)),
    title: "پیشنهادهای تُرب",
  });

  if (question) {
    blocks.push({ type: "text", text: question });
    blocks.push({
      type: "quick_replies",
      replies: [
        { label: "برای روزمره", message: "برای استفاده روزمره می‌خوام" },
        { label: "برای ورزش", message: "برای ورزش می‌خوام" },
        { label: "فرقی نداره", message: "فرقی نداره" },
      ],
    });
  }
  blocks.push({ type: "preference_selector", active: ctx.priorities });
  return { blocks, context: next };
}

/* ------------------------------------------------------------------ */
/* Comparison turn builder (shared: initial compare + criteria change) */
/* ------------------------------------------------------------------ */

function comparisonTurn(
  ctx: ConversationContext,
  products: Product[]
): { turn: ChatTurn; context: ConversationContext } {
  const criteria: Criteria = ctx.priorities[0] ?? "comfort";
  ctx.criteria = criteria;
  const comparison = buildComparison(products, ctx.priorities);
  const winner = comparison.entries.find((e) => e.productId === comparison.winnerBy[criteria]);
  const text = winner
    ? `با ملاک ${faPriorities[criteria]}، ${winner.name} جلو می‌زنه (${toFaDigits(winner.scores[criteria])} از ۱۰۰). ملاک مقایسه رو می‌تونی از بالای کارت‌ها عوض کنی.`
    : "مقایسه آماده‌ست.";
  ctx.stage = "comparing";
  ctx.compareIds = products.map((p) => p.id);
  return {
    context: ctx,
    turn: {
      text,
      blocks: [
        { type: "comparison_panel", comparison },
        {
          type: "quick_replies",
          replies: [
            { label: "کجا حضوری بخرمش؟", message: "کجا حضوری بخرمش؟" },
            { label: "ملاک: قیمت", message: "مقایسه بر اساس قیمت" },
            { label: "ملاک: راحتی", message: "مقایسه بر اساس راحتی" },
          ],
        },
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Message handler                                                     */
/* ------------------------------------------------------------------ */

export function handleMessage(
  raw: string,
  ctx: ConversationContext
): { turn: ChatTurn; context: ConversationContext } {
  const nlu = parseMessage(raw, ctx);
  return route(nlu, raw, ctx);
}

/**
 * Dispatch an intent resolved OUTSIDE the deterministic parser (LLM tier).
 * The result flows through the exact same route() the rules use, so every
 * typed block, honesty guard and context mutation behaves identically.
 */
export function handleResolved(
  nlu: NluResult,
  raw: string,
  ctx: ConversationContext
): { turn: ChatTurn; context: ConversationContext } {
  return route(nlu, raw, ctx);
}

function route(
  nlu: NluResult,
  raw: string,
  ctxIn: ConversationContext
): { turn: ChatTurn; context: ConversationContext } {
  let ctx: ConversationContext = { ...ctxIn };
  const t = normalize(raw);

  // early location capture when it accompanies basket-route intents
  // (e.g. «مسیر سبد رو از سعادت‌آباد بچین») — the basket handlers below
  // need the location before the generic location handler would run.
  if (
    nlu.locationName &&
    NEIGHBORHOOD_ANCHORS[nlu.locationName] &&
    ["plan_route", "set_optimize_mode", "set_transport"].includes(nlu.intent)
  ) {
    ctx.location = {
      name: nlu.locationName,
      ...NEIGHBORHOOD_ANCHORS[nlu.locationName],
      source: "neighborhood",
    };
  }

  /* ---------- greeting ---------- */
  if (nlu.intent === "greet") {
    return {
      context: ctx,
      turn: {
        text: "سلام! من دستیار خرید تُربم. کتانی و کفش‌های تهران رو می‌شناسم — از قیمت تا موجودی حضوری. می‌تونی چند محصول رو «به سبد» اضافه کنی تا ترکیب فروشگاه‌ها و مسیر چند‌ایستگاهی رو برات برنامه‌ریزی کنم. مثلا بنویس: «کتانی راحتی زیر ۴ میلیون تومان».",
        blocks: [
          {
            type: "quick_replies",
            replies: [
              { label: "کتانی راحتی زیر ۴ میلیون", message: "کتانی راحتی زیر ۴ میلیون تومان می‌خوام" },
              { label: "کتانی ورزشی مردانه", message: "کتانی ورزشی مردانه می‌خوام" },
              { label: "ارزون‌ترین کتانی‌ها", message: "ارزون‌ترین کتانی‌ها رو نشون بده" },
            ],
          },
        ],
      },
    };
  }

  /* ---------- thanks ---------- */
  if (nlu.intent === "thanks") {
    return {
      context: ctx,
      turn: {
        text: "خواهش می‌کنم! اگه چیز دیگه‌ای خواستی — مقایسه، فروشگاه، سبد خرید یا خرید اقساطی — همین‌جا بگو.",
        blocks: [
          {
            type: "quick_replies",
            replies: ctx.basket.length
              ? [
                  { label: "سبد خریدم", message: "سبد خریدم رو نشون بده" },
                  { label: "مسیرمو بچین", message: "مسیر سبد خریدم رو بچین" },
                ]
              : ctx.recommendedIds.length
                ? [
                    { label: "کجا حضوری بخرم؟", message: "کجا حضوری بخرمش؟" },
                    { label: "مقایسه کن", message: "مقایسه‌شون کن" },
                  ]
                : [{ label: "کتانی ببین", message: "می‌خوام کتانی بخرم" }],
          },
        ],
      },
    };
  }

  /* ---------- basket: recs mute/unmute ---------- */
  if (nlu.intent === "set_recs_muted") {
    ctx.recsMuted = nlu.muteRecs ?? true;
    return {
      context: ctx,
      turn: {
        text: ctx.recsMuted
          ? "باشه، دیگه پیشنهاد خودکار نمی‌دم. هر وقت خواستی بگو «پیشنهاد بده»."
          : "پیشنهادهای مرتبط دوباره فعال شد.",
        blocks: [],
      },
    };
  }

  /* ---------- basket: add ---------- */
  if (nlu.intent === "add_to_basket") {
    const picked = pickProductFromText(t, ctx, nlu.productRef) ?? getProduct(ctx.lastAddedId ?? ctx.selectedProductId ?? ctx.recommendedIds[0]);
    if (!picked) {
      return {
        context: ctx,
        turn: {
          text: "برای افزودن به سبد، اول از کارت‌های محصول یک مدل انتخاب کن یا اسمش رو بنویس (مثلا «نیوبالنس ۵۳۰ رو به سبد اضافه کن»).",
          blocks: [],
        },
      };
    }
    const existing = ctx.basket.find((b) => b.productId === picked.id);
    if (existing) {
      ctx.basket = ctx.basket.map((b) =>
        b.productId === picked.id
          ? { ...b, quantity: Math.min(10, b.quantity + 1), variant: nlu.variant ?? b.variant, targetPrice: nlu.targetPrice ?? b.targetPrice }
          : b
      );
    } else {
      ctx.basket = [
        ...ctx.basket,
        {
          productId: picked.id,
          quantity: 1,
          addedAt: Date.now(),
          variant: nlu.variant,
          targetPrice: nlu.targetPrice,
        },
      ];
    }
    ctx.lastAddedId = picked.id;
    ctx.stage = "basket";
    const view = buildBasketView(ctx.basket, { optimizeMode: ctx.optimizeMode, transport: ctx.transport, hasRoute: Boolean(ctx.lastPlannedAt), contacted: ctx.contacted });
    const total = view.estimatedTotal;
    const text = existing
      ? `تعداد «${picked.name}» در سبد به ${toFaDigits(existing.quantity + 1)} رسید؛ جمع تخمینی سبد ${formatTomanShort(total)}.`
      : `«${picked.name}» به سبد اضافه شد${nlu.variant ? ` (${nlu.variant})` : ""}؛ جمع تخمینی سبد ${formatTomanShort(total)}.`;
    const blocks: Block[] = [basketSummaryBlock(ctx)];
    const recs = recsBlock(picked, ctx);
    if (recs) blocks.push(recs);
    blocks.push({
      type: "quick_replies",
      replies: [
        { label: "مسیرمو بچین", message: "مسیر سبد خریدم رو بچین" },
        { label: "سبد کامل", message: "سبد خریدم رو نشون بده" },
        { label: "پیشنهاد نده", action: "set_recs_muted", payload: { muted: true } },
      ],
    });
    return { context: ctx, turn: { text, blocks } };
  }

  /* ---------- basket: remove ---------- */
  if (nlu.intent === "remove_from_basket") {
    const target = productFromBasket(t, ctx, nlu.productRef);
    if (!target) {
      return {
        context: ctx,
        turn: {
          text: "کدوم آیتم رو از سبد بردارم؟ اسمش رو بگو یا از لیست سبد حذفش کن.",
          blocks: [basketSummaryBlock(ctx)],
        },
      };
    }
    ctx.basket = ctx.basket.filter((b) => b.productId !== target.id);
    const text = ctx.basket.length
      ? `«${target.name}» از سبد حذف شد؛ مسیر و قیمت‌ها به‌محض تغییر بعدی دوباره حساب می‌شن.`
      : `«${target.name}» حذف شد؛ سبد خریدت خالیه.`;
    const replies: QuickReply[] = [];
    if (ctx.basket.length && ctx.lastPlannedAt)
      replies.push({ label: "مسیر رو دوباره حساب کن", message: "مسیر رو دوباره حساب کن" });
    return {
      context: ctx,
      turn: {
        text,
        blocks: [basketSummaryBlock(ctx), ...(replies.length ? [{ type: "quick_replies", replies } as Block] : [])],
      },
    };
  }

  /* ---------- basket: show ---------- */
  if (nlu.intent === "show_basket") {
    if (!ctx.basket.length) {
      return {
        context: ctx,
        turn: {
          text: "سبد خریدت خالیه. از کارت‌های محصول دکمه «به سبد» رو بزن یا بنویس «این کتانی رو به سبد اضافه کن».",
          blocks: [],
        },
      };
    }
    const view = buildBasketView(ctx.basket, { optimizeMode: ctx.optimizeMode, transport: ctx.transport, hasRoute: Boolean(ctx.lastPlannedAt), contacted: ctx.contacted });
    return {
      context: ctx,
      turn: {
        text: `سبد تو ${toFaDigits(view.items.length)} قلم داره؛ جمع تخمینی ${formatTomanShort(view.estimatedTotal)}. وضعیت هر آیتم و فروشگاه پیشنهادی روی کارت سبد مشخصه.`,
        blocks: [
          basketSummaryBlock(ctx),
          {
            type: "quick_replies",
            replies: ctx.location
              ? [
                  { label: "مسیرمو بچین", message: "مسیر سبد خریدم رو بچین" },
                  { label: "خالی کردن سبد", action: "clear_basket", payload: {} },
                ]
              : [{ label: "مسیرمو بچین", message: "مسیر سبد خریدم رو بچین" }],
          },
        ],
      },
    };
  }

  /* ---------- basket: clear ---------- */
  if (nlu.intent === "clear_basket") {
    const had = ctx.basket.length;
    ctx.basket = [];
    ctx.lastAddedId = undefined;
    ctx.excludedStoreIds = [];
    return {
      context: ctx,
      turn: {
        text: had ? "سبد خرید خالی شد. هر وقت خواستی از نو شروع کنیم، همین‌جام." : "سبد از قبل خالی بود.",
        blocks: [],
      },
    };
  }

  /* ---------- basket: plan route ---------- */
  if (nlu.intent === "plan_route") {
    if (!ctx.basket.length) {
      return {
        context: ctx,
        turn: {
          text: "برای برنامه‌ریزی مسیر، اول چند محصول به سبد اضافه کن — بعد ترکیب فروشگاه‌ها و ترتیب ایستگاه‌ها رو حساب می‌کنم.",
          blocks: [],
        },
      };
    }
    if (nlu.optimizeMode) ctx.optimizeMode = nlu.optimizeMode;
    if (nlu.transport) ctx.transport = nlu.transport;
    return routeTurn(ctx, "باشه، سبدت رو بین فروشگاه‌های واقعی پخش و ترتیب بهینه رو حساب کردم.");
  }

  /* ---------- basket: optimize mode ---------- */
  if (nlu.intent === "set_optimize_mode") {
    const mode = nlu.optimizeMode ?? "balanced";
    const changed = ctx.optimizeMode !== mode;
    ctx.optimizeMode = mode;
    if (!ctx.basket.length || !ctx.location) {
      return {
        context: ctx,
        turn: {
          text: `اولویت بهینه‌سازی روی «${MODE_FA[mode]}» تنظیم شد. برای دیدن برنامه، سبد و مکان شروع لازمه.`,
          blocks: [],
        },
      };
    }
    return routeTurn(ctx, changed ? `حالت «${MODE_FA[mode]}» اعمال شد؛ دوباره حساب کردم.` : undefined);
  }

  /* ---------- basket: transport mode ---------- */
  if (nlu.intent === "set_transport") {
    const transport = nlu.transport ?? "car";
    const changed = ctx.transport !== transport;
    ctx.transport = transport;
    if (!ctx.basket.length || !ctx.location) {
      return {
        context: ctx,
        turn: {
          text: `حالت حمل‌ونقل «${TRANSPORT_FA[transport]}» ثبت شد. برای محاسبه مسیر، سبد و مکان شروع لازمه.`,
          blocks: [],
        },
      };
    }
    return routeTurn(ctx, changed ? `محاسبه با «${TRANSPORT_FA[transport]}» انجام شد.` : undefined);
  }

  /* ---------- basket: cheaper alternative ---------- */
  if (nlu.intent === "cheaper_alternative") {
    const target = productFromBasket(t, ctx, nlu.productRef) ?? resolveSelectedProduct(t, ctx, nlu.productRef);
    if (!target) {
      return { context: ctx, turn: { text: "بگو برای کدوم محصول جایگزین ارزون‌تر پیدا کنم؟", blocks: [] } };
    }
    const inBasket = ctx.basket.some((b) => b.productId === target.id);
    if (inBasket && ctx.location) {
      const stores = findStores(target.id, target.priceFrom, ctx.location).sort((a, b) => a.price - b.price);
      const cheapest = stores[0];
      const view = buildBasketView(ctx.basket, { optimizeMode: ctx.optimizeMode, transport: ctx.transport, hasRoute: Boolean(ctx.lastPlannedAt), contacted: ctx.contacted });
      const current = view.items.find((i) => i.productId === target.id)?.assignment?.price;
      if (cheapest && current && cheapest.price < current) {
        return {
          context: ctx,
          turn: {
            text: `ارزون‌ترین فروشگاه برای «${target.name}» الان ${cheapest.name} با ${formatToman(cheapest.price)} است (${formatTomanShort(current - cheapest.price)} ارزون‌تر از فروشگاه فعلی سبد).`,
            blocks: [
              { type: "alternative_stores", stores: stores.slice(0, 3), productId: target.id, reason: "ارزون‌ترین گزینه‌های همین مدل:" },
              { type: "quick_replies", replies: [{ label: "مسیر رو دوباره حساب کن", message: "مسیر رو دوباره حساب کن" }] },
            ],
          },
        };
      }
      return {
        context: ctx,
        turn: {
          text: cheapest
            ? `«${target.name}» الان از ارزون‌ترین فروشگاه ممکن (${cheapest.name} — ${formatToman(cheapest.price)}) در سبد ثبت شده. جایگزین ارزون‌تری در داده فعلی نیست.`
            : `برای «${target.name}» فروشگاهی در داده فعلی ثبت نشده.`,
          blocks: [],
        },
      };
    }
    // not in basket → cheaper comparable products
    const cheaper = searchProducts({ budgetMax: target.priceFrom - 1, gender: ctx.gender, useCase: ctx.useCase, priorities: ["price", ...ctx.priorities] })
      .filter((p) => p.kind !== "accessory")
      .slice(0, 3);
    if (!cheaper.length) {
      return { context: ctx, turn: { text: `ارزون‌تر از «${target.name}» مدل مشابهی در کاتالوگ فعلی نیست.`, blocks: [] } };
    }
    const params = { budgetMax: ctx.budgetMax, gender: ctx.gender, useCase: ctx.useCase, priorities: ctx.priorities };
    const allCtx = makeScoreContext(cheaper);
    const maxScore = Math.max(...cheaper.map((p) => priorityScore(p, ctx.priorities as never, allCtx)));
    return {
      context: ctx,
      turn: {
        text: `به‌جای «${target.name}»، این گزینه‌های ارزون‌تر رو هم می‌تونی ببینی:`,
        blocks: [
          { type: "product_carousel", products: cheaper.map((p) => toCardData(p, params, maxScore)), title: "جایگزین‌های ارزون‌تر" },
        ],
      },
    };
  }

  /* ---------- explicit location message ---------- */
  if (nlu.locationName) {
    const anchor = NEIGHBORHOOD_ANCHORS[nlu.locationName];
    if (anchor) {
      const wasRoutePending = ctx.pendingIntent === "route_location";
      ctx.location = { name: nlu.locationName, ...anchor, source: "neighborhood" };
      ctx.pendingIntent = undefined;
      // route planning pending location → build the itinerary now.
      // A bare location with a non-empty basket and NO other intent also
      // means "set my start point" for basket routing (stage may have drifted
      // to recommendations — the basket itself is the signal).
      const wantsRoute =
        wasRoutePending ||
        (ctx.basket.length > 0 &&
          (ctx.stage === "routing" || ctx.stage === "basket" || nlu.intent === "unknown") &&
          nlu.intent !== "find_stores" &&
          nlu.intent !== "cheapest_store");
      if (wantsRoute) {
        return routeTurn(ctx, `شروع از ${nlu.locationName} ثبت شد.`);
      }
      const product = resolveSelectedProduct(t, ctx, nlu.productRef);
      if (!product) {
        return {
          context: ctx,
          turn: {
            text: `موقعیت روی ${nlu.locationName} ثبت شد. حالا از کارت‌های محصول یک مدل انتخاب کن تا فروشگاه‌های اطرافت رو نشونت بدم.`,
            blocks: [],
          },
        };
      }
      return storesTurn(ctx, "باشه، از مکان شما فاصله‌ها رو حساب کردم.");
    }
  }

  /* ---------- compare ---------- */
  if (nlu.intent === "compare") {
    let ids = ctx.compareIds;
    if (ids.length < 2) ids = ctx.recommendedIds.slice(0, 3);
    if (ids.length < 2) {
      return {
        context: ctx,
        turn: {
          text: "برای مقایسه، اول باید چند مدل انتخاب کنی. از کارت‌های محصول دکمه «مقایسه» رو بزن.",
          blocks: [],
        },
      };
    }
    if (nlu.priorities?.length) ctx.priorities = nlu.priorities;
    const products = ids.map((id) => getProduct(id)).filter((p): p is Product => Boolean(p));
    if (products.length < 2) {
      return { context: ctx, turn: { text: "مدل‌های مقایسه پیدا نشدن؛ دوباره انتخاب کن.", blocks: [] } };
    }
    return comparisonTurn(ctx, products);
  }

  /* ---------- select product ---------- */
  if (nlu.intent === "select_product") {
    const picked = pickProductFromText(t, ctx, nlu.productRef) ?? getProduct(ctx.recommendedIds[0]);
    if (!picked) {
      return { context: ctx, turn: { text: "کدوم مدل رو می‌خوای؟ از کارت‌ها انتخاب کن.", blocks: [] } };
    }
    ctx.selectedProductId = picked.id;
    if (!ctx.compareIds.includes(picked.id)) ctx.compareIds = [...ctx.compareIds, picked.id].slice(-3);
    const params = {
      budgetMax: ctx.budgetMax,
      gender: ctx.gender,
      useCase: ctx.useCase,
      priorities: ctx.priorities,
    };
    const allCtx = makeScoreContext(CATALOG);
    return {
      context: ctx,
      turn: {
        text: `${picked.name} انتخاب شد. قیمت پایه از ${formatToman(picked.priceFrom)} شروع می‌شه. بگو «کجا حضوری بخرم» تا نزدیک‌ترین فروشگاه‌های تهران با موجودی واقعی رو نشونت بدم.`,
        blocks: [
          productDetailsBlock(picked, params, 100),
          {
            type: "quick_replies",
            replies: [
              { label: "کجا حضوری بخرمش؟", message: "کجا حضوری بخرمش؟" },
              { label: "فروشگاه اقساطی داره؟", message: "فروشگاه اقساطی داره؟" },
              { label: "مقایسه با بقیه", message: "مقایسه‌ش کن" },
            ],
          },
        ],
      },
    };
  }

  /* ---------- find stores ---------- */
  if (nlu.intent === "find_stores") {
    resolveSelectedProduct(t, ctx, nlu.productRef);
    if (ctx.selectedProductId && nlu.priorities?.length) ctx.priorities = nlu.priorities;

    if (!ctx.location) {
      ctx.pendingIntent = "location";
      return {
        context: ctx,
        turn: {
          text: "برای حساب کردن فاصله و نمایش روی نقشه، محل تقریبی‌ات رو بگو یا از موقعیت گوشی استفاده کن. آدرس دقیق ذخیره نمی‌شه.",
          blocks: [
            {
              type: "quick_replies",
              replies: [
                { label: "سعادت‌آباد", message: "سعادت‌آباد" },
                { label: "ونک", message: "ونک" },
                { label: "تجریش", message: "تجریش" },
                { label: "پاسداران", message: "پاسداران" },
                { label: "آرژانتین", message: "آرژانتین" },
                { label: "نارمک", message: "نارمک" },
                { label: "صادقیه", message: "صادقیه" },
                { label: "📍 موقعیت من (GPS)", payload: { requestGps: true }, message: "فروشگاه‌های نزدیکم رو نشون بده" },
              ],
            },
          ],
        },
      };
    }
    return storesTurn(ctx, `${getProduct(ctx.selectedProductId!)?.name ?? "محصول"} در فروشگاه‌های تهران:`);
  }

  /* ---------- cheapest store ---------- */
  if (nlu.intent === "cheapest_store") {
    if (!ctx.selectedProductId) {
      ctx.pendingIntent = "location";
      return {
        context: ctx,
        turn: { text: "اول مدل رو انتخاب کن، بعد ارزون‌ترین فروشگاه رو پیدا می‌کنم.", blocks: [] },
      };
    }
    if (!ctx.location) {
      ctx.pendingIntent = "location";
      return {
        context: ctx,
        turn: {
          text: "کدوم محله؟ فاصله‌ها رو از موقعیت شما حساب می‌کنم.",
          blocks: [
            {
              type: "quick_replies",
              replies: [
                { label: "سعادت‌آباد", message: "سعادت‌آباد" },
                { label: "ونک", message: "ونک" },
                { label: "تجریش", message: "تجریش" },
                { label: "پاسداران", message: "پاسداران" },
                { label: "آرژانتین", message: "آرژانتین" },
                { label: "نارمک", message: "نارمک" },
                { label: "صادقیه", message: "صادقیه" },
                { label: "📍 موقعیت من (GPS)", payload: { requestGps: true }, message: "فروشگاه‌های نزدیکم رو نشون بده" },
              ],
            },
          ],
        },
      };
    }
    ctx.storeFilters.sort = "price";
    return storesTurn(ctx, "ارزون‌ترین فروشگاه‌ها برای این مدل:");
  }

  /* ---------- installment ---------- */
  if (nlu.intent === "installment") {
    ctx.storeFilters = { ...ctx.storeFilters, installmentOnly: true };
    ctx.stage = "installment";
    if (!ctx.selectedProductId || !ctx.location) {
      return {
        context: ctx,
        turn: {
          text: "فقط فروشگاه‌هایی که «خدمات اقساطی تاییدشده» دارن رو نشون می‌دم. برای این باید مدل و منطقه‌ات رو بدونم — بگو «کجا حضوری بخرم».",
          blocks: [],
        },
      };
    }
    const verifiedCount = findStores(
      ctx.selectedProductId,
      getProduct(ctx.selectedProductId)!.priceFrom,
      ctx.location,
      { installmentOnly: true }
    ).length;
    if (verifiedCount === 0) {
      return {
        context: ctx,
        turn: {
          text: "برای این مدل، فروشگاهی با «اقساط تاییدشده» پیدا نشد. فروشگاه‌های دارای ادعای اقساطی (تاییدنشده) در لیست اصلی مشخص شدن.",
          blocks: [],
        },
      };
    }
    return storesTurn(ctx, `${toFaDigits(verifiedCount)} فروشگاه خدمات اقساطی تاییدشده دارن:`);
  }

  /* ---------- search / refine ---------- */
  if (nlu.intent === "search" || nlu.intent === "refine") {
    const changed: string[] = [];
    if (nlu.budgetMax) {
      const isChange = ctx.budgetMax !== nlu.budgetMax;
      ctx.budgetMax = nlu.budgetMax;
      if (isChange && ctx.stage !== "greeting") changed.push("بودجه به‌روزرسانی شد.");
    }
    if (nlu.gender) {
      if (ctx.gender !== nlu.gender) changed.push("فیلتر جنسیت اعمال شد.");
      ctx.gender = nlu.gender;
    }
    if (nlu.useCase) {
      if (ctx.useCase !== nlu.useCase) changed.push("نوع استفاده اعمال شد.");
      ctx.useCase = nlu.useCase;
    }
    if (nlu.priorities?.length) {
      const changedP = JSON.stringify(ctx.priorities) !== JSON.stringify(nlu.priorities);
      ctx.priorities = nlu.priorities;
      if (changedP) changed.push(`اولویت روی ${nlu.priorities.map((p) => faPriorities[p]).join(" و ")} تنظیم شد.`);
    }
    if (!ctx.category) ctx.category = "sneakers";

    // scenario 9: user changes preference while comparing → re-run comparison
    if (
      ctx.stage === "comparing" &&
      ctx.compareIds.length >= 2 &&
      (nlu.priorities?.length || 0) > 0
    ) {
      const products = ctx.compareIds
        .map((id) => getProduct(id))
        .filter((p): p is Product => Boolean(p));
      if (products.length >= 2) {
        const out = comparisonTurn(ctx, products);
        return {
          context: out.context,
          turn: { text: `اولویت جدید اعمال شد. ${out.turn.text}`, blocks: out.turn.blocks },
        };
      }
    }

    const isInitial = ctx.stage === "greeting" || ctx.recommendedIds.length === 0;
    const out = recommendationBlocks(CATALOG, ctx, {
      question: isInitial && !ctx.useCase ? undefined : undefined,
      changed,
    });

    // if user mentioned in-person/tehran but we're at the start, hint at stores
    if (isInitial && (t.includes("حضوری") || t.includes("تهران"))) {
      out.blocks.splice(2, 0, {
        type: "text",
        text: "چون گفتی حضوری در تهران می‌خری، بعد از انتخاب مدل، فروشگاه‌های نزدیکت رو با موجودی و قیمت دقیق نشونت می‌دم.",
      });
    }
    return { context: out.context, turn: { blocks: out.blocks } };
  }

  /* ---------- unknown fallback ---------- */
  return {
    context: ctx,
    turn: {
      text:
        ctx.stage === "greeting"
          ? "دقت نکردم چی می‌خوای. مثلا بنویس: «کتانی راحتی زیر ۴ میلیون» یا «ارزون‌ترین کتانی ورزشی»."
          : "این رو متوجه نشدم. می‌تونی بگی «مقایسه کن»، «کجا بخرمش؟» یا اولویتت رو عوض کنی (مثلا «قیمت مهم‌تره»).",
      blocks: [
        {
          type: "quick_replies",
          replies: ctx.recommendedIds.length
            ? [
                { label: "مقایسه کن", message: "مقایسه‌شون کن" },
                { label: "کجا حضوری بخرم؟", message: "کجا حضوری بخرمش؟" },
                { label: "فقط اقساطی‌ها", message: "فقط فروشگاه‌های اقساطی رو نشون بده" },
              ]
            : [
                { label: "کتانی راحتی زیر ۴ میلیون", message: "کتانی راحتی زیر ۴ میلیون تومان می‌خوام" },
                { label: "کتانی ورزشی", message: "کتانی ورزشی می‌خوام" },
              ],
        },
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Stores turn builder                                                 */
/* ------------------------------------------------------------------ */

function storesTurn(
  ctx: ConversationContext,
  intro: string
): { turn: ChatTurn; context: ConversationContext } {
  const product = getProduct(ctx.selectedProductId!);
  if (!product || !ctx.location) {
    return {
      context: ctx,
      turn: { text: "اول مدل و منطقه رو مشخص کن.", blocks: [] },
    };
  }
  const all = findStores(product.id, product.priceFrom, ctx.location);
  const sorted = sortStores(all, ctx.storeFilters.sort);
  const cheapest = [...all].sort((a, b) => a.price - b.price)[0];
  const confirmedCount = all.filter((s) => s.stock.status === "confirmed").length;
  const installmentCount = all.filter((s) => s.installment.verified).length;

  ctx.stage = "stores";
  const summary =
    `${intro} ` +
    (cheapest
      ? `ارزون‌ترین: ${cheapest.name} (${formatToman(cheapest.price)}) در فاصله ${formatDistance(cheapest.distanceKm)}. `
      : "") +
    `${toFaDigits(confirmedCount)} فروشگاه موجودی تاییدشده دارن` +
    (installmentCount ? ` و ${toFaDigits(installmentCount)} تاشون اقساطی تاییدشده دارن.` : ".");

  return {
    context: ctx,
    turn: {
      text: summary,
      blocks: [
        {
          type: "store_panel",
          stores: sorted,
          productId: product.id,
          productName: product.name,
          location: ctx.location,
          filters: ctx.storeFilters,
        },
        {
          type: "quick_replies",
          replies: [
            { label: "فقط اقساطی‌های تاییدشده", message: "فقط فروشگاه‌های اقساطی رو نشون بده" },
            { label: "ارزون‌ترین‌ها", message: "ارزون‌ترین فروشگاه‌ها" },
            { label: "نزدیک‌ترین‌ها", message: "نزدیک‌ترین فروشگاه‌ها رو نشون بده" },
          ],
        },
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Action handler                                                      */
/* ------------------------------------------------------------------ */

export function handleAction(
  action: { type: string; payload: Record<string, unknown> },
  ctxIn: ConversationContext
): { turn: ChatTurn; context: ConversationContext } {
  let ctx: ConversationContext = { ...ctxIn };

  /* ---------- Smart Shopping Basket actions ---------- */

  if (action.type === "add_to_basket") {
    const productId = String(action.payload.productId ?? "");
    const picked = getProduct(productId);
    if (!picked) {
      return { context: ctx, turn: { text: "این محصول در کاتالوگ فعلی پیدا نشد.", blocks: [] } };
    }
    const qty = Math.max(1, Math.min(10, Number(action.payload.quantity ?? 1) || 1));
    const variant = typeof action.payload.variant === "string" ? action.payload.variant : undefined;
    const targetPrice =
      typeof action.payload.targetPrice === "number" && action.payload.targetPrice > 0
        ? Math.round(action.payload.targetPrice)
        : undefined;
    const existing = ctx.basket.find((b) => b.productId === picked.id);
    if (existing) {
      ctx.basket = ctx.basket.map((b) =>
        b.productId === picked.id
          ? { ...b, quantity: Math.min(10, b.quantity + qty), variant: variant ?? b.variant, targetPrice: targetPrice ?? b.targetPrice }
          : b
      );
    } else {
      ctx.basket = [...ctx.basket, { productId: picked.id, quantity: qty, addedAt: Date.now(), variant, targetPrice }];
    }
    ctx.lastAddedId = picked.id;
    ctx.stage = "basket";
    const view = buildBasketView(ctx.basket, { optimizeMode: ctx.optimizeMode, transport: ctx.transport, hasRoute: Boolean(ctx.lastPlannedAt), contacted: ctx.contacted });
    const text = existing
      ? `تعداد «${picked.name}» در سبد به ${toFaDigits(existing.quantity + qty)} رسید؛ جمع تخمینی سبد ${formatTomanShort(view.estimatedTotal)}.`
      : `«${picked.name}» به سبد اضافه شد؛ جمع تخمینی سبد ${formatTomanShort(view.estimatedTotal)}.`;
    const blocks: Block[] = [basketSummaryBlock(ctx)];
    const recs = recsBlock(picked, ctx);
    if (recs) blocks.push(recs);
    blocks.push({
      type: "quick_replies",
      replies: [
        { label: "مسیرمو بچین", message: "مسیر سبد خریدم رو بچین" },
        { label: "سبد کامل", message: "سبد خریدم رو نشون بده" },
        { label: "پیشنهاد نده", action: "set_recs_muted", payload: { muted: true } },
      ],
    });
    return { context: ctx, turn: { text, blocks } };
  }

  if (action.type === "remove_from_basket") {
    const productId = String(action.payload.productId ?? "");
    const picked = getProduct(productId);
    if (!picked || !ctx.basket.some((b) => b.productId === productId)) {
      return { context: ctx, turn: { text: "این آیتم در سبد نبود.", blocks: [] } };
    }
    ctx.basket = ctx.basket.filter((b) => b.productId !== productId);
    const text = ctx.basket.length
      ? `«${picked.name}» از سبد حذف شد؛ جمع جدید محاسبه شد.`
      : `«${picked.name}» حذف شد؛ سبد خریدت خالیه.`;
    const blocks: Block[] = [basketSummaryBlock(ctx)];
    if (ctx.basket.length && ctx.lastPlannedAt) {
      blocks.push({ type: "quick_replies", replies: [{ label: "مسیر رو دوباره حساب کن", message: "مسیر رو دوباره حساب کن" }] });
    }
    return { context: ctx, turn: { text, blocks } };
  }

  if (action.type === "update_basket_item") {
    // silent edit (qty stepper / target price) — client toasts, no transcript turn
    const productId = String(action.payload.productId ?? "");
    const qty = action.payload.quantity === 0 ? 0 : Math.max(1, Math.min(10, Number(action.payload.quantity ?? 1) || 1));
    if (qty === 0) {
      ctx.basket = ctx.basket.filter((b) => b.productId !== productId);
    } else {
      ctx.basket = ctx.basket.map((b) =>
        b.productId === productId
          ? {
              ...b,
              quantity: qty,
              targetPrice:
                typeof action.payload.targetPrice === "number" && action.payload.targetPrice > 0
                  ? Math.round(action.payload.targetPrice)
                  : b.targetPrice,
            }
          : b
      );
    }
    return { context: ctx, turn: { blocks: [] } };
  }

  if (action.type === "clear_basket") {
    ctx.basket = [];
    ctx.lastAddedId = undefined;
    ctx.excludedStoreIds = [];
    return { context: ctx, turn: { text: "سبد خرید خالی شد.", blocks: [] } };
  }

  if (action.type === "recalculate_route" || action.type === "remove_stop") {
    if (typeof action.payload.mode === "string") ctx.optimizeMode = action.payload.mode as ConversationContext["optimizeMode"];
    if (typeof action.payload.transport === "string") ctx.transport = action.payload.transport as ConversationContext["transport"];
    // resetExclusions: bring back previously removed stores
    if (action.payload.resetExclusions === true) {
      ctx.excludedStoreIds = [];
    }
    // remove_stop(storeId) → persistent exclusion; recalculate_route may carry extra ones
    if (action.type === "remove_stop") {
      const sid = String(action.payload.storeId ?? "");
      if (sid && !ctx.excludedStoreIds.includes(sid)) ctx.excludedStoreIds = [...ctx.excludedStoreIds, sid];
    }
    if (Array.isArray(action.payload.excludeStoreIds)) {
      const extra = (action.payload.excludeStoreIds as unknown[]).map(String).filter(Boolean);
      ctx.excludedStoreIds = [...new Set([...ctx.excludedStoreIds, ...extra])];
    }
    const exclude = ctx.excludedStoreIds;
    if (exclude.length) {
      if (!ctx.location || !ctx.basket.length) {
        return { context: ctx, turn: { text: "برای بازچینی مسیر، سبد و مکان شروع لازم است.", blocks: [] } };
      }
      const result = planRoute({
        basket: ctx.basket,
        location: ctx.location,
        mode: ctx.optimizeMode,
        transport: ctx.transport,
        contacted: ctx.contacted,
        excludeStores: exclude,
      });
      if (!result) {
        return { context: ctx, turn: { text: "با حذف این فروشگاه، ترکیب جایگزینی برای همه آیتم‌ها پیدا نشد؛ فروشگاه رو نگه دار یا سبد رو تغییر بده.", blocks: [] } };
      }
      ctx.stage = "routing";
      ctx.lastPlannedAt = Date.now();
      const plan = result.plan;
      const blocks: Block[] = [{ type: "route_plan", plan }];
      if (plan.alternatives.length >= 2) blocks.push({ type: "plan_comparison", alternatives: plan.alternatives, mode: plan.mode });
      const removedName = STORE_LIST.find((s) => s.id === exclude[0])?.name ?? "این فروشگاه";
      const unassignedNote = plan.unassigned.length
        ? ` «${plan.unassigned[0].productName}» در فروشگاه بازِ دیگری ثبت نشده و از مسیر خارج شد.`
        : "";
      blocks.push({
        type: "quick_replies",
        replies: [{ label: "برگرد به همه فروشگاه‌ها", action: "recalculate_route", payload: { resetExclusions: true } }],
      });
      return {
        context: ctx,
        turn: {
          text: `مسیر بدون «${removedName}» دوباره چیده شد؛ ${toFaDigits(plan.stops.length)} ایستگاه و جمع کالا ${formatTomanShort(plan.totalProductCost)}.${unassignedNote}`,
          blocks,
        },
      };
    }
    return routeTurn(ctx, "با تنظیمات جدید دوباره حساب شد:");
  }

  if (action.type === "move_stop") {
    // payload.order = full storeId order chosen in the UI
    const order = Array.isArray(action.payload.order)
      ? (action.payload.order as unknown[]).map(String).filter((id) => STORE_LIST.some((s) => s.id === id))
      : [];
    const unique = [...new Set(order)];
    if (!ctx.location || !ctx.basket.length || unique.length === 0) {
      return { context: ctx, turn: { text: "ترتیب جدید قابل اعمال نیست.", blocks: [] } };
    }
    const result = planRoute({
      basket: ctx.basket,
      location: ctx.location,
      mode: ctx.optimizeMode,
      transport: ctx.transport,
      contacted: ctx.contacted,
      excludeStores: ctx.excludedStoreIds,
      forcedOrder: unique,
    });
    if (!result) {
      return { context: ctx, turn: { text: "ترتیب جدید قابل اعمال نیست.", blocks: [] } };
    }
    ctx.stage = "routing";
    return { context: ctx, turn: { blocks: [{ type: "route_plan", plan: result.plan }] } };
  }

  if (action.type === "dismiss_recommendation") {
    const pid = String(action.payload.productId ?? "");
    if (pid && !ctx.dismissedRecs.includes(pid)) ctx.dismissedRecs = [...ctx.dismissedRecs, pid];
    return { context: ctx, turn: { blocks: [] } };
  }

  if (action.type === "set_recs_muted") {
    ctx.recsMuted = Boolean(action.payload.muted);
    return {
      context: ctx,
      turn: {
        text: ctx.recsMuted ? "باشه، دیگه پیشنهاد خودکار نمی‌دم. هر وقت خواستی بگو «پیشنهاد بده»." : "پیشنهادهای مرتبط دوباره فعال شد.",
        blocks: [],
      },
    };
  }

  if (action.type === "contact_store") {
    const storeId = String(action.payload.storeId ?? "");
    const productId = String(action.payload.productId ?? ctx.selectedProductId ?? "");
    const product = getProduct(productId);
    if (!product) {
      return { context: ctx, turn: { text: "محصول یافت نشد.", blocks: [] } };
    }
    const sim = simulateContact(storeId, productId);
    const store = STORE_LIST.find((s) => s.id === storeId)?.name ?? "فروشگاه";
    if (!sim) {
      return { context: ctx, turn: { text: "اطلاعات فروشگاه کامل نیست.", blocks: [] } };
    }
    const at = Date.now();
    ctx.contacted = { ...ctx.contacted, [storeId]: { kind: sim.kind, at, method: "تماس نمایشی", note: sim.note, newPrice: sim.newPrice } };
    ctx.stage = "contacting";

    const blocks: Block[] = [
      {
        type: "contact_status",
        storeName: store,
        productId,
        outcome: { kind: sim.kind, at, method: "تماس نمایشی (شبیه‌سازی)", note: sim.note, newPrice: sim.newPrice },
      },
    ];

    if (sim.kind === "no_answer" || sim.kind === "closed" || sim.kind === "price_changed") {
      const alts = ctx.location
        ? alternativeStores(storeId, productId, product.priceFrom, ctx.location, 3)
        : [];
      if (alts.length) {
        blocks.push({
          type: "alternative_stores",
          stores: alts,
          productId,
          reason:
            sim.kind === "no_answer"
              ? "این فروشگاه پاسخ نداد؛ این‌ها مطمئن‌ترین گزینه‌ها هستن (باز/بسته بودن رو روی کارت ببین):"
              : sim.kind === "closed"
                ? "فروشگاه بسته بود؛ این گزینه‌ها رو هم می‌تونی بررسی کنی:"
                : "قیمت این فروشگاه تغییر کرد؛ این گزینه‌ها ارزون‌تر یا مطمئن‌ترن:",
        });
      }
      blocks.push({
        type: "quick_replies",
        replies: [
          { label: "لیست فروشگاه‌ها", message: "لیست فروشگاه‌ها رو نشون بده" },
          { label: "فقط موجودی تاییدشده", payload: { confirmedOnly: true }, message: "فقط فروشگاه‌های موجودی تاییدشده" },
        ],
      });
    } else {
      blocks.push({
        type: "quick_replies",
        replies: [
          { label: "لیست فروشگاه‌ها", message: "لیست فروشگاه‌ها رو نشون بده" },
          { label: "فروشگاه‌های دیگه", message: "نزدیک‌ترین فروشگاه‌ها رو نشون بده" },
        ],
      });
    }
    return { context: ctx, turn: { blocks } };
  }

  if (action.type === "update_context") {
    // silent context sync (filters, location via GPS, criteria…)
    const patch = action.payload as Partial<ConversationContext>;
    ctx = { ...ctx, ...patch };
    return { context: ctx, turn: { blocks: [] } };
  }

  return { context: ctx, turn: { blocks: [] } };
}

/* ------------------------------------------------------------------ */
/* Product matching from free text                                     */
/* ------------------------------------------------------------------ */

/**
 * Resolve the active product: explicit mention > selected > last compared >
 * top recommendation. Mutates ctx.selectedProductId and returns the product.
 * `ref` (from the LLM tier) is an explicit product id/model/brand hint and
 * wins over text matching.
 */
function resolveSelectedProduct(t: string, ctx: ConversationContext, ref?: string): Product | undefined {
  const picked = (ref && resolveByRef(ref)) || pickProductFromText(t, ctx);
  if (picked) {
    ctx.selectedProductId = picked.id;
    return picked;
  }
  const existing = ctx.selectedProductId ? getProduct(ctx.selectedProductId) : undefined;
  if (existing) return existing;
  const fallbackId =
    ctx.compareIds.length
      ? ctx.compareIds[ctx.compareIds.length - 1]
      : ctx.recommendedIds[0];
  const fallback = fallbackId ? getProduct(fallbackId) : undefined;
  if (fallback) ctx.selectedProductId = fallback.id;
  return fallback;
}

/** Resolve a product the user names, restricted to basket items. */
function productFromBasket(t: string, ctx: ConversationContext, ref?: string): Product | undefined {
  if (ref) {
    const byRef = resolveByRef(ref);
    if (byRef && ctx.basket.some((b) => b.productId === byRef.id)) return byRef;
  }
  for (const item of ctx.basket) {
    const p = getProduct(item.productId);
    if (!p) continue;
    const hints = PRODUCT_HINTS[p.id] ?? [];
    if (hints.some((h) => t.includes(h))) return p;
  }
  if (ctx.basket.length === 1) return getProduct(ctx.basket[0].productId);
  return undefined;
}

const BRAND_HINTS: Array<[string, string[]]> = [
  ["nike-v2k", ["نایکی", "نايک", "v2k", "نیک"]],
  ["nb530", ["نیوبالنس", "نیو بالانس", "530", "۵۳۰"]],
  ["nb9060", ["9060", "۹۰۶۰"]],
  ["vans-classic-canvas", ["ونس", "vans"]],
  ["skechers-max-cushioning", ["اسکچرز", "اسکچر", "skechers"]],
  ["duramo-sl", ["ادیداس", "آدیداس", "adidas", "دیورامو", "دیورام"]],
  ["asics-gel-contend", ["اسیكس", "اسیکس", "asics", "کنتند", "گل کنتند"]],
  ["asics-kayano-14", ["کایانو", "kayano"]],
  ["puma-smash-v2", ["پوما", "puma", "اسمش"]],
  ["reebok-quick-motion", ["ریباک", "reebok"]],
  ["acc-sport-socks", ["جوراب"]],
  ["acc-insole", ["کفی", "اینرسول"]],
  ["acc-laces", ["بند کتانی", "بند کفش", "بندش"]],
  ["acc-care-kit", ["کیت", "تمیز کننده", "تمیزکننده", "مراقبت"]],
  ["acc-gym-bag", ["کیف ورزشی", "کوله", "کیف دوشی"]],
];

/** id → hints lookup for basket-item resolution. */
const PRODUCT_HINTS: Record<string, string[]> = Object.fromEntries(BRAND_HINTS);

/**
 * Resolve a product from an explicit reference (id / model / brand / name
 * substring). Used by the LLM tier's productRef and as a fuzzy fallback.
 */
function resolveByRef(ref: string): Product | undefined {
  const q = ref.toLowerCase();
  return (
    getProduct(ref) ??
    ALL_PRODUCTS.find(
      (p) =>
        p.id.toLowerCase() === q ||
        p.model.toLowerCase() === q ||
        p.id.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.brand.toLowerCase() === q ||
        p.name.includes(ref)
    )
  );
}

function pickProductFromText(t: string, ctx: ConversationContext, ref?: string): Product | undefined {
  if (ref) {
    const byRef = resolveByRef(ref);
    if (byRef) return byRef;
  }
  for (const [id, hints] of BRAND_HINTS) {
    if (hints.some((h) => t.includes(h))) return getProduct(id);
  }
  return ctx.selectedProductId ? getProduct(ctx.selectedProductId) : undefined;
}
