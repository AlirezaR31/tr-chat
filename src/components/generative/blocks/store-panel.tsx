"use client";

/**
 * StorePanel — synchronized map + list + real working filters.
 * Server delivers ALL stores for the product; filtering/sorting happens
 * client-side so every toggle is instant and reversible. Zero-result combos
 * render the recovery EmptyState (acceptance scenario 8).
 */
import { useMemo, useState } from "react";
import { Store as StoreIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block, ContactOutcome, StoreCardData, StoreFilters as StoreFiltersT } from "@/lib/types";
import { sortStores } from "@/lib/agent/tools";
import { Pill } from "@/components/generative/ui";
import { Separator } from "@/components/ui/separator";
import { StoreMap } from "@/components/generative/blocks/store-map";
import { StoreCard } from "@/components/generative/blocks/store-card";
import { formatJalaliDateTime } from "@/lib/format";

const SORTS: Array<{ key: StoreFiltersT["sort"]; label: string }> = [
  { key: "price", label: "ارزون‌ترین" },
  { key: "distance", label: "نزدیک‌ترین" },
  { key: "stock", label: "موجودی مطمئن" },
];

export function StorePanel({
  block,
  contacted,
  onFiltersChange,
  onContact,
  contactingId,
}: {
  block: Extract<Block, { type: "store_panel" }>;
  contacted: Record<string, ContactOutcome>;
  onFiltersChange?: (f: StoreFiltersT) => void;
  onContact: (store: StoreCardData) => void;
  contactingId: string | null;
}) {
  const [filters, setFilters] = useState<StoreFiltersT>(block.filters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const out = block.stores.filter((s) => {
      if (filters.installmentOnly && !s.installment.verified) return false;
      if (filters.openNow && !s.openNow) return false;
      if (filters.confirmedStockOnly && s.stock.status !== "confirmed") return false;
      return true;
    });
    return sortStores(out, filters.sort);
  }, [block.stores, filters]);

  const apply = (next: StoreFiltersT) => {
    setFilters(next);
    onFiltersChange?.(next);
  };

  const toggle = (key: "installmentOnly" | "openNow" | "confirmedStockOnly") =>
    apply({ ...filters, [key]: !filters[key] });

  return (
    <section className="my-2" aria-label={`فروشگاه‌های ${block.productName}`}>
      {/* map */}
      <div className="mb-2">
        <StoreMap
          stores={filtered.length ? filtered : block.stores}
          location={block.location}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* filters */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {SORTS.map((s) => (
          <Pill
            key={s.key}
            active={filters.sort === s.key}
            onClick={() => apply({ ...filters, sort: s.key })}
            aria-pressed={filters.sort === s.key}
          >
            {s.label}
          </Pill>
        ))}
        <Separator orientation="vertical" className="mx-0.5 h-5" aria-hidden />
        <Pill active={filters.installmentOnly} onClick={() => toggle("installmentOnly")}>
          اقساط تاییدشده
        </Pill>
        <Pill active={filters.openNow} onClick={() => toggle("openNow")}>
          باز الان
        </Pill>
        <Pill active={filters.confirmedStockOnly} onClick={() => toggle("confirmedStockOnly")}>
          موجودی تاییدشده
        </Pill>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center">
          <StoreIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden />
          <p className="mb-1 text-sm font-semibold leading-6">فروشگاهی با این شرایط پیدا نشد</p>
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            فیلترها رو کمی باز کن یا ناحیه دیگه‌ای انتخاب کن.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {filters.installmentOnly ? (
              <Pill onClick={() => toggle("installmentOnly")}>حذف فیلتر اقساطی</Pill>
            ) : null}
            {filters.openNow ? <Pill onClick={() => toggle("openNow")}>حذف «باز الان»</Pill> : null}
            {filters.confirmedStockOnly ? (
              <Pill onClick={() => toggle("confirmedStockOnly")}>حذف فیلتر موجودی تاییدشده</Pill>
            ) : null}
            {filters.sort !== "price" ? (
              <Pill onClick={() => apply({ ...filters, sort: "price" })}>مرتب‌سازی ارزون‌ترین</Pill>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s, i) => (
            <StoreCard
              key={s.id}
              store={s}
              index={i + 1}
              selected={selectedId === s.id}
              contacted={contacted[s.id] ?? null}
              contacting={contactingId === s.id}
              onSelect={setSelectedId}
              onContact={onContact}
            />
          ))}
        </div>
      )}

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        فاصله‌ها با مختصات واقعی {block.location.name} محاسبه شده‌اند؛ اطلاعات فروشگاه‌ها و موجودی، داده نمایشی است (بروزرسانی: {formatJalaliDateTime(Date.now() - 3 * 3600_000)}).
      </p>
    </section>
  );
}
