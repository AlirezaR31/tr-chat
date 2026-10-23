"use client";

/** Search context row — mirrors the reference ("جستجو: ۲۰ نتیجه · منابع" + filter chips). */
import { Search } from "lucide-react";
import type { Block } from "@/lib/types";
import { toFaDigits } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function SearchContextBlock({
  block,
}: {
  block: Extract<Block, { type: "search_context" }>;
}) {
  const { queryLabel, productCount, sourceCount, appliedFilters } = block;
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5" aria-label="خلاصه جستجو">
      <Badge
        variant="outline"
        className="gap-1.5 rounded-full border-border bg-card px-2.5 py-1 font-normal leading-4 text-foreground/85"
      >
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        {queryLabel} · {toFaDigits(productCount)} مدل از {toFaDigits(sourceCount)} منبع
      </Badge>
      {appliedFilters.slice(0, 4).map((f) => (
        <Badge
          key={f}
          variant="secondary"
          className="rounded-full bg-secondary px-2 font-normal leading-4 text-muted-foreground"
        >
          {f}
        </Badge>
      ))}
    </div>
  );
}
