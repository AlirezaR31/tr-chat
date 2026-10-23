"use client";

/**
 * PlanComparisonBlock — transparent comparison of route-plan alternatives
 * (modes). Metrics come straight from the engine; the trade-off line is
 * generated server-side and only contains supported quantitative claims.
 */
import { Check } from "lucide-react";
import type { ActionRequestType, Block } from "@/lib/types";
import { formatTomanShort, toFaDigits } from "@/lib/format";
import { SectionTitle } from "@/components/generative/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MODE_LABEL: Record<string, string> = {
  fastest: "سریع‌ترین مسیر",
  cheapest: "کم‌هزینه‌ترین خرید",
  fewest_stops: "کمترین توقف",
  balanced: "پیشنهاد متعادل",
};

export function PlanComparisonBlock({
  block,
  onAction,
  busy,
}: {
  block: Extract<Block, { type: "plan_comparison" }>;
  onAction: (type: ActionRequestType, payload: Record<string, unknown>, label?: string) => void;
  busy: boolean;
}) {
  return (
    <Card className="my-1.5 gap-0 rounded-2xl border-border bg-card p-3">
      <SectionTitle hint="۴ حالت بهینه‌سازی">مقایسه برنامه‌ها</SectionTitle>

      <div className="space-y-2">
        {block.alternatives.map((alt) => (
          <div key={alt.planId} className="rounded-xl border border-border/70 bg-secondary/30 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold leading-5 text-[#f2b8ba]">
                  {alt.planId === "B" ? "B" : "C"}
                </span>
                <h6 className="text-xs font-semibold leading-5 text-foreground">برنامه {alt.label}</h6>
              </div>
              <Badge variant="outline" className="rounded-md border-border bg-secondary px-1.5 leading-4 text-muted-foreground">
                {MODE_LABEL[alt.mode] ?? alt.mode}
              </Badge>
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs leading-5 sm:grid-cols-4">
              <Metric label="ایستگاه" value={toFaDigits(alt.stopCount)} />
              <Metric label="جمع کالا" value={formatTomanShort(alt.totalProductCost)} />
              <Metric label="زمان سفر" value={`~${toFaDigits(alt.totalTravelMin)} دقیقه`} />
              <Metric label="مسافت" value={`${toFaDigits(alt.totalDistanceKm.toLocaleString("fa-IR"))} کیلومتر`} />
              <Metric
                label="موجودی مطمئن"
                value={`${toFaDigits(alt.unconfirmedCount)} قلم نامطمئن`}
                warn={alt.unconfirmedCount > 0}
              />
              {alt.closedCount > 0 ? (
                <Metric label="بسته در رسیدن" value={`${toFaDigits(alt.closedCount)} ایستگاه`} warn />
              ) : null}
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-muted-foreground/60 transition-all duration-500" style={{ width: `${Math.max(4, alt.score)}%` }} />
              </div>
              <span className="text-xs leading-5 tabular-nums text-muted-foreground">
                {toFaDigits(alt.score)} از ۱۰۰
              </span>
            </div>

            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{alt.tradeoff}</p>

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onAction("recalculate_route", { mode: alt.mode }, `انتخاب ${alt.label}`)}
              className="mt-2 h-8 w-full gap-1 rounded-lg border-border bg-secondary/50 text-xs font-medium text-foreground/90 hover:bg-secondary hover:text-foreground"
            >
              <Check className="size-3.5" aria-hidden />
              انتخاب این برنامه
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${warn ? "font-medium text-amber-300" : "font-medium text-foreground/85"}`}>{value}</span>
    </div>
  );
}
