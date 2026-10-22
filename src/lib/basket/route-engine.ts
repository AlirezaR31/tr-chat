/**
 * Basket Route Engine — store assignment + multi-stop itinerary optimizer.
 *
 * Design (deterministic, honest, disclosed):
 *  - Assignment: exact enumeration over subsets of the candidate-store union
 *    (≤ 2^10 subsets with the demo dataset) — per-item best store inside the
 *    subset by "effective price" (price + disclosed stock-risk premium).
 *  - Ordering: nearest-neighbour from the start location, improved with
 *    2-opt (never a rigid east-to-west sort).
 *  - Travel: real haversine legs; time from a DISCLOSED estimate model
 *    (car 20 km/h, transit 15 km/h + 6 min/leg, walk 4.5 km/h). No routing
 *    provider is available in this sandbox, so times are labelled estimates
 *    in the UI (the methodology string ships with every plan).
 *  - Opening hours: simulated arrival clock (Tehran time) from now.
 *  - Score (transparent, normalized 0..1 before weighting):
 *      total = wT·T + wD·D + wC·C + wR·R + wH·H
 *      T travel minutes, D distance km, C purchase cost,
 *      R stock-risk (share of items not independently confirmed),
 *      H opening-hours penalty (share of stops closed at ETA).
 *
 * Nothing here fabricates data: every price/stock/hour/coordinate comes
 * from the dataset; every estimate is labelled and its model disclosed.
 */
import type {
  BasketItem,
  BasketOptimizeMode,
  ContactOutcome,
  PlanAlternative,
  RoutePlan,
  RouteStop,
  StockStatusKind,
  TransportMode,
  UserLocation,
} from "@/lib/types";
import { getProduct } from "@/lib/data/catalog";
import { getStoreStock, STORES, STORE_CLUSTER, STOCK_METHOD } from "@/lib/data/stores";
import { haversineKm } from "@/lib/geo";
import { tehranNow, toFaDigits, formatTomanShort } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Disclosed constants                                                 */
/* ------------------------------------------------------------------ */

const SPEED_KMH: Record<TransportMode, number> = { car: 20, walk: 4.5, transit: 15 };
const TRANSIT_FIXED_MIN = 6; // station access per leg
const SHOP_BASE_MIN = 10; // first item
const SHOP_EXTRA_MIN = 4; // each additional item
const WAIT_BY_STATUS: Record<StockStatusKind, number> = {
  confirmed: 0,
  reported: 4,
  listing_only: 6,
  unknown: 8,
};
const NO_ANSWER_EXTRA_MIN = 8; // store previously did not answer
const STATUS_EFF_PCT: Record<StockStatusKind, number> = {
  confirmed: 0,
  reported: 0.01,
  listing_only: 0.02,
  unknown: 0.03,
};

const WEIGHTS: Record<
  BasketOptimizeMode,
  { wT: number; wD: number; wC: number; wR: number; wH: number }
> = {
  fastest: { wT: 0.5, wD: 0.15, wC: 0.1, wR: 0.15, wH: 0.1 },
  cheapest: { wT: 0.15, wD: 0.05, wC: 0.55, wR: 0.15, wH: 0.1 },
  fewest_stops: { wT: 0.3, wD: 0.1, wC: 0.3, wR: 0.2, wH: 0.1 },
  balanced: { wT: 0.3, wD: 0.1, wC: 0.35, wR: 0.15, wH: 0.1 },
};

export const MODE_FA: Record<BasketOptimizeMode, string> = {
  fastest: "سریع‌ترین مسیر",
  cheapest: "کم‌هزینه‌ترین خرید",
  fewest_stops: "کمترین توقف",
  balanced: "پیشنهاد متعادل",
};

export const TRANSPORT_FA: Record<TransportMode, string> = {
  car: "با ماشین",
  walk: "پیاده",
  transit: "حمل‌ونقل عمومی",
};

export function stockLabelFa(status: StockStatusKind): string {
  switch (status) {
    case "confirmed":
      return "موجودی تاییدشده";
    case "reported":
      return "گزارش فروشنده (تاییدنشده)";
    case "listing_only":
      return "داده آگهی (تاییدنشده)";
    default:
      return "موجودی نامشخص";
  }
}

/* ------------------------------------------------------------------ */
/* Internal structures                                                 */
/* ------------------------------------------------------------------ */

