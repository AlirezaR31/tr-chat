"use client";

/**
 * ComparisonPanel — stacked mobile-first comparison cards (no wide tables).
 * The criteria switcher re-sorts entries, re-emphasizes bars and moves the
 * winner badge using precomputed per-criterion scores (transparent method).
 */
import { useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block, ComparisonData, Criteria } from "@/lib/types";
import { CRITERIA_HINT, METHOD_LABEL, PRIORITY_FA } from "@/lib/scoring";
import { formatToman } from "@/lib/format";
import { Pill, SafeImage, ScoreBar, SectionTitle } from "@/components/generative/ui";

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
            <article
              key={e.productId}
              className={cn(
                "rounded-2xl border bg-card p-3",
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
                    <span className="absolute inset-x-0 bottom-0 bg-primary py-0.5 text-center text-[9px] font-bold text-white">
                      برترین
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <h5 className="truncate text-[13px] font-semibold">{e.name}</h5>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums",
                        isWinner ? "bg-primary/15 text-[#f2a0a2]" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {e.scores[criteria]}
                      <span className="text-[9.5px] font-normal">/۱۰۰</span>
                    </span>
                  </div>
                  <p className="mb-1 text-[12.5px] font-medium text-foreground/85">
                    {formatToman(e.price)}
                  </p>
                  {isWinner ? (
                    <p className="text-[10.5px] text-[#3ecf8e]">
                      بهترین گزینه برای {PRIORITY_FA[criteria]}
                    </p>
                  ) : (
                    <p className="text-[10.5px] text-muted-foreground">
                      {PRIORITY_FA[criteria]}: {e.scores[criteria]} امتیاز
                    </p>
                  )}
                </div>
              </div>

              {/* attribute bars */}
              <div className="mt-2.5 space-y-1.5">
                {e.attributes.map((a) => (
                  <div key={a.label} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10.5px] text-muted-foreground">
                      {a.label}
                    </span>
                    <ScoreBar
                      value={Math.round(a.score * 100)}
                      highlight={criteria === "price" && a.label === "قیمت"}
                      className="flex-1"
                    />
                    <span className="w-16 shrink-0 text-left text-[10.5px] text-foreground/80">
                      {a.value}
                    </span>
                  </div>
                ))}
                {e.price === minPrice && minPrice !== maxPrice ? (
                  <p className="pt-0.5 text-[10.5px] text-[#3ecf8e]">
                    ارزش خرید: بهترین نسبت قیمت به مشخصات بین این گزینه‌ها
                  </p>
                ) : null}
              </div>

              {/* pros / cons */}
              <div className="mt-2.5 grid grid-cols-1 gap-1 border-t border-border pt-2 sm:grid-cols-2">
                <ul className="space-y-0.5">
                  {e.pros.map((p) => (
                    <li key={p} className="flex items-start gap-1 text-[11px] leading-5 text-foreground/80">
                      <Check className="mt-0.5 size-3 shrink-0 text-[#3ecf8e]" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-0.5">
                  {e.cons.map((c) => (
                    <li key={c} className="flex items-start gap-1 text-[11px] leading-5 text-muted-foreground">
                      <X className="mt-0.5 size-3 shrink-0 text-primary/80" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
        {comparison.methodology || METHOD_LABEL} — داده‌های نمایشی ترب‌چت.
      </p>
    </section>
  );
}
