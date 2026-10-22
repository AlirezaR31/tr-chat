/**
 * Deterministic Persian NLU — intent + entity extraction.
 *
 * Rule-based on purpose: zero latency, zero hallucination risk, fully
 * testable. Handles Persian digit variants (۰-۹ / 0-9), common misspellings
 * (تومن/تومان), and colloquial forms (ارزون، بگیرم، کجا).
 */
import type {
  ConversationContext,
  Gender,
  Priority,
  UseCase,
} from "@/lib/types";
import { toEnDigits } from "@/lib/format";

export type Intent =
  | "greet"
  | "search" // product discovery request
  | "refine" // preference/budget update mid-conversation
  | "compare"
  | "select_product"
  | "find_stores"
  | "cheapest_store"
  | "installment"
  | "contact_store"
  | "set_location"
  | "thanks"
  | "unknown";

export interface NluResult {
  intent: Intent;
  budgetMax?: number;
  gender?: Gender;
  useCase?: UseCase;
  priorities?: Priority[];
  locationName?: string;
  productRef?: string; // product id hint
  installmentOnly?: boolean;
  wantsCheapest?: boolean;
}

/* ------------------------------ helpers ------------------------------ */

/** Normalize colloquial Arabic chars, digits, spacing. */
export function normalize(text: string): string {
  return toEnDigits(text)
    .replace(/[يى]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/\u200c/g, " ") // ZWNJ -> space for matching
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

function parseBudgetMillion(num: number, unit: string): number {
  if (unit.startsWith("میلیون") || unit.startsWith("ملیون")) return Math.round(num * 1_000_000);
  if (unit.startsWith("هزار")) return Math.round(num * 1_000);
  return Math.round(num); // plain toman
}

function extractBudget(t: string): number | undefined {
  // "زیر ۴ میلیون", "کمتر از 3.5 میلیون تومان", "تا ۴ میلیون", "بودجه‌ام ۲ میلیونه"
  const patterns = [
    /(?:زیر|کمتر از|تا حداکثر|حداکثر|تا|بودجه(?:‌| )?(?:ام|م)?)\s*([\d.]+)\s*(میلیون|ملیون|هزار)?\s*(?:تومان|تومن)?/,
    /([\d.]+)\s*(میلیون|ملیون|هزار)\s*(?:تومان|تومن)?\s*(?:زیر|باشه|بودجه)?/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const num = parseFloat(m[1]);
      if (!Number.isNaN(num) && num > 0) {
        const unit = m[2] ?? "تومان";
        // bare "۴" in a shoe chat almost always means millions
        const budget = parseBudgetMillion(num, unit === "تومان" && num <= 20 ? "میلیون" : unit);
        if (budget >= 100_000 && budget <= 100_000_000) return budget;
      }
    }
  }
  return undefined;
}

const PRIORITY_WORDS: Array<{ words: string[]; p: Priority }> = [
  { words: ["راحت", "آرام", "نرم", "کوشینگ"], p: "comfort" },
  { words: ["ارزون", "ارزان", "قیمت", "اقتصادی", "کم‌هزینه", "به‌صرفه", "به صرفه"], p: "price" },
  { words: ["دوام", "مقاوم", "بادوام", "سخت"], p: "durability" },
  { words: ["استایل", "شیک", "زیبا", "مد", "فشن", "خوشگل", "ترند"], p: "style" },
];

function extractPriorities(t: string): Priority[] {
  const found: Priority[] = [];
  for (const { words, p } of PRIORITY_WORDS) {
    if (has(t, words) && !found.includes(p)) found.push(p);
  }
  return found;
}

/* ------------------------------ main parse ------------------------------ */

