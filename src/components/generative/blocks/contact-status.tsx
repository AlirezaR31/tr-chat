"use client";

/**
 * ContactStatus — honest outcome card with timestamp + method.
 * Always labelled as a simulated demo contact; never claims real verification.
 */
import { Ban, BadgeCheck, Clock, DoorClosed, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block, ContactOutcome } from "@/lib/types";
import { formatJalaliDateTime, formatToman } from "@/lib/format";
import { Card } from "@/components/ui/card";

const META: Record<
  ContactOutcome["kind"],
  { title: string; cls: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  contacting: { title: "در حال تماس با فروشگاه…", cls: "border-border", Icon: Clock },
  confirmed: {
    title: "موجودی تایید شد",
    cls: "border-[rgba(47,179,107,0.4)]",
    Icon: BadgeCheck,
  },
  reported: {
    title: "فروشگاه موجودی را گزارش کرد",
    cls: "border-[rgba(230,162,60,0.4)]",
    Icon: Clock,
  },
  no_answer: { title: "فروشگاه پاسخ نداد", cls: "border-[rgba(229,72,77,0.45)]", Icon: Ban },
  closed: { title: "فروشگاه بسته است", cls: "border-border", Icon: DoorClosed },
  price_changed: {
    title: "قیمت تغییر کرده",
    cls: "border-[rgba(230,162,60,0.4)]",
    Icon: TrendingUp,
  },
};

export function ContactStatus({
  block,
}: {
  block: Extract<Block, { type: "contact_status" }>;
}) {
  const { outcome, storeName } = block;
  const meta = META[outcome.kind];
  const { Icon } = meta;
  return (
    <Card
      className={cn("my-2 gap-0 rounded-2xl border bg-card p-3.5 py-3.5", meta.cls)}
      aria-live="polite"
      aria-label={meta.title}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated">
          <Icon className="size-4 text-foreground/85" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-6">{meta.title}</p>
          <p className="truncate text-xs leading-5 text-muted-foreground">{storeName}</p>
        </div>
      </div>
      <p className="mb-2 text-sm leading-6 text-foreground/85">{outcome.note}</p>
      {outcome.kind === "price_changed" && outcome.newPrice ? (
        <p className="mb-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs leading-5 text-[#e6a23c]">
          قیمت جدید: {formatToman(outcome.newPrice)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5 text-muted-foreground">
        <span>زمان: {formatJalaliDateTime(outcome.at)}</span>
        <span aria-hidden>·</span>
        <span>{outcome.method}</span>
        <span aria-hidden>·</span>
        <span>نتیجه تماس نمایشی است — تایید مستقل ترب نیست</span>
      </div>
    </Card>
  );
}
