"use client";

/** AlternativeStores — next-best options after a failed/changed contact. */
import type { Block, StoreCardData } from "@/lib/types";
import { StoreCard } from "@/components/generative/blocks/store-card";
import { SectionTitle } from "@/components/generative/ui";

export function AlternativeStores({
  block,
  onContact,
  contactingId,
}: {
  block: Extract<Block, { type: "alternative_stores" }>;
  onContact: (store: StoreCardData) => void;
  contactingId: string | null;
}) {
  return (
    <section className="my-2" aria-label="فروشگاه‌های جایگزین">
      <SectionTitle hint="بر اساس موجودی، قیمت و باز بودن">گزینه‌های جایگزین</SectionTitle>
      <div className="space-y-2">
        {block.stores.map((s, i) => (
          <StoreCard
            key={s.id}
            store={s}
            index={i + 1}
            selected={false}
            contacted={null}
            contacting={contactingId === s.id}
            onSelect={() => {}}
            onContact={onContact}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{block.reason}</p>
    </section>
  );
}
