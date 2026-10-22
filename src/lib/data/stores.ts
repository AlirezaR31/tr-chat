/**
 * DEMO STORES — clearly marked demonstration data.
 *
 * Store names are fictional sample shops, but each is pinned near a real,
 * well-known Tehran shopping area (Tirajhe, Palladium, Tiraje, Grand Bazaar…)
 * so the map, distances and directions are meaningful. Coordinates are
 * approximations of those real landmarks. Opening hours, stock states and
 * installment eligibility are synthetic demo fields.
 *
 * In production this module would be replaced by the real Torob store
 * dataset behind the same interface (lib/agent/tools.ts).
 */
import type { Store } from "@/lib/types";
import { getProduct } from "@/lib/data/catalog";

const now = Date.now();
const H = 3600_000;

export const STORES: Store[] = [
  {
    id: "sportland-tirajhe",
    name: "اسپرت‌لند تریجی",
    area: "سعادت‌آباد، تریجی",
    address: "سعادت‌آباد، بلوار دریا، مرکز خرید تریجی، طبقه دوم، واحد ۲۰۴",
    lat: 35.7831,
    lng: 51.3806,
    openHour: 10,
    closeHour: 22,
    contactScenario: "confirm",
    priceDeltaPct: 0,
    installment: {
      verified: true,
      provider: "طرح اقساطی بانک همکار (نمایشی)",
      verifiedAt: new Date(now - 26 * H).toISOString(),
    },
    rating: 4.6,
    stock: {},
  },
  {
    id: "sneaker-center-pasdaran",
    name: "کتانی‌سنتر پاسداران",
    area: "پاسداران",
    address: "خیابان پاسداران، نبش گلستان پنجم، مجتمع تجاری پاسداران، همکف",
    lat: 35.788,
    lng: 51.473,
    openHour: 11,
    closeHour: 21,
    contactScenario: "confirm",
    priceDeltaPct: -6,
    installment: { verified: false, claim: "قسطی — ادعای فروشگاه" },
    rating: 4.3,
    stock: {},
  },
  {
    id: "sport-market-palladium",
    name: "ورزشی مارکت پالادیوم",
    area: "فرمانیه، پالادیوم",
    address: "فرمانیه، خیابان لواسانی، مرکز خرید پالادیوم، طبقه اول",
    lat: 35.7957,
    lng: 51.4685,
    openHour: 10,
    closeHour: 23,
    contactScenario: "confirm",
    priceDeltaPct: 5,
    installment: {
      verified: true,
      provider: "اقساطی اعتباری‌کارت (نمایشی)",
      verifiedAt: new Date(now - 9 * H).toISOString(),
    },
    rating: 4.7,
    stock: {},
  },
  {
    id: "kafsh-donyaye-varzeshi-vanak",
    name: "کفش دنیای ورزش ونک",
    area: "ونک",
    address: "ونک، خیابان ملاصدرا، پلاک ۸۴، نرسیده به خیابان شیخ بهایی",
    lat: 35.757,
    lng: 51.4105,
    openHour: 10,
    closeHour: 21,
    contactScenario: "no_answer",
    priceDeltaPct: -3,
    installment: { verified: false, claim: "خرید اقساطی" },
    rating: 4.1,
    stock: {},
  },
  {
    id: "sneaker-hub-tajrish",
    name: "اسنیکر هاب تجریش",
    area: "تجریش",
    address: "تجریش، خیابان دربند، مجتمع نگین، طبقه دوم",
    lat: 35.8012,
    lng: 51.4344,
    openHour: 10,
    closeHour: 22,
    contactScenario: "price_changed",
    priceDeltaPct: 2,
    installment: { verified: false },
    rating: 4.4,
    stock: {},
  },
  {
    id: "varzeshi-aria-argentine",
    name: "فروشگاه ورزشی آریا",
    area: "آرژانتین",
    address: "میدان آرژانتین، خیابان احمد قصیر، پلاک ۱۲",
    lat: 35.7312,
    lng: 51.416,
    openHour: 9,
    closeHour: 20,
    contactScenario: "closed",
    priceDeltaPct: -1,
    installment: { verified: false },
    rating: 4.0,
    stock: {},
  },
  {
    id: "sport-house-shahrak",
    name: "اسپرت هاوس شهرک غرب",
    area: "شهرک غرب",
    address: "شهرک غرب، فاز ۲، بلوار دادمان، مجتمع صنم، واحد ۱۱",
    lat: 35.762,
    lng: 51.366,
    openHour: 11,
    closeHour: 21,
    contactScenario: "confirm",
    priceDeltaPct: 1,
    installment: {
      verified: true,
      provider: "طرح اقساطی فروشگاهی (نمایشی)",
      verifiedAt: new Date(now - 50 * H).toISOString(),
    },
    rating: 4.5,
    stock: {},
  },
  {
    id: "katani-land-narmak",
    name: "کتانی لند نارمک",
    area: "نارمک",
    address: "نارمک، میدان ۴۶، خیابان گلبرگ، پلاک ۵۶",
    lat: 35.742,
    lng: 51.51,
    openHour: 10,
    closeHour: 21,
    contactScenario: "confirm",
    priceDeltaPct: -4,
    installment: { verified: false },
    rating: 4.2,
    stock: {},
  },
  {
    id: "varzeshi-bazaar-markazi",
    name: "ورزشی بازار مرکزی",
    area: "بازار بزرگ تهران",
    address: "بازار بزرگ، راسته بازار کفاش‌ها، سرای امیر، پلاک ۲۷",
    lat: 35.672,
    lng: 51.421,
    openHour: 9,
    closeHour: 19,
    contactScenario: "confirm",
    priceDeltaPct: -8,
    installment: { verified: false },
    rating: 3.9,
    stock: {},
  },
  {
    id: "kafsh-rayka-sadeghieh",
    name: "کفش رایکا صادقیه",
    area: "صادقیه",
    address: "صادقیه، بلوار آیت‌الله کاشانی، مجتمع شهرزیبا، طبقه سوم",
    lat: 35.716,
    lng: 51.348,
    openHour: 10,
    closeHour: 22,
    contactScenario: "confirm",
    priceDeltaPct: -2,
    installment: { verified: false, claim: "پرداخت اقساطی بدون بهره" },
    rating: 4.0,
    stock: {},
  },
];

