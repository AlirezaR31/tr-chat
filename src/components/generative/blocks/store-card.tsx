"use client";

/**
 * StoreCard — name, area, price for the selected product, real distance,
 * hours/open state, honest stock status + verification timestamp, credit
 * eligibility, contact (simulated + labelled) and real OSM directions.
 */
import { Clock, Navigation, PhoneCall, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactOutcome, StoreCardData } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { StockStatus, VerificationTimestamp, CreditEligibilityBadge } from "@/components/generative/blocks/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const OUTCOME_META: Record<
  ContactOutcome["kind"],
  { label: string; cls: string }
> = {
  contacting: { label: "در حال تماس…", cls: "text-foreground bg-secondary" },
  confirmed: { label: "موجودی تایید شد", cls: "text-[#3ecf8e] bg-[rgba(47,179,107,0.13)]" },
  reported: { label: "گزارش فروشگاه", cls: "text-[#e6a23c] bg-[rgba(230,162,60,0.13)]" },
  no_answer: { label: "پاسخ نداد", cls: "text-[#f2a0a2] bg-[rgba(229,72,77,0.12)]" },
  closed: { label: "بسته بود", cls: "text-muted-foreground bg-secondary" },
  price_changed: { label: "قیمت تغییر کرد", cls: "text-[#e6a23c] bg-[rgba(230,162,60,0.13)]" },
};

export function StoreCard({
  store,
  index,
  selected,
  contacted,
  onSelect,
  onContact,
  contacting,
}: {
  store: StoreCardData;
  index: number;
  selected: boolean;
  contacted?: ContactOutcome | null;
  onSelect: (id: string) => void;
  onContact: (store: StoreCardData) => void;
  contacting: boolean;
}) {
  const outcome = contacted ?? store.contacted ?? null;
  const directionsUrl = `https://www.openstreetmap.org/directions?to=${store.lat},${store.lng}`;

  return (
    <Card
      onClick={() => onSelect(store.id)}
      className={cn(
        "cursor-pointer gap-0 rounded-2xl border p-3 py-3 transition-colors",
        selected
          ? "border-primary/60 ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/40"
      )}
      aria-label={`${store.name}، ${formatToman(store.price)}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none",
            selected ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
          )}
        >
          {index.toLocaleString("fa-IR")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h5 className="truncate text-sm font-semibold leading-6">{store.name}</h5>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs leading-5 text-muted-foreground">
              <Star className="size-3 fill-[#e6a23c] text-[#e6a23c]" aria-hidden />
              {store.rating.toLocaleString("fa-IR")}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-muted-foreground">
            {store.address}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-md bg-elevated px-1.5 text-sm font-bold leading-5 text-foreground">
              {formatToman(store.price)}
            </Badge>
            {outcome ? (
              <Badge variant="secondary" className={cn("rounded-md px-1.5 text-xs leading-4", OUTCOME_META[outcome.kind].cls)}>
                {OUTCOME_META[outcome.kind].label}
                {outcome.kind === "price_changed" && outcome.newPrice
                  ? ` · جدید: ${formatToman(outcome.newPrice)}`
                  : ""}
              </Badge>
            ) : (
              <StockStatus stock={store.stock} compact />
            )}
            <CreditEligibilityBadge installment={store.installment} />
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 rounded-md px-1.5 font-normal",
                store.openNow ? "text-foreground/85 bg-secondary" : "text-muted-foreground bg-secondary"
              )}
            >
              <Clock className="size-3" aria-hidden />
              {store.openNow ? `باز تا ${store.hoursLabel.split(" تا ")[1]}` : "بسته"}
            </Badge>
            <Badge variant="secondary" className="rounded-md bg-secondary px-1.5 font-normal text-foreground/85">
              {formatDistance(store.distanceKm)}
            </Badge>
          </div>

          <div className="mt-1">
            <VerificationTimestamp
              at={store.stock.verifiedAt}
              method={store.stock.method}
              prefix="منبع موجودی"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                if (!contacting) onContact(store);
              }}
              disabled={contacting}
              size="sm"
              className={cn(
                "h-9 flex-1 gap-1.5 rounded-xl px-3 text-xs font-semibold",
                contacting && "bg-secondary text-muted-foreground"
              )}
            >
              <PhoneCall className={cn("size-3.5", contacting && "animate-pulse")} aria-hidden />
              {contacting ? "در حال تماس…" : outcome ? "استعلام مجدد" : "استعلام موجودی"}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-xl border-border bg-secondary/60 px-3 text-xs font-medium text-foreground/90 hover:bg-secondary hover:text-foreground"
            >
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`مسیریابی به ${store.name}`}
              >
                <Navigation className="size-3.5" aria-hidden />
                مسیریابی
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
