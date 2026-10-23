/**
 * Shop service — mirrors TorobYar `app/services/shop_service.py`
 * (that file is empty in the reference repo, so this is the "built it
 * myself" part: one honest interface over stores/offers data).
 *
 * Rules carried over from TorobYar's prompt + tools:
 *   - recorded prices are NEVER presented as live (`priceIsLive: false`)
 *   - payment/installment data is "declared", not guaranteed
 *   - distances are straight-line haversine, disclosed as such
 */
import { dataset, type OfferRow } from "@/server/repositories/dataset";
import { isOpenNow } from "@/lib/agent/tools";
import type { UserLocation } from "@/lib/types";

export interface OfferView extends OfferRow {
  hoursLabel: string;
  openNow: boolean;
  /** Persian honesty note attached to every stock status */
  stockNoteFa: string;
}

const STOCK_NOTES: Record<OfferRow["stockStatus"], string> = {
  confirmed: "موجودی تاییدشده (آخرین استعلام ثبت‌شده)",
  reported: "گزارش فروشنده؛ به‌صورت مستقل تایید نشده",
  listing_only: "فقط آگهی؛ موجودی حضوری نامشخص",
  unknown: "وضعیت موجودی نامشخص",
};

function toView(row: OfferRow): OfferView {
  return {
    ...row,
    hoursLabel: `${row.openHour} تا ${row.closeHour}`,
    openNow: isOpenNow(row.openHour, row.closeHour),
    stockNoteFa: STOCK_NOTES[row.stockStatus],
  };
}

/** All offers for a product (price-sorted) — parity with get_product_offers. */
export function getProductOffers(productId: string, limit = 8): OfferView[] {
  return dataset.offersForProduct(productId).slice(0, Math.max(1, Math.min(limit, 50))).map(toView);
}

/** Offers near the user — parity with find_nearby_product_shops. */
export function getNearbyOffers(
  productId: string,
  user: Pick<UserLocation, "lat" | "lng">,
  radiusKm = 5,
  limit = 10
): OfferView[] {
  return dataset
    .offersNearUser(productId, user, radiusKm)
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map(toView);
}

/**
 * Shops with a declared in-person installment option — parity with
 * find_payment_shops. Declaration ≠ guaranteed eligibility; the status
 * string makes that explicit for the agent's reply.
 */
export function getInstallmentOffers(
  productId: string,
  limit = 10
): Array<OfferView & { paymentChannelStatus: "in_person_declared" | "unknown" }> {
  return dataset
    .offersForProduct(productId)
    .filter((row) => row.installmentVerified)
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((row) => ({
      ...toView(row),
      paymentChannelStatus: "in_person_declared" as const,
    }));
}

export const SHOP_SERVICE_NOTE =
  "گزینه پرداخت از داده‌های ثبت‌شده فروشگاه است؛ فعال بودن اقساط و موجودی حضوری باید پیش از خرید تایید شود.";
