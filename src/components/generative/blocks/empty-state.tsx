"use client";

/** EmptyState / ErrorState / DemoNotice blocks. */
import { AlertTriangle, Info } from "lucide-react";
import type { Block, QuickReply } from "@/lib/types";
import { Pill } from "@/components/generative/ui";

export function EmptyStateBlock({
  block,
  onPick,
}: {
  block: Extract<Block, { type: "empty_state" }>;
  onPick: (qr: QuickReply) => void;
}) {
  return (
    <section
      className="my-2 rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center"
      aria-live="polite"
    >
      <p className="mb-1 text-[13.5px] font-semibold">{block.title}</p>
      <p className="mb-3 text-[12px] leading-6 text-muted-foreground">{block.description}</p>
      {block.replies?.length ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {block.replies.map((qr, i) => (
            <Pill key={i} onClick={() => onPick(qr)}>
              {qr.label}
            </Pill>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function DemoNotice({ label }: { label: string }) {
  return (
    <p className="my-1 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] text-[#e6a23c]">
      <Info className="size-3" aria-hidden />
      {label}
    </p>
  );
}

export function ErrorState({
  onRetry,
  message,
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <section
      className="my-2 rounded-2xl border border-[rgba(229,72,77,0.35)] bg-card p-4"
      role="alert"
    >
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle className="size-4 text-primary" aria-hidden />
        <p className="text-[13px] font-semibold">مشکلی پیش آمد</p>
      </div>
      <p className="mb-3 text-[12px] leading-6 text-muted-foreground">
        {message ?? "پیام ارسال نشد. اتصالت رو چک کن و دوباره تلاش کن."}
      </p>
      {onRetry ? (
        <Pill onClick={onRetry} className="border-primary/50 text-[#f2a0a2]">
          تلاش مجدد
        </Pill>
      ) : null}
    </section>
  );
}
