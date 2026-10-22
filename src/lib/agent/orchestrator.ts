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
} from "@/lib/types";
import { CATALOG, getProduct } from "@/lib/data/catalog";
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

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const faPriorities: Record<Priority, string> = {
  comfort: "راحتی",
  price: "قیمت",
  durability: "دوام",
  style: "استایل",
};

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

function route(
  nlu: NluResult,
  raw: string,
  ctxIn: ConversationContext
): { turn: ChatTurn; context: ConversationContext } {
  let ctx: ConversationContext = { ...ctxIn };
  const t = normalize(raw);

  /* ---------- greeting ---------- */
  if (nlu.intent === "greet") {
    return {
      context: ctx,
      turn: {
        text: "سلام! من دستیار خرید تُربم. کتانی و کفش‌های تهران رو می‌شناسم — از قیمت تا موجودی حضوری. مثلا بنویس: «کتانی راحتی زیر ۴ میلیون تومان».",
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
        text: "خواهش می‌کنم! اگه چیز دیگه‌ای خواستی — مقایسه، فروشگاه یا خرید اقساطی — همین‌جا بگو.",
        blocks: [
          {
            type: "quick_replies",
            replies: ctx.recommendedIds.length
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

  /* ---------- explicit location message ---------- */
  if (nlu.locationName) {
    // resolve coordinates of chosen neighborhood (approx real anchor)
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
    const anchor = NEIGHBORHOOD_ANCHORS[nlu.locationName];
    if (anchor) {
      ctx.location = { name: nlu.locationName, ...anchor, source: "neighborhood" };
      ctx.pendingIntent = undefined;
      const product = resolveSelectedProduct(t, ctx);
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
    const picked = pickProductFromText(t, ctx) ?? getProduct(ctx.recommendedIds[0]);
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
    resolveSelectedProduct(t, ctx);
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
    return storesTurn(ctx, `${getProduct(ctx.selectedProductId)?.name ?? "محصول"} در فروشگاه‌های تهران:`);
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
 */
function resolveSelectedProduct(t: string, ctx: ConversationContext): Product | undefined {
  const picked = pickProductFromText(t, ctx);
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
];

function pickProductFromText(t: string, ctx: ConversationContext): Product | undefined {
  for (const [id, hints] of BRAND_HINTS) {
    if (hints.some((h) => t.includes(h))) return getProduct(id);
  }
  return ctx.selectedProductId ? getProduct(ctx.selectedProductId) : undefined;
}
