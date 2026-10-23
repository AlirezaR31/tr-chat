"use client";

/**
 * ComparisonPanel — stacked mobile-first comparison cards (no wide tables).
 * The criteria switcher re-sorts entries, re-emphasizes bars and moves the
 * winner badge using precomputed per-criterion scores (transparent method).
 */
import { useState } from "react";
import { Check, Crown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block, Criteria } from "@/lib/types";
import { CRITERIA_HINT, METHOD_LABEL, PRIORITY_FA } from "@/lib/scoring";
import { formatToman, toFaDigits } from "@/lib/format";
import { Pill, SafeImage, ScoreBar, SectionTitle } from "@/components/generative/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const CRITERIA_ORDER: Criteria[] = ["comfort", "price", "durability", "style"];

export function ComparisonPanel({
  block,
  onCriteriaChange,
}: {
  block: Extract<Block, { type: "comparison_panel" }>;
  onCriteriaChange?: (c: Criteria) => void;
}) {
  const comparison = block.comparison;
  const [criteria, setCriteria] = useState<Criteria>(comparison.criteria ?? "comfort");

  const switchCriteria = (c: Criteria) => {
    setCriteria(c);
    onCriteriaChange?.(c);
  };

  const entries = [...comparison.entries].sort(
    (a, b) => b.scores[criteria] - a.scores[criteria]
  );
  const winnerId = comparison.winnerBy[criteria];
  const maxPrice = Math.max(...comparison.entries.map((e) => e.price));
  const minPrice = Math.min(...comparison.entries.map((e) => e.price));

  return (
    <section className="my-2" aria-label="مقایسه محصولات">
      {/* criteria switcher */}
      <div className="mb-2">
        <SectionTitle hint={CRITERIA_HINT[criteria]}>ملاک مقایسه</SectionTitle>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="انتخاب ملاک">
          {CRITERIA_ORDER.map((c) => (
            <Pill
              key={c}
              role="tab"
              aria-selected={criteria === c}
              active={criteria === c}
              onClick={() => switchCriteria(c)}
            >
              {PRIORITY_FA[c]}
            </Pill>
          ))}
        </div>
      </div>

      {/* stacked cards */}
      <div className="space-y-2.5">
        {entries.map((e, idx) => {
          const isWinner = e.productId === winnerId;
          return (
            <Card
              key={e.productId}
              className={cn(
                "gap-0 rounded-2xl border p-3 py-3",
                isWinner ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
              )}
            >
              <div className="flex gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white">
                  <SafeImage
                    src={e.image}
                    alt={e.name}
                    fallbackLabel={e.brand.slice(0, 2)}
                    className="h-full w-full object-cover"
                  />
                  {idx === 0 ? (
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-primary py-0.5 text-xs font-bold leading-4 text-white">
                      <Crown className="size-3" aria-hidden />
                      برترین
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <h5 className="truncate text-sm font-semibold leading-6">{e.name}</h5>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 rounded-md px-1.5 text-sm font-bold leading-5 tabular-nums",
                        isWinner
                          ? "bg-primary/15 text-[#f2a0a2]"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {toFaDigits(e.scores[criteria])}
                      <span className="text-xs font-normal leading-4">/۱۰۰</span>
                    </Badge>
                  </div>
                  <p className="mb-1 text-sm font-medium leading-6 text-foreground/85">
                    {formatToman(e.price)}
                  </p>
                  {isWinner ? (
                    <p className="text-xs leading-5 text-[#3ecf8e]">
                      بهترین گزینه برای {PRIORITY_FA[criteria]}
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {PRIORITY_FA[criteria]}: {toFaDigits(e.scores[criteria])} امتیاز
                    </p>
                  )}
                </div>
              </div>

              {/* attribute bars */}
              <div className="mt-2.5 space-y-1.5">
                {e.attributes.map((a) => (
                  <div key={a.label} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs leading-5 text-muted-foreground">
                      {a.label}
                    </span>
                    <ScoreBar
                      value={Math.round(a.score * 100)}
                      highlight={criteria === "price" && a.label === "قیمت"}
                      className="flex-1"
                    />
                    <span className="w-16 shrink-0 text-left text-xs leading-5 text-foreground/80">
                      {a.value}
                    </span>
                  </div>
                ))}
                {e.price === minPrice && minPrice !== maxPrice ? (
                  <p className="pt-0.5 text-xs leading-5 text-[#3ecf8e]">
                    ارزش خرید: بهترین نسبت قیمت به مشخصات بین این گزینه‌ها
                  </p>
                ) : null}
              </div>

              {/* pros / cons */}
              <div className="mt-2.5 grid grid-cols-1 gap-1 border-t border-border pt-2 sm:grid-cols-2">
                <ul className="space-y-0.5">
                  {e.pros.map((p) => (
                    <li key={p} className="flex items-start gap-1 text-xs leading-5 text-foreground/80">
                      <Check className="mt-0.5 size-3 shrink-0 text-[#3ecf8e]" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-0.5">
                  {e.cons.map((c) => (
                    <li key={c} className="flex items-start gap-1 text-xs leading-5 text-muted-foreground">
                      <X className="mt-0.5 size-3 shrink-0 text-primary/80" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {comparison.methodology || METHOD_LABEL} — داده‌های نمایشی ترب‌چت.
      </p>
    </section>
  );
}
