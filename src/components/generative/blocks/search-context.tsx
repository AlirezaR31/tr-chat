"use client";

/** Search context row — mirrors the reference ("جستجو: ۲۰ نتیجه · منابع" + filter chips). */
import { Search } from "lucide-react";
import type { Block } from "@/lib/types";
import { toFaDigits } from "@/lib/format";

export function SearchContextBlock({
  block,
}: {
  block: Extract<Block, { type: "search_context" }>;
}) {
  const { queryLabel, productCount, sourceCount, appliedFilters } = block;
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5" aria-label="خلاصه جستجو">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-foreground/85">
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        {queryLabel} · {toFaDigits(productCount)} مدل از {toFaDigits(sourceCount)} منبع
      </span>
      {appliedFilters.slice(0, 4).map((f) => (
        <span
          key={f}
          className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground"
        >
          {f}
        </span>
      ))}
    </div>
  );
}
