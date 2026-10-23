"use client";

/** PreferenceSelector — quick priority chips (comfort / price / durability / style). */
import type { Block, Priority } from "@/lib/types";
import { PRIORITY_FA } from "@/lib/scoring";
import { Pill } from "@/components/generative/ui";

const ORDER: Priority[] = ["comfort", "price", "durability", "style"];

export function PreferenceSelector({
  block,
  onPick,
  disabled,
}: {
  block: Extract<Block, { type: "preference_selector" }>;
  onPick: (p: Priority) => void;
  disabled?: boolean;
}) {
  return (
    <div className="my-1.5" role="group" aria-label="اولویت خرید">
      <p className="mb-1.5 text-xs leading-5 text-muted-foreground">اولویتت کدومه؟</p>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((p) => (
          <Pill
            key={p}
            active={block.active.includes(p)}
            disabled={disabled}
            onClick={() => onPick(p)}
            aria-pressed={block.active.includes(p)}
          >
            {PRIORITY_FA[p]}
          </Pill>
        ))}
      </div>
    </div>
  );
}
