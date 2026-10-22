/**
 * Core domain types for the Torob Generative-UI shopping assistant.
 *
 * The agent (server) never returns HTML — it returns *structured blocks*.
 * Each block type is validated (zod, see lib/block-schema.ts) and rendered
 * by a controlled registry component (components/generative/registry.tsx).
 */

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export type Priority = "comfort" | "price" | "durability" | "style";
export type Criteria = Priority; // comparison criteria reuses priorities
export type UseCase = "daily" | "sport" | "any";
export type Gender = "men" | "women" | "unisex";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface UserLocation extends GeoPoint {
  name: string; // e.g. "سعادت‌آباد"
  source: "neighborhood" | "gps";
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export interface ProductSpecs {
  weightGrams: number;
  cushioning: 1 | 2 | 3 | 4 | 5;
  durability: 1 | 2 | 3 | 4 | 5;
  styleRating: 1 | 2 | 3 | 4 | 5;
  upper: string;
  drop: string;
  sole: string;
}

export type ProductKind = "sneaker" | "accessory";

export interface Product {
  id: string;
  name: string; // Persian display name
  brand: string; // Latin technical identifier
  model: string; // Latin model code
  image: string; // local /products/*.jpg
  gender: Gender;
  useCases: Exclude<UseCase, "any">[];
  priceFrom: number; // toman
  specs: ProductSpecs;
  highlights: string[]; // short "why it matches" lines
  sizes: string;
  sourceCount: number; // demo: number of listing sources aggregated
  /** sneaker (default) or accessory (complementary item) */
  kind?: ProductKind;
  /** Persian category label used in basket/recs ("لوازم جانبی کتانی") */
  categoryFa?: string;
  /**
   * Accessories: explicit demo availability — ONLY these stores carry the item.
   * Sneakers: undefined → availability derived from the store×product matrix.
   * This keeps "is it stocked nearby?" claims honest by construction.
   */
  availableAt?: string[];
}

/** Product data as delivered inside cards (subset + store summary). */
export interface ProductCardData {
  id: string;
  name: string;
  brand: string;
  model: string;
  image: string;
  priceFrom: number;
  specs: ProductSpecs;
  highlights: string[];
  sizes: string;
  gender: Gender;
  useCases: Exclude<UseCase, "any">[];
  storeCount: number;
  matchScore: number; // 0–100, methodology: see scoring.ts
  matchReason: string;
  kind?: ProductKind;
  categoryFa?: string;
}

/* ------------------------------------------------------------------ */
/* Stores                                                              */
/* ------------------------------------------------------------------ */

export type StockStatusKind =
  | "confirmed" // independently verified
  | "reported" // store reported, not independently verified
  | "listing_only" // listing data only
  | "unknown";

export interface StockInfo {
  status: StockStatusKind;
  verifiedAt: string | null; // ISO
  method: string | null; // verification method label
}

export interface InstallmentInfo {
  verified: boolean;
  provider?: string;
  verifiedAt?: string | null;
  claim?: string; // unverified promotional claim
}

export interface Store {
  id: string;
  name: string;
  area: string; // neighborhood
  address: string;
  lat: number;
  lng: number;
  openHour: number; // 10
  closeHour: number; // 22
  /** deterministic contact-outcome scenario used by the contact simulator */
  contactScenario: "confirm" | "no_answer" | "closed" | "price_changed";
  /** price multiplier + offset so prices differ per store */
  priceDeltaPct: number; // e.g. -4 => 4% cheaper
  installment: InstallmentInfo;
  rating: number; // 3.8 – 4.9 (demo)
  stock: Record<string, { status: StockStatusKind; price: number; verifiedAt: string | null }>;
}

export interface StoreCardData {
  id: string;
  name: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  price: number;
  distanceKm: number;
  openNow: boolean;
  hoursLabel: string;
  stock: StockInfo;
  installment: InstallmentInfo;
  rating: number;
  contacted?: ContactOutcome | null;
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

export interface ComparisonAttribute {
  label: string;
  value: string; // display value
  score: number; // 0–1 relative (1 = best in set)
}

export interface ComparisonEntry {
  productId: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  scores: Record<Criteria, number>; // 0–100
  attributes: ComparisonAttribute[];
  pros: string[];
  cons: string[];
}

export interface ComparisonData {
  entries: ComparisonEntry[];
  /** overall winner per criteria (computed with the documented methodology) */
  winnerBy: Record<Criteria, string>;
  methodology: string;
  contextSummary: string;
  /** the criteria this comparison was generated with (initial tab) */
  criteria?: Criteria;
}

/* ------------------------------------------------------------------ */
/* Contact / verification                                              */
/* ------------------------------------------------------------------ */

export type ContactOutcomeKind =
  | "contacting"
  | "confirmed"
  | "reported"
  | "no_answer"
  | "closed"
  | "price_changed";

export interface ContactOutcome {
  kind: ContactOutcomeKind;
  at: number; // epoch ms
  method: string;
  note: string;
  newPrice?: number;
}

/* ------------------------------------------------------------------ */
/* Smart Shopping Basket                                               */
/* ------------------------------------------------------------------ */

export type BasketOptimizeMode = "fastest" | "cheapest" | "fewest_stops" | "balanced";
export type TransportMode = "car" | "walk" | "transit";

export interface BasketItem {
  productId: string;
  quantity: number; // ≥1
  targetPrice?: number; // user's target price (toman), optional
  addedAt: number; // epoch ms
  /** Persian variant note, e.g. "سایز ۴۲" — display only */
  variant?: string;
}

export type AssignmentConfidence = StockStatusKind | "unassigned";

/** One basket row as rendered in the UI (prices resolved server-side). */
export interface BasketItemView {
  productId: string;
  name: string;
  brand: string;
  model: string;
  image: string;
  kind: ProductKind;
  categoryFa?: string;
  quantity: number;
  variant?: string;
  targetPrice?: number;
  /** best current unit price across candidate stores (base, before assignment) */
  bestPrice: number;
  /** assigned store (from the active plan) */
  assignment?: {
    storeId: string;
    storeName: string;
    area: string;
    price: number; // unit price at that store
    confidence: AssignmentConfidence;
    openNow: boolean;
  } | null;
  /** number of stores carrying the item (0 = حضوری پیدا نشد) */
  storeCount: number;
  /** user-facing note (e.g. "فقط در ۱ فروشگاه", "موجودی تاییدنشده") */
  note?: string;
}

export interface BasketView {
  items: BasketItemView[];
  estimatedTotal: number; // sum over assignment ?? bestPrice × qty
  savingsVsMax: number; // how much cheaper than worst assignment (≥0)
  optimizeMode: BasketOptimizeMode;
  transport: TransportMode;
  hasRoute: boolean; // a plan has been generated in this conversation
  lastPlannedAt?: number;
}

/* ------------------------------------------------------------------ */
/* Contextual recommendations                                          */
/* ------------------------------------------------------------------ */

export type RecommendationKind = "complementary" | "nearby" | "basket_optimization";

export interface RecommendationItem {
  kind: RecommendationKind;
  product: ProductCardData;
  /** required short "why" — semantic relevance or dataset-backed availability */
  reason: string;
  /**
   * Dataset-backed availability at a specific store. null ⇒ semantic match
   * only: the UI must NOT imply the item is stocked anywhere.
   */
  availability: {
    storeId: string;
    storeName: string;
    area: string;
    price: number;
    stockStatus: StockStatusKind;
    distanceKm: number | null; // null when no user location yet
  } | null;
}

/* ------------------------------------------------------------------ */
/* Route planning                                                      */
/* ------------------------------------------------------------------ */

export interface RouteStopItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number; // unit price at this store
  stockStatus: StockStatusKind;
  stockLabel: string; // honest Persian label
  verifiedAt: string | null;
  installmentVerified: boolean;
}

export interface RouteStop {
  order: number; // 1-based visit order
  storeId: string;
  storeName: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  items: RouteStopItem[];
  subtotal: number;
  openNow: boolean;
  hoursLabel: string;
  /** estimated arrival time label (fa), when computable from now */
  etaLabel: string | null;
  closedAtArrival: boolean; // ETA outside opening hours — honest flag
  /** leg from previous stop (first stop: from start location) */
  legKm: number | null; // real haversine
  legMin: number | null; // disclosed estimate (see route-engine.ts)
  shopMin: number; // estimated time in-store
  waitingMin: number; // contact/verify buffer when stock unconfirmed
  clusterLabel: string; // e.g. "خوشه تریجی و شهرک غرب"
}

export interface PlanAlternative {
  planId: string; // "A" | "B" | "C"
  mode: BasketOptimizeMode;
  label: string; // Persian label
  totalProductCost: number;
  totalTravelMin: number;
  totalDistanceKm: number;
  stopCount: number;
  unconfirmedCount: number; // items whose stock is not confirmed
  closedCount: number; // stops closed at ETA
  score: number; // normalized transparent score 0–100 (see route-engine)
  tradeoff: string; // natural-language trade-off vs the recommended plan
}

export interface RoutePlan {
  planId: string;
  mode: BasketOptimizeMode;
  transport: TransportMode;
  startLocation: UserLocation;
  stops: RouteStop[];
  unassigned: { productId: string; productName: string; reason: string }[];
  totalProductCost: number;
  totalDistanceKm: number;
  totalTravelMin: number;
  totalShopMin: number;
  totalWaitMin: number;
  score: number; // 0–100
  /** the biggest trade-off, in Persian natural language */
  tradeoff: string;
  /** disclosed estimation methodology (honesty footnote) */
  methodology: string;
  alternatives: PlanAlternative[];
  generatedAt: number;
  /** bag degradations vs the previous plan, e.g. store became unavailable */
  changes: string[];
}

/* ------------------------------------------------------------------ */
/* Conversation context (persisted client-side, mirrored server-side)   */
/* ------------------------------------------------------------------ */

export type Stage =
  | "greeting"
  | "needs"
  | "recommendations"
  | "comparing"
  | "stores"
  | "contacting"
  | "installment"
  | "basket"
  | "routing";

export interface StoreFilters {
  sort: "price" | "distance" | "stock";
  installmentOnly: boolean;
  openNow: boolean;
  confirmedStockOnly: boolean;
}

export interface ConversationContext {
  category?: string;
  budgetMax?: number;
  gender?: Gender;
  useCase?: UseCase;
  priorities: Priority[];
  recommendedIds: string[];
  compareIds: string[];
  selectedProductId?: string;
  criteria: Criteria;
  location?: UserLocation;
  stage: Stage;
  storeFilters: StoreFilters;
  contacted: Record<string, ContactOutcome>;
  pendingIntent?: string;
  /* --- Smart Shopping Basket --- */
  basket: BasketItem[];
  optimizeMode: BasketOptimizeMode;
  transport: TransportMode;
  /** product ids the user dismissed from recommendations */
  dismissedRecs: string[];
  /** user muted contextual recommendations entirely */
  recsMuted: boolean;
  /** stores the user removed from the route (persist across recalcs) */
  excludedStoreIds: string[];
  /** product id of the last add (drives "complementary" recs) */
  lastAddedId?: string;
  lastPlannedAt?: number;
}

export const DEFAULT_CONTEXT: ConversationContext = {
  priorities: ["comfort", "price"],
  recommendedIds: [],
  compareIds: [],
  criteria: "comfort",
  stage: "greeting",
  storeFilters: {
    sort: "price",
    installmentOnly: false,
    openNow: false,
    confirmedStockOnly: false,
  },
  contacted: {},
  basket: [],
  optimizeMode: "balanced",
  transport: "car",
  dismissedRecs: [],
  recsMuted: false,
  excludedStoreIds: [],
};

/* ------------------------------------------------------------------ */
/* Generative-UI blocks                                                */
/* ------------------------------------------------------------------ */

export interface QuickReply {
  label: string;
  message?: string; // sends this as a user message
  action?: ActionRequest["type"]; // triggers an action instead
  payload?: Record<string, unknown>;
}

export type Block =
  | { type: "text"; text: string }
  | {
      type: "search_context";
      queryLabel: string;
      productCount: number;
      sourceCount: number;
      appliedFilters: string[];
    }
  | { type: "product_carousel"; products: ProductCardData[]; title?: string }
  | { type: "product_details"; product: ProductCardData }
  | { type: "comparison_panel"; comparison: ComparisonData }
  | { type: "preference_selector"; active: Priority[] }
  | {
      type: "store_panel";
      stores: StoreCardData[];
      productId: string;
      productName: string;
      location: UserLocation;
      filters: StoreFilters;
    }
  | { type: "contact_status"; storeName: string; productId: string; outcome: ContactOutcome }
  | {
      type: "alternative_stores";
      stores: StoreCardData[];
      productId: string;
      reason: string;
    }
  | { type: "empty_state"; title: string; description: string; replies: QuickReply[] }
  | { type: "quick_replies"; replies: QuickReply[] }
  | { type: "demo_notice"; label: string }
  /* --- Smart Shopping Basket blocks --- */
  | {
      type: "basket_summary";
      basket: BasketView;
      intro?: string;
    }
  | {
      type: "basket_recommendations";
      forProductId: string;
      forProductName: string;
      recs: RecommendationItem[];
      hint: string; // frequency-control / dismiss explainer
    }
  | { type: "route_plan"; plan: RoutePlan }
  | { type: "plan_comparison"; alternatives: PlanAlternative[]; mode: BasketOptimizeMode };

export interface ChatTurn {
  text?: string;
  blocks: Block[];
}

/* ------------------------------------------------------------------ */
/* API contracts                                                       */
/* ------------------------------------------------------------------ */

export type ActionRequestType =
  | "contact_store"
  | "update_context"
  | "select_product"
  | "toggle_compare"
  | "add_to_basket"
  | "remove_from_basket"
  | "update_basket_item"
  | "clear_basket"
  | "recalculate_route"
  | "remove_stop"
  | "move_stop"
  | "dismiss_recommendation"
  | "set_recs_muted";

export interface ActionRequest {
  type: ActionRequestType;
  payload: Record<string, unknown>;
}

export interface ChatRequestBody {
  sessionId: string;
  context: ConversationContext;
  message?: string;
  action?: ActionRequest;
}

export interface ChatResponseBody {
  turn: ChatTurn;
  context: ConversationContext;
  /** server-resolved basket snapshot (bar + editor always render this) */
  basketView?: BasketView;
}

/* ------------------------------------------------------------------ */
/* Client transcript                                                   */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "action";
  text?: string;
  blocks?: Block[];
  at: number;
  pending?: boolean;
  failed?: boolean;
}