/* ------------------------------------------------------------------ */
/* Deterministic stock & price derivation per (store × product)        */
/* ------------------------------------------------------------------ */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Cycle of stock states so every status kind is realistically represented. */
const STOCK_CYCLE: Array<{
  status: "confirmed" | "reported" | "listing_only" | "unknown";
}> = [
  { status: "confirmed" },
  { status: "reported" },
  { status: "reported" },
  { status: "listing_only" },
  { status: "confirmed" },
  { status: "unknown" },
  { status: "reported" },
  { status: "confirmed" },
];

/** Verification method labels matching each status kind (honest wording). */
export const STOCK_METHOD: Record<string, string> = {
  confirmed: "استعلام مستقیم (نمایشی)",
  reported: "گزارش فروشنده",
  listing_only: "داده آگهی",
  unknown: null as unknown as string,
};

export function getStoreStock(storeId: string, productId: string, basePrice: number) {
  const store = STORES.find((s) => s.id === storeId);
  if (!store) return undefined;
  return deriveStock(store, productId, basePrice);
}

function deriveStock(store: Store, productId: string, basePrice: number) {
  const key = `${store.id}:${productId}`;
  const h = hashStr(key);
  const cycle = STOCK_CYCLE[h % STOCK_CYCLE.length];
  // price jitter: ±1.5% deterministic on top of store delta, rounded to 10 tomans
  const jitterPct = ((h % 7) - 3) * 0.5;
  const price =
    Math.round(
      (basePrice * (100 + store.priceDeltaPct + jitterPct)) / 100 / 10
    ) * 10;
  const verifiedAt =
    cycle.status === "confirmed"
      ? new Date(now - (2 + (h % 40)) * H).toISOString()
      : cycle.status === "reported"
        ? new Date(now - (5 + (h % 60)) * H).toISOString()
        : null;
  return {
    status: cycle.status,
    price,
    verifiedAt,
  };
}

/** Pre-derive the full matrix once (server memory). */
export function buildStockMatrix(productIds: string[]): void {
  for (const store of STORES) {
    for (const pid of productIds) {
      const product = getProduct(pid);
      if (product) store.stock[pid] = deriveStock(store, pid, product.priceFrom);
    }
  }
}

export function getStore(id: string): Store | undefined {
  return STORES.find((s) => s.id === id);
}
