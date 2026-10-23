"use client";

/**
 * BasketBar — persistent, compact basket summary accessible within the chat.
 * Sits above the composer (like the compare bar) and opens a bottom sheet
 * with the full editor: qty steppers, removal, mode/transport, route CTA.
 * Always renders the latest server-resolved BasketView (single source of
 * truth is the server, never local arithmetic).
 */
import { ShoppingBag, ChevronLeft, Trash2 } from "lucide-react";
import type { ActionRequestType, BasketView } from "@/lib/types";
import { formatTomanShort, toFaDigits } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SafeImage } from "@/components/generative/ui";

const MODE_LABEL: Record<string, string> = {
  fastest: "سریع‌ترین",
  cheapest: "کم‌هزینه‌ترین",
  fewest_stops: "کمترین توقف",
  balanced: "متعادل",
};

const TRANSPORT_LABEL: Record<string, string> = { car: "ماشین", walk: "پیاده", transit: "مترو/اتوبوس" };

export function BasketBar({
  basketView,
  onAction,
  onPlanRoute,
  busy,
}: {
  basketView: BasketView;
  onAction: (type: ActionRequestType, payload: Record<string, unknown>, label?: string) => void;
  onPlanRoute: () => void;
  busy: boolean;
}) {
  if (!basketView.items.length) return null;
  const count = basketView.items.reduce((a, i) => a + i.quantity, 0);

  return (
    <div className="border-t border-border/70 bg-background/95 px-3 py-2 backdrop-blur">
      <Sheet>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <SheetTrigger asChild>
            <button
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-0.5 text-right transition-colors hover:bg-secondary/40"
              aria-label="باز کردن سبد خرید"
            >
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <ShoppingBag className="size-4.5 text-primary" aria-hidden />
                <span className="absolute -top-1 -left-1 flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-4 text-white">
                  {toFaDigits(count)}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-5 text-foreground">
                  سبد خرید · {formatTomanShort(basketView.estimatedTotal)}
                </span>
                <span className="block truncate text-xs leading-5 text-muted-foreground">
                  {toFaDigits(basketView.items.length)} قلم · {MODE_LABEL[basketView.optimizeMode]} ·{" "}
                  {TRANSPORT_LABEL[basketView.transport]}
                  {basketView.hasRoute ? " · مسیر آماده" : ""}
                </span>
              </span>
              <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </SheetTrigger>
          <Button
            size="sm"
            disabled={busy}
            onClick={onPlanRoute}
            className="h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold"
          >
            {basketView.hasRoute ? "محاسبه دوباره مسیر" : "چیدن مسیر"}
          </Button>
        </div>

        <SheetContent side="bottom" className="mx-auto max-w-3xl rounded-t-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-1 text-right">
            <SheetTitle className="text-sm font-semibold leading-6">سبد خرید هوشمند</SheetTitle>
          </SheetHeader>

          <div className="chat-scroll max-h-[52dvh] space-y-2 overflow-y-auto pl-0.5 pr-0.5">
            {basketView.items.map((it) => (
              <div key={it.productId} className="flex gap-2.5 rounded-xl border border-border/70 bg-secondary/30 p-2">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-white">
                  <SafeImage src={it.image} alt={it.name} fallbackLabel={it.brand.slice(0, 2)} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h6 className="line-clamp-2 text-xs font-medium leading-5 text-foreground">{it.name}</h6>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {it.assignment
                      ? `${it.assignment.storeName} · ${formatTomanShort(it.assignment.price)}`
                      : it.storeCount === 0
                        ? "فروشگاهی ثبت نشده"
                        : `بهترین قیمت ${formatTomanShort(it.bestPrice)}`}
                    {it.variant ? ` · ${it.variant}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => onAction("remove_from_basket", { productId: it.productId }, `حذف ${it.name}`)}
                    aria-label={`حذف ${it.name}`}
                    className="size-7 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                  <div className="flex items-center gap-1.5 text-xs font-semibold leading-5 tabular-nums text-foreground">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => onAction("update_basket_item", { productId: it.productId, quantity: it.quantity - 1 }, "تعداد")}
                      aria-label="کم کردن تعداد"
                      className="size-7 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      −
                    </Button>
                    {toFaDigits(it.quantity)}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy || it.quantity >= 10}
                      onClick={() => onAction("update_basket_item", { productId: it.productId, quantity: it.quantity + 1 }, "تعداد")}
                      aria-label="زیاد کردن تعداد"
                      className="size-7 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          <div className="flex items-center justify-between">
            <span className="text-sm leading-6 text-muted-foreground">جمع تخمینی</span>
            <span className="text-base font-bold leading-6 tabular-nums text-foreground">
              {formatTomanShort(basketView.estimatedTotal)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["fastest", "cheapest", "fewest_stops", "balanced"] as const).map((m) => (
              <Badge
                key={m}
                variant="outline"
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs leading-5 ${
                  basketView.optimizeMode === m
                    ? "border-primary/60 bg-primary/15 text-[#f2b8ba]"
                    : "border-border bg-secondary/60 text-muted-foreground"
                }`}
                onClick={() => !busy && onAction("recalculate_route", { mode: m }, `حالت: ${MODE_LABEL[m]}`)}
              >
                {MODE_LABEL[m]}
              </Badge>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={onPlanRoute} className="h-10 flex-1 rounded-xl text-xs font-semibold">
              {basketView.hasRoute ? "محاسبه دوباره مسیر" : "چیدن مسیر خرید"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onAction("clear_basket", {}, "خالی کردن سبد")}
              className="h-10 rounded-xl px-3 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              خالی کردن سبد
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
