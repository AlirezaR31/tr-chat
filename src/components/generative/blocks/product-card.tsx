"use client";

/**
 * ProductCard — compact mobile-first card matching the Torob reference:
 * light product shot, 2-line name, "از X تومان" + chevron.
 * Actions: compare toggle, details, store availability.
 */
import { ChevronLeft, GitCompareArrows, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { Pill, SafeImage } from "@/components/generative/ui";
import { ScoreBar } from "@/components/generative/ui";

export function ProductCard({
  product,
  inCompare,
  onToggleCompare,
  onDetails,
  onStores,
}: {
  product: ProductCardData;
  inCompare: boolean;
  onToggleCompare: (id: string) => void;
  onDetails: (p: ProductCardData) => void;
  onStores: (p: ProductCardData) => void;
}) {
  return (
    <article
      className={cn(
        "group relative w-[168px] shrink-0 snap-start rounded-2xl border bg-card p-2 transition-colors",
        inCompare ? "border-primary/70 ring-1 ring-primary/40" : "border-border"
      )}
      aria-label={product.name}
    >
      {/* compare toggle */}
      <button
        onClick={() => onToggleCompare(product.id)}
        aria-pressed={inCompare}
        aria-label={inCompare ? "حذف از مقایسه" : "افزودن به مقایسه"}
        className={cn(
          "absolute left-1.5 top-1.5 z-10 rounded-full p-1.5 backdrop-blur transition-colors",
          inCompare
            ? "bg-primary text-white"
            : "bg-black/45 text-white/85 hover:bg-black/65"
        )}
      >
        {inCompare ? <X className="size-3.5" /> : <GitCompareArrows className="size-3.5" />}
      </button>

      <button
        onClick={() => onDetails(product)}
        className="block w-full text-right"
        aria-label={`جزئیات ${product.name}`}
      >
        <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-xl bg-white">
          <SafeImage
            src={product.image}
            alt={product.name}
            fallbackLabel={product.brand.slice(0, 2)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
        <h5 className="mb-0.5 line-clamp-2 min-h-10 text-[12.5px] font-medium leading-[1.7] text-foreground">
          {product.name}
        </h5>
        <p className="mb-1.5 text-[11px] text-muted-foreground">سایز {product.sizes}</p>
      </button>

      <div className="mb-1.5 flex items-center gap-1.5">
        <ScoreBar value={product.matchScore} className="flex-1" highlight />
        <span className="text-[10.5px] tabular-nums text-muted-foreground">
          {product.matchScore}٪
        </span>
      </div>

      <button
        onClick={() => onStores(product)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-right transition-colors hover:bg-secondary/60"
        aria-label={`فروشگاه‌های ${product.name}`}
      >
        <span className="text-[12.5px] font-semibold text-foreground">
          از {formatToman(product.priceFrom).replace(" تومان", "")}{" "}
          <span className="text-[10.5px] font-normal text-muted-foreground">تومان</span>
        </span>
        <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
      </button>

      <div className="mt-1 flex items-center justify-between">
        <button
          onClick={() => onStores(product)}
          className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <MapPin className="size-3" aria-hidden />
          {product.storeCount} فروشگاه در تهران
        </button>
      </div>
    </article>
  );
}

export function ProductCarousel({
  products,
  compareIds,
  onToggleCompare,
  onDetails,
  onStores,
  title,
}: {
  products: ProductCardData[];
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onDetails: (p: ProductCardData) => void;
  onStores: (p: ProductCardData) => void;
  title?: string;
}) {
  return (
    <div className="my-1" role="list" aria-label={title ?? "پیشنهادهای محصول"}>
      {title ? (
        <div className="mb-1.5 px-0.5 text-[12px] font-semibold text-muted-foreground">{title}</div>
      ) : null}
      <div className="fade-x -mx-1 overflow-x-auto px-1 pb-2 no-scrollbar">
        <div className="flex w-max snap-x gap-2.5">
          {products.map((p) => (
            <div role="listitem" key={p.id}>
              <ProductCard
                product={p}
                inCompare={compareIds.includes(p.id)}
                onToggleCompare={onToggleCompare}
                onDetails={onDetails}
                onStores={onStores}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