export function parseMessage(raw: string, ctx: ConversationContext): NluResult {
  const t = normalize(raw);
  const res: NluResult = {};

  // --- greetings / chit-chat
  if (/^(سلام|درود|هی|های|hi|hello)\b/.test(t) && t.length < 30) {
    res.intent = "greet";
    return res;
  }
  if (has(t, ["ممنون", "مرسی", "دستت درد", "thanks", "سپاس"])) {
    res.intent = "thanks";
    return res;
  }

  // --- entities first (budget, gender, use, priorities, location)
  res.budgetMax = extractBudget(t);
  if (has(t, ["مردانه", "مرد", "اقایون", "آقایون", "پسرانه"])) res.gender = "men";
  else if (has(t, ["زنانه", "زن", "خانم", "دخترانه"])) res.gender = "women";
  else if (has(t, ["یونیسکس", "اسپرت.unisex"])) res.gender = "unisex";

  if (has(t, ["ورزش", "دویدن", "بدنسازی", "باشگاه", "جیم", "دویدن", "فوتبال", "کتانی دویدن"])) res.useCase = "sport";
  else if (has(t, ["روزمره", "روزانه", "کاجوال", "پیاده روی", "پیاده‌روی", "استفاده روز"])) res.useCase = "daily";

  const pr = extractPriorities(t);
  if (pr.length) res.priorities = pr;

  // --- locations (Tehran neighborhoods)
  const LOCATIONS: Array<[string, string[]]> = [
    ["سعادت‌آباد", ["سعادت اباد", "سعادت‌اباد", "سعادت اباد"]],
    ["شهرک غرب", ["شهرک غرب", "شهرک", "دادمان"]],
    ["ونک", ["ونک"]],
    ["آرژانتین", ["ارژانتین", "آرژانتین"]],
    ["تجریش", ["تجریش"]],
    ["پاسداران", ["پاسداران"]],
    ["نیاوران", ["نیاوران"]],
    ["نارمک", ["نارمک"]],
    ["صادقیه", ["صادقیه", "آریاشهر"]],
    ["بازار بزرگ تهران", ["بازار", "بازار بزرگ"]],
    ["ولیعصر", ["ولیعصر", "ولی عصر"]],
    ["شریعتی", ["شریعتی"]],
  ];
  for (const [name, words] of LOCATIONS) {
    if (has(t, words)) {
      res.locationName = name;
      break;
    }
  }

  // --- installment / credit
  if (has(t, ["قسط", "اقساط", "اعتباری", "نسیه", "چک"])) {
    res.installmentOnly = true;
  }
  if (has(t, ["بدون قسط", "نقدی میخرم", "نقدی می‌خرم"])) res.installmentOnly = false;

  // --- intent by priority: compare > cheapest > stores > select > search
  const storeAskWords = ["کجا", "فروشگاه", "حضوری", "بخرم", "نزدیک", "آدرس", "شعبه", "انبار"];
  const compareWords = ["مقایسه", "فرق", "کدوم بهتر", "بهتره", "تفاوت", "چی بهتر"];
  const cheapestWords = ["ارزون ترین", "ارزان ترین", "کم ترین قیمت", "ارزون‌ترین", "ارزان‌ترین"];
  const productWords = ["بخر", "کتانی", "کفش", "اسنیکر", "پیشنهاد", "گزینه", "میخوام", "می خوام"];
  const selectionWords = ["همین", "همون", "همونو", "همینو", "بگیر", "انتخاب", "پسندیدم", "میخوام همین"];

  const hasProductContext = Boolean(
    ctx.selectedProductId ||
      ctx.recommendedIds.length > 0 ||
      ctx.stage === "recommendations" ||
      ctx.stage === "comparing" ||
      ctx.stage === "stores"
  );
  const mentionsProduct = has(t, productWords);

  if (has(t, compareWords) && hasProductContext) res.intent = "compare";
  else if (has(t, cheapestWords) && hasProductContext) res.intent = "cheapest_store";
  else if (has(t, cheapestWords)) {
    res.intent = "search";
    res.priorities = ["price"];
    res.wantsCheapest = true;
  } else if (res.installmentOnly && (hasProductContext || ctx.stage === "stores" || ctx.stage === "contacting"))
    res.intent = "installment";
  else if (has(t, storeAskWords) && (hasProductContext || !mentionsProduct))
    res.intent = "find_stores";
  else if (has(t, selectionWords) && hasProductContext) res.intent = "select_product";
  else if (has(t, ["قسط", "اقساط"]) && ctx.stage === "stores") res.intent = "installment";
  else if (mentionsProduct || has(t, ["لیست", "نمایش بده", "نشون بده"])) res.intent = "search";
  else res.intent = "unknown";

  // "کجا بخرمش" with product context wins over select
  if (res.intent === "select_product" && has(t, ["کجا", "فروشگاه", "حضوری"])) {
    res.intent = "find_stores";
  }

  // refine = any preference/budget signal in a later stage
  if (
    (res.budgetMax || res.gender || res.useCase || (res.priorities && res.priorities.length)) &&
    (ctx.stage === "recommendations" || ctx.stage === "comparing" || ctx.stage === "stores") &&
    res.intent === "search"
  ) {
    res.intent = "refine";
  }
  if (
    (res.budgetMax || res.gender || res.useCase || (res.priorities && res.priorities.length)) &&
    res.intent !== "compare" &&
    res.intent !== "find_stores" &&
    res.intent !== "cheapest_store" &&
    ctx.recommendedIds.length > 0
  ) {
    res.intent = "refine";
  }

  return res;
}
