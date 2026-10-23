"use client";

/**
 * BasketRecommendationsBlock — contextual recommendations rendered inline
 * after each basket add. Every row carries a required reason; availability
 * is shown ONLY when the dataset supports it (otherwise an honest note).
 * User can dismiss each row or mute recommendations entirely.
 */
import { useState } from "react";
import { MapPin, Sparkles, X } from "lucide-react";
import type { ActionRequestType, Block } from "@/lib/types";
import { formatTomanShort, toFaDigits } from "@/lib/format";
import { SafeImage, SectionTitle } from "@/components/generative/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const KIND_FA: Record<string, { label: string; className: string }> = {
  complementary: { label: "مکمل این خرید", className: "bg-primary/15 text-[#f2b8ba] border-primary/40" },
  nearby: { label: "نزدیک سبد تو", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  basket_optimization: { label: "بهینه‌سازی سبد", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

const STOCK_FA: Record<string, string> = {
  confirmed: "موجودی تاییدشده",
  reported: "گزارش فروشنده",
  listing_only: "داده آگهی",
  unknown: "نامشخص",
};

export function BasketRecommendationsBlock({
  block,
  onAction,
  busy,
}: {
  block: Extract<Block, { type: "basket_recommendations" }>;
  onAction: (type: ActionRequestType, payload: Record<string, unknown>, label?: string) => void;
  busy: boolean;
}) {
  // local dismissals so the UI responds instantly (server records them too)
  // NOTE: parent keys this component per (product, recs) so state resets on new block
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = block.recs.filter((r) => !dismissed.includes(r.product.id));
  if (!visible.length) return null;

  return (
    <Card className="my-1.5 gap-0 rounded-2xl border-border bg-card p-3">
      <SectionTitle hint={`برای «${block.forProductName}»`}>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-4 text-primary" aria-hidden />
          پیشنهادهای مرتبط
        </span>
      </SectionTitle>

      <div className="space-y-2.5">
        {visible.map((rec) => {
          const kind = KIND_FA[rec.kind] ?? KIND_FA.complementary;
          return (
            <div key={`${rec.kind}-${rec.product.id}`} className="rounded-xl border border-border/70 bg-secondary/30 p-2">
              <div className="flex gap-2.5">
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-white">
                  <SafeImage
                    src={rec.product.image}
                    alt={rec.product.name}
                    fallbackLabel={rec.product.brand.slice(0, 2)}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <h6 className="line-clamp-2 text-xs font-medium leading-5 text-foreground">
                      {rec.product.name}
                    </h6>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => {
                        setDismissed((d) => [...d, rec.product.id]);
                        onAction("dismiss_recommendation", { productId: rec.product.id }, "رد پیشنهاد");
                      }}
                      aria-label={`رد کردن پیشنهاد ${rec.product.name}`}
                      className="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </Button>
                  </div>
                  <Badge variant="outline" className={`mt-0.5 rounded-md px-1.5 leading-4 ${kind.className}`}>
                    {kind.label}
                  </Badge>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{rec.reason}</p>
                  {rec.availability ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-5 text-muted-foreground">
                      <MapPin className="size-3 text-primary" aria-hidden />
                      <span className="font-medium text-foreground/90">{rec.availability.storeName}</span>
                      {" · "}
                      {formatTomanShort(rec.availability.price)}
                      {" · "}
                      {STOCK_FA[rec.availability.stockStatus] ?? "نامشخص"}
                      {rec.availability.distanceKm !== null
                        ? ` · ${toFaDigits(rec.availability.distanceKm.toLocaleString("fa-IR"))} کیلومتر`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      موجودی حضوری برای این قلم در داده فعلی ثبت نشده — فقط به‌عنوان پیشنهاد معنایی.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onAction("add_to_basket", { productId: rec.product.id }, `افزودن ${rec.product.name}`)}
                    className="mt-1.5 h-7 gap-1 rounded-lg border-border bg-secondary/50 px-2.5 text-xs text-foreground/90 hover:bg-secondary hover:text-foreground"
                  >
                    افزودن به سبد
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">{block.hint}</p>
    </Card>
  );
}
