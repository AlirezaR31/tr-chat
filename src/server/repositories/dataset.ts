/**
 * Dataset repository — mirrors TorobYar `app/repositories/dataset.py`.
 *
 * Single source of truth for all data access. Every agent tool, service
 * and REST route reads through this module, so the honesty guarantees
 * (no fabricated stock/price/coords, demo labels) are enforced in ONE
 * place instead of being scattered across call sites.
 *
 * TorobYar loads products/offers/shops CSVs into DataFrames; our dataset
 * is the typed catalog + store matrix (same three-table shape: products,
 * offers, shops).
 */
import { ALL_PRODUCTS, getProduct } from "@/lib/data/catalog";
import {
  STORES,
  getStore,
  getStoreStock,
  STORE_CLUSTER,
} from "@/lib/data/stores";
import type { Product, Store, UserLocation } from "@/lib/types";
import { haversineKm } from "@/lib/geo";

/** A product×shop offer row — same shape as TorobYar offers.csv joined shops.csv. */
export interface OfferRow {
  offerId: string;
  productId: string;
  storeId: string;
  storeName: string;
  storeArea: string;
  address: string;
  lat: number;
  lng: number;
  priceToman: number;
  stockStatus: "confirmed" | "reported" | "listing_only" | "unknown";
  installmentVerified: boolean;
  openHour: number;
  closeHour: number;
  cluster: string;
  /** always false — recorded/demo prices are never presented as live */
  priceIsLive: false;
  distanceType?: "straight_line";
  distanceKm?: number;
}

export interface DatasetStats {
  products: number;
  stores: number;
  offers: number;
}

export const dataset = {
  /** All products (sneakers + accessories). */
  products(): Product[] {
    return ALL_PRODUCTS;
  },

  product(id: string): Product | undefined {
    return getProduct(id);
  },

  stores(): Store[] {
    return STORES;
  },

  store(id: string): Store | undefined {
    return getStore(id);
  },

  /** All (store × product) offer rows for one product, price-sorted. */
  offersForProduct(productId: string): OfferRow[] {
    const product = getProduct(productId);
    if (!product) return [];
    const rows: OfferRow[] = [];
    for (const store of STORES) {
      const stock = getStoreStock(store.id, productId, product.priceFrom);
      if (!stock) continue;
      rows.push({
        offerId: `${store.id}:${productId}`,
        productId,
        storeId: store.id,
        storeName: store.name,
        storeArea: store.area,
        address: store.address,
        lat: store.lat,
        lng: store.lng,
        priceToman: stock.price,
        stockStatus: stock.status,
        installmentVerified: store.installment.verified,
        openHour: store.openHour,
        closeHour: store.closeHour,
        cluster: STORE_CLUSTER[store.id] ?? store.area,
        priceIsLive: false,
      });
    }
    return rows.sort((a, b) => a.priceToman - b.priceToman);
  },

  /** Offers within radius of the user — haversine straight-line distance,
   * explicitly disclosed as `distanceType: "straight_line"` (TorobYar rule:
   * never present straight-line as driving distance). */
  offersNearUser(
    productId: string,
    user: Pick<UserLocation, "lat" | "lng">,
    radiusKm: number
  ): OfferRow[] {
    return this.offersForProduct(productId)
      .map((row) => ({ ...row, distanceKm: haversineKm(user, { lat: row.lat, lng: row.lng }), distanceType: "straight_line" as const }))
      .filter((row) => row.distanceKm !== undefined && row.distanceKm <= Math.max(0, radiusKm))
      .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number) || a.priceToman - b.priceToman);
  },

  stats(): DatasetStats {
    let offers = 0;
    for (const p of ALL_PRODUCTS) offers += this.offersForProduct(p.id).length;
    return { products: ALL_PRODUCTS.length, stores: STORES.length, offers };
  },
};

export type { Product, Store };