interface Cand {
  storeId: string;
  price: number;
  status: StockStatusKind;
  effPrice: number; // price + disclosed stock premium (per-item pick)
}

interface AssignItem {
  productId: string;
  quantity: number;
  storeId: string;
  price: number;
  status: StockStatusKind;
}

interface PlanEval {
  assignment: AssignItem[]; // per basket line
  storeIds: string[]; // unique assigned stores
  order: string[]; // visit order (optimized or forced)
  productCost: number;
  distanceKm: number;
  travelMin: number;
  shopMin: number;
  waitMin: number;
  unconfirmed: number; // basket lines whose status != confirmed
  closedStops: number;
  stopCount: number;
  costRaw: number;
  score: number;
}

export interface PlanOptions {
  basket: BasketItem[];
  location: UserLocation;
  mode: BasketOptimizeMode;
  transport: TransportMode;
  contacted?: Record<string, ContactOutcome>;
  installmentOnly?: boolean;
  excludeStores?: string[]; // removed by user / failed stores
  forcedOrder?: string[]; // manual reorder
}

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

function candidatesFor(
  productId: string,
  contacted: Record<string, ContactOutcome>,
  installmentOnly: boolean,
  excludeStores: string[]
): Cand[] {
  const product = getProduct(productId);
  if (!product) return [];
  const out: Cand[] = [];
  for (const s of STORES) {
    if (excludeStores.includes(s.id)) continue;
    const stock = getStoreStock(s.id, productId, product.priceFrom);
    if (!stock) continue;
    if (installmentOnly && !s.installment.verified) continue;
    let price = stock.price;
    const c = contacted[s.id];
    if (c?.kind === "price_changed" && c.newPrice) price = c.newPrice;
    out.push({
      storeId: s.id,
      price,
      status: stock.status,
      effPrice: price * (1 + STATUS_EFF_PCT[stock.status]),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Route ordering (NN + 2-opt)                                         */
/* ------------------------------------------------------------------ */

function orderStores(storeIds: string[], start: UserLocation): string[] {
  if (storeIds.length <= 1) return [...storeIds];
  const pt = (id: string) => STORES.find((s) => s.id === id)!;
  const remaining = new Set(storeIds);
  const order: string[] = [];
  let cur: { lat: number; lng: number } = start;
  while (remaining.size) {
    let bestId = "";
    let bestD = Infinity;
    for (const id of remaining) {
      const d = haversineKm(cur, pt(id));
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    }
    order.push(bestId);
    remaining.delete(bestId);
    cur = pt(bestId);
  }
  const improved = [...order];
  let better = true;
  let passes = 0;
  while (better && passes < 3) {
    better = false;
    passes++;
    for (let i = 0; i < improved.length - 1; i++) {
      for (let j = i + 1; j < improved.length; j++) {
        const candidate = [
          ...improved.slice(0, i + 1),
          ...improved.slice(i + 1, j + 1).reverse(),
          ...improved.slice(j + 1),
        ];
        if (legLen(candidate) < legLen(improved) - 1e-9) {
          improved.splice(0, improved.length, ...candidate);
          better = true;
        }
      }
    }
  }
  return improved;

  function legLen(seq: string[]): number {
    let d = haversineKm(start, pt(seq[0]));
    for (let i = 0; i < seq.length - 1; i++) d += haversineKm(pt(seq[i]), pt(seq[i + 1]));
    return d;
  }
}

/* ------------------------------------------------------------------ */
/* Plan evaluation                                                     */
/* ------------------------------------------------------------------ */

function legMin(km: number, transport: TransportMode): number {
  const base = (km / SPEED_KMH[transport]) * 60;
  return Math.max(1, Math.round(base + (transport === "transit" ? TRANSIT_FIXED_MIN : 0)));
}

function evalAssignment(
  lines: AssignItem[],
  location: UserLocation,
  transport: TransportMode,
  contacted: Record<string, ContactOutcome>,
  forcedOrder?: string[]
): PlanEval {
  const byStore = new Map<string, AssignItem[]>();
  for (const l of lines) {
    const arr = byStore.get(l.storeId) ?? [];
    arr.push(l);
    byStore.set(l.storeId, arr);
  }
  const storeIds = [...byStore.keys()];
  const order =
    forcedOrder?.length
      ? forcedOrder.filter((id) => byStore.has(id))
      : orderStores(storeIds, location);

  const { hour, minutes } = tehranNow();
  let clockMin = hour * 60 + minutes;
  let distanceKm = 0;
  let travelMin = 0;
  let shopMin = 0;
  let waitMin = 0;
  let closedStops = 0;

  let prev: { lat: number; lng: number } = location;
  for (const sid of order) {
    const store = STORES.find((s) => s.id === sid)!;
    const items = byStore.get(sid)!;
    const km = haversineKm(prev, store);
    const lm = legMin(km, transport);
    distanceKm += km;
    travelMin += lm;
    clockMin += lm;
    const arriveH = (clockMin / 60) % 24;
    if (!(arriveH >= store.openHour && arriveH < store.closeHour)) closedStops += 1;
    const sm = SHOP_BASE_MIN + SHOP_EXTRA_MIN * (items.length - 1);
    const noAnswerExtra = contacted[sid]?.kind === "no_answer" ? NO_ANSWER_EXTRA_MIN : 0;
    const wm = Math.min(
      15,
      Math.max(...items.map((it) => WAIT_BY_STATUS[it.status])) + noAnswerExtra
    );
    shopMin += sm;
    waitMin += wm;
    clockMin += sm + wm;
    prev = store;
  }

  const productCost = lines.reduce((a, l) => a + l.price * l.quantity, 0);
  const unconfirmed = lines.filter((l) => l.status !== "confirmed").length;

  return {
    assignment: lines,
    storeIds,
    order,
    productCost,
    distanceKm: Math.round(distanceKm * 10) / 10,
    travelMin,
    shopMin,
    waitMin,
    unconfirmed,
    closedStops,
    stopCount: storeIds.length,
    costRaw: 0,
    score: 0,
  };
}

function scorePool(pool: PlanEval[], mode: BasketOptimizeMode): PlanEval[] {
  if (pool.length === 0) return pool;
  const extent = (key: keyof Pick<PlanEval, "travelMin" | "distanceKm" | "productCost" | "unconfirmed" | "closedStops" | "stopCount">) =>
    ({
      lo: Math.min(...pool.map((p) => p[key])),
      hi: Math.max(...pool.map((p) => p[key])),
    }) as { lo: number; hi: number };
  const extT = extent("travelMin");
  const extD = extent("distanceKm");
  const extC = extent("productCost");
  const extR = extent("unconfirmed");
  const extH = extent("closedStops");
  const extS = extent("stopCount");
  const norm = (x: number, e: { lo: number; hi: number }) =>
    e.hi - e.lo < 1e-9 ? 0 : (x - e.lo) / (e.hi - e.lo);
  const w = WEIGHTS[mode];
  for (const p of pool) {
    p.costRaw =
      w.wT * norm(p.travelMin, extT) +
      w.wD * norm(p.distanceKm, extD) +
      w.wC * norm(p.productCost, extC) +
      w.wR * norm(p.unconfirmed, extR) +
      w.wH * norm(p.closedStops, extH);
    if (mode === "fewest_stops") {
      p.costRaw = 0.5 * norm(p.stopCount, extS) + 0.5 * p.costRaw;
    }
    p.score = Math.max(0, Math.min(100, Math.round(100 * (1 - p.costRaw))));
  }
  return pool;
}

/* ------------------------------------------------------------------ */
/* Plan generation                                                     */
/* ------------------------------------------------------------------ */

function buildPool(opts: PlanOptions, mode: BasketOptimizeMode): PlanEval[] {
  const contacted = opts.contacted ?? {};
  const excludeStores = opts.excludeStores ?? [];
  const lines = opts.basket.slice(0, 8);
  const candLists = lines.map((it) =>
    candidatesFor(it.productId, contacted, opts.installmentOnly ?? false, excludeStores)
  );
  const union: string[] = [];
  for (const cl of candLists)
    for (const c of cl) if (!union.includes(c.storeId)) union.push(c.storeId);
  if (union.length === 0 || union.length > 10) return [];

  const pool: PlanEval[] = [];
  const n = union.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(union[i]);
    const subsetSet = new Set(subset);
    const assign: AssignItem[] = [];
    let feasible = true;
    for (let li = 0; li < lines.length; li++) {
      const cands = candLists[li].filter((c) => subsetSet.has(c.storeId));
      if (cands.length === 0) {
        feasible = false;
        break;
      }
      const best = cands.reduce((a, b) => (b.effPrice < a.effPrice ? b : a));
      assign.push({
        productId: lines[li].productId,
        quantity: lines[li].quantity,
        storeId: best.storeId,
        price: best.price,
        status: best.status,
      });
    }
    if (!feasible) continue;
    pool.push(evalAssignment(assign, opts.location, opts.transport, contacted));
    if (pool.length > 4000) break; // hard safety cap
  }
  return scorePool(pool, mode);
}

function pickBest(pool: PlanEval[], mode: BasketOptimizeMode): PlanEval | undefined {
  if (!pool.length) return undefined;
  return [...pool].sort((a, b) =>
    mode === "fewest_stops"
      ? a.stopCount - b.stopCount || a.costRaw - b.costRaw
      : a.costRaw - b.costRaw
  )[0];
}

/* ------------------------------------------------------------------ */
/* Persian trade-off text                                              */
/* ------------------------------------------------------------------ */

/** "X گران‌تر ولی یک توقف کمتر و حدود N دقیقه زمان کمتر" — only true clauses. */
function compareParts(rec: PlanEval, alt: PlanEval): string {
  const parts: string[] = [];
  const dC = alt.productCost - rec.productCost;
  const dT = alt.travelMin - rec.travelMin;
  const dS = alt.stopCount - rec.stopCount;
  const dD = alt.distanceKm - rec.distanceKm;
  const dR = alt.unconfirmed - rec.unconfirmed;
  if (dS !== 0) parts.push(`${toFaDigits(Math.abs(dS))} توقف ${dS > 0 ? "بیشتر" : "کمتر"}`);
  if (Math.abs(dT) >= 3)
    parts.push(`حدود ${toFaDigits(Math.abs(dT))} دقیقه ${dT > 0 ? "زمان بیشتر" : "زمان کمتر"}`);
  if (Math.abs(dC) >= 20_000)
    parts.push(`${formatTomanShort(Math.abs(dC))} ${dC > 0 ? "گران‌تر" : "ارزون‌تر"}`);
  if (Math.abs(dD) >= 0.5)
    parts.push(
      `${toFaDigits(Math.abs(dD).toFixed(1).replace(".", "٫"))} کیلومتر ${dD > 0 ? "مسیر بیشتر" : "مسیر کمتر"}`
    );
  if (dR !== 0)
    parts.push(`${toFaDigits(Math.abs(dR))} قلم موجودی ${dR > 0 ? "کمتر مطمئن" : "مطمئن‌تر"}`);
  return parts.join(" و ");
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface PlanResult {
  plan: RoutePlan;
}

export function planRoute(opts: PlanOptions): PlanResult | null {
  if (opts.forcedOrder?.length) return planForcedOrder(opts);

  const pool = buildPool(opts, opts.mode);
  const best = pickBest(pool, opts.mode);
  if (!best) return null;

  // alternatives from other modes (deduped by store-set signature)
  const sig = (p: PlanEval) => [...p.storeIds].sort().join("|");
  const seen = new Set<string>([sig(best)]);
  const altEvals: Array<{ mode: BasketOptimizeMode; eval: PlanEval }> = [];
  for (const m of ["cheapest", "fastest", "fewest_stops", "balanced"] as BasketOptimizeMode[]) {
    if (m === opts.mode) continue;
    const p = pickBest(buildPool(opts, m), m);
    if (!p) continue;
    const s = sig(p);
    if (seen.has(s)) continue;
    seen.add(s);
    altEvals.push({ mode: m, eval: p });
  }
  altEvals.sort((a, b) => b.eval.score - a.eval.score);
  const topAlts = altEvals.slice(0, 2);

  const stops = buildStops(best, opts);
  const changes = buildChanges(best, opts, stops);

  const alternatives: PlanAlternative[] = topAlts.map(({ mode, eval: e }, i) => {
    const cmp = compareParts(best, e);
    return {
      planId: i === 0 ? "B" : "C",
      mode,
      label: MODE_FA[mode],
      totalProductCost: e.productCost,
      totalTravelMin: e.travelMin,
      totalDistanceKm: e.distanceKm,
      stopCount: e.stopCount,
      unconfirmedCount: e.unconfirmed,
      closedCount: e.closedStops,
      score: e.score,
      tradeoff: cmp ? `نسبت به برنامه A: ${cmp}` : "اختلاف معناداری با برنامه A ندارد.",
    };
  });

  // the recommended plan's headline trade-off, vs the most meaningful alternative
  const meaningful = topAlts.find((a) => a.eval.stopCount !== best.stopCount) ?? topAlts[0];
  let tradeoff = "این ترکیب بهترین توازن وزن‌های انتخابی شماست.";
  if (meaningful) {
    const cmp = compareParts(best, meaningful.eval);
    if (cmp) tradeoff = `تفاوت با «${MODE_FA[meaningful.mode]}»: ${cmp}.`;
  }

  const plan: RoutePlan = {
    planId: `plan-${opts.mode}-${sig(best).slice(0, 16)}`,
    mode: opts.mode,
    transport: opts.transport,
    startLocation: opts.location,
    stops,
    unassigned: buildUnassigned(opts),
    totalProductCost: best.productCost,
    totalDistanceKm: best.distanceKm,
    totalTravelMin: best.travelMin,
    totalShopMin: best.shopMin,
    totalWaitMin: best.waitMin,
    score: best.score,
    tradeoff,
    methodology:
      "فاصله‌ها واقعی‌اند (هَورساین روی مختصات واقعی) و زمان سفر برآورد نمایشی است: ماشین ۲۰، مترو ۱۵ و پیاده ۴٫۵ کیلومتر بر ساعت. امتیاز برنامه، مجموع وزن‌دار و نرمال‌شده‌ی زمان، مسافت، هزینه، ریسک موجودی و ساعات کاری است.",
    alternatives,
    generatedAt: Date.now(),
    changes,
  };
  return { plan };
}

/** Manual reorder: same assignment, user order, recomputed legs/ETAs. */
function planForcedOrder(opts: PlanOptions): PlanResult | null {
  const contacted = opts.contacted ?? {};
  const excludeStores = opts.excludeStores ?? [];
  const lines = opts.basket.slice(0, 8);
  const assign: AssignItem[] = [];
  for (const it of lines) {
    const cands = candidatesFor(it.productId, contacted, opts.installmentOnly ?? false, excludeStores);
    // keep stores in the user's order when possible
    const inOrder = cands.filter((c) => opts.forcedOrder!.includes(c.storeId));
    if (inOrder.length === 0) return null;
    const best = inOrder.reduce((a, b) => (b.effPrice < a.effPrice ? b : a));
    assign.push({
      productId: it.productId,
      quantity: it.quantity,
      storeId: best.storeId,
      price: best.price,
      status: best.status,
    });
  }
  const evalRes = evalAssignment(assign, opts.location, opts.transport, contacted, opts.forcedOrder);
  const stops = buildStops(evalRes, opts);
  const plan: RoutePlan = {
    planId: `plan-manual-${Date.now()}`,
    mode: opts.mode,
    transport: opts.transport,
    startLocation: opts.location,
    stops,
    unassigned: buildUnassigned(opts),
    totalProductCost: evalRes.productCost,
    totalDistanceKm: evalRes.distanceKm,
    totalTravelMin: evalRes.travelMin,
    totalShopMin: evalRes.shopMin,
    totalWaitMin: evalRes.waitMin,
    score: 0,
    tradeoff: "ترتیب دستی شما روی ایستگاه‌ها اعمال شد؛ زمان و مسافت دوباره حساب شدند.",
    methodology:
      "فاصله‌ها واقعی‌اند (هَورساین روی مختصات واقعی) و زمان سفر برآورد نمایشی است: ماشین ۲۰، مترو ۱۵ و پیاده ۴٫۵ کیلومتر بر ساعت.",
    alternatives: [],
    generatedAt: Date.now(),
    changes: ["ترتیب ایستگاه‌ها با جابه‌جایی دستی شما به‌روز شد."],
  };
  return { plan };
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function buildStops(e: PlanEval, opts: PlanOptions): RouteStop[] {
  const contacted = opts.contacted ?? {};
  const byStore = new Map<string, AssignItem[]>();
  for (const l of e.assignment) {
    const arr = byStore.get(l.storeId) ?? [];
    arr.push(l);
    byStore.set(l.storeId, arr);
  }
  const { hour, minutes } = tehranNow();
  let clockMin = hour * 60 + minutes;
  let prev: { lat: number; lng: number } = opts.location;

  return e.order.map((sid, idx) => {
    const store = STORES.find((s) => s.id === sid)!;
    const items = byStore.get(sid)!;
    const km = haversineKm(prev, store);
    const lm = legMin(km, opts.transport);
    clockMin += lm;
    const arriveH = (clockMin / 60) % 24;
    const open = arriveH >= store.openHour && arriveH < store.closeHour;
    const hh = Math.floor(arriveH);
    const mm = Math.floor((arriveH - hh) * 60);
    const etaLabel = `${toFaDigits(String(hh).padStart(2, "0"))}:${toFaDigits(String(mm).padStart(2, "0"))}`;
    const sm = SHOP_BASE_MIN + SHOP_EXTRA_MIN * (items.length - 1);
    const noAnswerExtra = contacted[sid]?.kind === "no_answer" ? NO_ANSWER_EXTRA_MIN : 0;
    const wm = Math.min(
      15,
      Math.max(...items.map((it) => WAIT_BY_STATUS[it.status])) + noAnswerExtra
    );
    clockMin += sm + wm;
    prev = store;
    return {
      order: idx + 1,
      storeId: sid,
      storeName: store.name,
      area: store.area,
      address: store.address,
      lat: store.lat,
      lng: store.lng,
      items: items.map((it) => {
        const p = getProduct(it.productId);
        return {
          productId: it.productId,
          productName: p?.name ?? it.productId,
          quantity: it.quantity,
          price: it.price,
          stockStatus: it.status,
          stockLabel: STOCK_METHOD[it.status] ?? stockLabelFa(it.status),
          verifiedAt: getStoreStock(sid, it.productId, p?.priceFrom ?? 0)?.verifiedAt ?? null,
          installmentVerified: store.installment.verified,
        };
      }),
      subtotal: items.reduce((a, it) => a + it.price * it.quantity, 0),
      openNow: open,
      hoursLabel: `${toFaDigits(store.openHour)} تا ${toFaDigits(store.closeHour)}`,
      etaLabel,
      closedAtArrival: !open,
      legKm: Math.round(km * 10) / 10,
      legMin: lm,
      shopMin: sm,
      waitingMin: wm,
      clusterLabel: STORE_CLUSTER[sid] ?? store.area,
    };
  });
}

function buildUnassigned(opts: PlanOptions): RoutePlan["unassigned"] {
  const excludeStores = opts.excludeStores ?? [];
  const out: RoutePlan["unassigned"] = [];
  for (const it of opts.basket.slice(0, 8)) {
    const cands = candidatesFor(
      it.productId,
      opts.contacted ?? {},
      opts.installmentOnly ?? false,
      excludeStores
    );
    if (cands.length === 0) {
      const p = getProduct(it.productId);
      const reason = excludeStores.length
        ? `به‌جز فروشگاه‌های حذف‌شده، فروشگاه دیگری برای «${p?.name}» در داده فعلی ثبت نشده است.`
        : `برای «${p?.name}» هیچ فروشگاهی در داده فعلی موجودی حضوری ثبت نکرده است.`;
      out.push({ productId: it.productId, productName: p?.name ?? it.productId, reason });
    }
  }
  return out;
}

function buildChanges(e: PlanEval, opts: PlanOptions, stops: RouteStop[]): string[] {
  const changes: string[] = [];
  const contacted = opts.contacted ?? {};
  for (const sid of e.order) {
    const c = contacted[sid];
    const store = STORES.find((s) => s.id === sid);
    if (!store || !c) continue;
    if (c.kind === "no_answer")
      changes.push(`${store.name} در تماس قبلی پاسخ نداد؛ زمان بیشتری برای استعلام دوباره در نظر گرفته شد.`);
    if (c.kind === "price_changed" && c.newPrice)
      changes.push(`قیمت جدید ${store.name} (${formatTomanShort(c.newPrice)}) در محاسبه اعمال شد.`);
    if (c.kind === "closed")
      changes.push(`${store.name} هنگام تماس بسته بود؛ پیشنهاد جایگزین آماده است.`);
  }
  for (const stop of stops) {
    if (stop.closedAtArrival)
      changes.push(
        `${stop.storeName} در زمان رسیدن تخمینی (${stop.etaLabel}) بسته است؛ اگر ساعات دیگری می‌روید، مسیر را دوباره حساب کنید.`
      );
  }
  if (opts.excludeStores?.length) {
    for (const sid of opts.excludeStores) {
      const s = STORES.find((st) => st.id === sid);
      if (s) changes.push(`${s.name} از مسیر حذف شد.`);
    }
  }
  return changes.slice(0, 6);
}
