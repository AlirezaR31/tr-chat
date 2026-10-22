"use client";

/**
 * ProductCard — compact mobile-first card matching the Torob reference:
 * light product shot, 2-line name, "از X تومان" + chevron.
 * Actions: compare toggle, details, store availability.
 */
import { ChevronLeft, GitCompareArrows, MapPin, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";
import { formatToman, toFaDigits } from "@/lib/format";
import { SafeImage, ScoreBar } from "@/components/generative/ui";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ProductCard({
  product,
  inCompare,
  inBasket,
  onToggleCompare,
  onDetails,
  onStores,
  onAddToBasket,
}: {
  product: ProductCardData;
  inCompare: boolean;
  inBasket: boolean;
  onToggleCompare: (id: string) => void;
  onDetails: (p: ProductCardData) => void;
  onStores: (p: ProductCardData) => void;
  onAddToBasket: (p: ProductCardData) => void;
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleCompare(product.id)}
            aria-pressed={inCompare}
            aria-label={inCompare ? "حذف از مقایسه" : "افزودن به مقایسه"}
            className={cn(
              "absolute left-1.5 top-1.5 z-10 size-7 rounded-full backdrop-blur",
              inCompare
                ? "bg-primary text-white hover:bg-primary/90 hover:text-white"
                : "bg-black/45 text-white/85 hover:bg-black/65 hover:text-white"
            )}
          >
            {inCompare ? <X className="size-3.5" /> : <GitCompareArrows className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {inCompare ? "حذف از مقایسه" : "افزودن به مقایسه"}
        </TooltipContent>
      </Tooltip>

      <button
        onClick={() => onDetails(product)}
        className="block w-full text-right outline-none"
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
        {/* 2 lines at text-xs/leading-5 = exactly 40px — no clipped descenders */}
        <h5 className="mb-0.5 line-clamp-2 min-h-10 text-xs font-medium leading-5 text-foreground">
          {product.name}
        </h5>
        <p className="mb-1.5 text-xs leading-5 text-muted-foreground">سایز {product.sizes}</p>
      </button>

      <div className="mb-1.5 flex items-center gap-1.5">
        <ScoreBar value={product.matchScore} className="flex-1" highlight />
        <span className="text-xs leading-5 tabular-nums text-muted-foreground">
          {toFaDigits(product.matchScore)}٪
        </span>
      </div>

      <button
        onClick={() => onStores(product)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-right transition-colors hover:bg-secondary/60"
        aria-label={`فروشگاه‌های ${product.name}`}
      >
        <span className="text-sm font-semibold leading-6 text-foreground">
          از {formatToman(product.priceFrom).replace(" تومان", "")}{" "}
          <span className="text-xs font-normal leading-5 text-muted-foreground">تومان</span>
        </span>
        <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
      </button>

      <div className="mt-1 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onStores(product)}
          className="h-6 gap-1 rounded-lg px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <MapPin className="size-3" aria-hidden />
          {toFaDigits(product.storeCount)} فروشگاه در تهران
        </Button>
        <Button
          variant={inBasket ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onAddToBasket(product)}
          aria-label={inBasket ? `افزودن یکی دیگر از ${product.name} به سبد` : `افزودن ${product.name} به سبد`}
          className={
            inBasket
              ? "h-6 gap-1 rounded-lg bg-primary/15 px-1.5 text-xs text-[#f2b8ba] hover:bg-primary/25 hover:text-[#f2b8ba]"
              : "h-6 gap-1 rounded-lg px-1.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-[#f2b8ba]"
          }
        >
          <ShoppingBag className="size-3" aria-hidden />
          {inBasket ? "در سبد +" : "به سبد"}
        </Button>
      </div>
    </article>
  );
}

export function ProductCarousel({
  products,
  compareIds,
  basketIds,
  onToggleCompare,
  onDetails,
  onStores,
  onAddToBasket,
  title,
}: {
  products: ProductCardData[];
  compareIds: string[];
  basketIds: string[];
  onToggleCompare: (id: string) => void;
  onDetails: (p: ProductCardData) => void;
  onStores: (p: ProductCardData) => void;
  onAddToBasket: (p: ProductCardData) => void;
  title?: string;
}) {
  return (
    <div className="my-1" role="list" aria-label={title ?? "پیشنهادهای محصول"}>
      {title ? (
        <div className="mb-1.5 px-0.5 text-xs font-semibold leading-5 text-muted-foreground">{title}</div>
      ) : null}
      <div className="fade-x -mx-1 overflow-x-auto px-1 pb-2 no-scrollbar">
        <div className="flex w-max snap-x gap-2.5">
          {products.map((p) => (
            <div role="listitem" key={p.id}>
              <ProductCard
                product={p}
                inCompare={compareIds.includes(p.id)}
                inBasket={basketIds.includes(p.id)}
                onToggleCompare={onToggleCompare}
                onDetails={onDetails}
                onStores={onStores}
                onAddToBasket={onAddToBasket}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
