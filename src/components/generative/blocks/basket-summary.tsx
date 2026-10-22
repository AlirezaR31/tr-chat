"use client";

/**
 * BasketSummaryBlock — the full Smart Shopping Basket inside the chat.
 * Rows show image/name/qty/target price, the server-assigned store with
 * price-confidence indicator, honest notes, and basket totals. Qty steppers
 * and remove buttons dispatch server actions; the bar above the composer
 * always mirrors the latest server-resolved snapshot.
 */
import { Minus, Plus, Route, Trash2 } from "lucide-react";
import type { ActionRequestType, AssignmentConfidence, Block } from "@/lib/types";
import { formatToman, formatTomanShort, toFaDigits } from "@/lib/format";
import { SafeImage, SectionTitle } from "@/components/generative/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const CONFIDENCE_FA: Record<AssignmentConfidence, { label: string; className: string }> = {
  confirmed: { label: "موجودی تاییدشده", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  reported: { label: "گزارش فروشنده", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  listing_only: { label: "داده آگهی", className: "bg-secondary text-muted-foreground border-border" },
  unknown: { label: "موجودی نامشخص", className: "bg-secondary text-muted-foreground border-border" },
  unassigned: { label: "بدون فروشگاه", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export function BasketSummaryBlock({
  block,
  onAction,
  onPlanRoute,
  busy,
}: {
  block: Extract<Block, { type: "basket_summary" }>;
  onAction: (type: ActionRequestType, payload: Record<string, unknown>, label?: string) => void;
  onPlanRoute: () => void;
  busy: boolean;
}) {
  const { basket, intro } = block;
  if (!basket.items.length) {
    return (
      <Card className="my-1.5 rounded-2xl border-border bg-card p-3">
        <p className="text-sm leading-6 text-muted-foreground">سبد خریدت خالیه.</p>
      </Card>
    );
  }

  return (
    <Card className="my-1.5 gap-0 rounded-2xl border-border bg-card p-3">
      <SectionTitle hint={`${toFaDigits(basket.items.length)} قلم`}>
        {intro ?? "سبد خرید هوشمند"}
      </SectionTitle>

      <div className="space-y-2.5">
        {basket.items.map((it) => {
          const conf = CONFIDENCE_FA[it.assignment?.confidence ?? "unassigned"];
          return (
            <div key={it.productId} className="rounded-xl border border-border/70 bg-secondary/30 p-2">
              <div className="flex gap-2.5">
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-white">
                  <SafeImage
                    src={it.image}
                    alt={it.name}
                    fallbackLabel={it.brand.slice(0, 2)}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h6 className="line-clamp-2 text-xs font-medium leading-5 text-foreground">{it.name}</h6>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {it.categoryFa ?? `${it.brand} · ${it.model}`}
                    {it.variant ? ` · ${it.variant}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {it.assignment ? (
                      <Badge variant="outline" className={`rounded-md px-1.5 leading-4 ${conf.className}`}>
                        {conf.label}
                      </Badge>
                    ) : null}
                    {it.note ? (
                      <span className="text-xs leading-5 text-muted-foreground">{it.note}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between">
                  <span className="text-sm font-bold leading-6 tabular-nums text-foreground">
                    {formatTomanShort((it.assignment?.price ?? it.bestPrice) * it.quantity)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy || it.quantity <= 1}
                      onClick={() => onAction("update_basket_item", { productId: it.productId, quantity: it.quantity - 1 }, "تعداد")}
                      aria-label={`کم کردن تعداد ${it.name}`}
                      className="size-7 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Minus className="size-3" aria-hidden />
                    </Button>
                    <span className="min-w-5 text-center text-xs font-semibold leading-5 tabular-nums text-foreground">
                      {toFaDigits(it.quantity)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy || it.quantity >= 10}
                      onClick={() => onAction("update_basket_item", { productId: it.productId, quantity: it.quantity + 1 }, "تعداد")}
                      aria-label={`زیاد کردن تعداد ${it.name}`}
                      className="size-7 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Plus className="size-3" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => onAction("remove_from_basket", { productId: it.productId }, `حذف ${it.name}`)}
                      aria-label={`حذف ${it.name} از سبد`}
                      className="size-7 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>
              {it.assignment ? (
                <p className="mt-1.5 border-t border-border/50 pt-1.5 text-xs leading-5 text-muted-foreground">
                  فروشگاه پیشنهادی: <span className="font-medium text-foreground/90">{it.assignment.storeName}</span>
                  {" · "}
                  {it.assignment.area}
                  {" · "}
                  {formatToman(it.assignment.price)}
                  {it.quantity > 1 ? ` × ${toFaDigits(it.quantity)}` : ""}
                  {it.targetPrice ? ` · قیمت هدف: ${formatTomanShort(it.targetPrice)}` : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <Separator className="my-2.5" />

      <div className="flex items-center justify-between">
        <span className="text-sm leading-6 text-muted-foreground">جمع تخمینی سبد</span>
        <span className="text-base font-bold leading-6 tabular-nums text-foreground">
          {formatToman(basket.estimatedTotal)}
        </span>
      </div>
      {basket.savingsVsMax > 0 ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          با ترکیب فروشگاه‌های این برنامه، نسبت به گران‌ترین حالت ممکن {formatTomanShort(basket.savingsVsMax)} صرفه‌جویی می‌شود.
        </p>
      ) : null}
      {!basket.hasRoute ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={onPlanRoute}
          className="mt-2 h-9 w-full gap-1.5 rounded-xl text-xs font-semibold"
        >
          <Route className="size-4" aria-hidden />
          برنامه‌ریزی مسیر چند‌ایستگاهی
        </Button>
      ) : null}
    </Card>
  );
}
