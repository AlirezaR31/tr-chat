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
/* Conversation context (persisted client-side, mirrored server-side)   */
/* ------------------------------------------------------------------ */

export type Stage =
  | "greeting"
  | "needs"
  | "recommendations"
  | "comparing"
  | "stores"
  | "contacting"
  | "installment";

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
  | { type: "demo_notice"; label: string };

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
  | "toggle_compare";

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
