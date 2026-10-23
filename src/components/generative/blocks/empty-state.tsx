"use client";

/** EmptyState / ErrorState / DemoNotice blocks — shadcn Alert + Badge based. */
import { AlertTriangle, Info } from "lucide-react";
import type { Block, QuickReply } from "@/lib/types";
import { Pill } from "@/components/generative/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
      <p className="mb-1 text-sm font-semibold leading-6">{block.title}</p>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">{block.description}</p>
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
    <Badge
      variant="secondary"
      className="my-1 gap-1 rounded-full bg-warning-soft px-2 font-normal leading-4 text-[#e6a23c]"
    >
      <Info className="size-3" aria-hidden />
      {label}
    </Badge>
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
    <Alert
      variant="destructive"
      className="my-2 rounded-2xl border-[rgba(229,72,77,0.35)] bg-card text-foreground [&>svg]:text-primary"
      role="alert"
    >
      <AlertTriangle className="size-4 text-primary" aria-hidden />
      <AlertTitle className="text-sm font-semibold leading-6">مشکلی پیش آمد</AlertTitle>
      <AlertDescription className="text-xs leading-5 text-muted-foreground">
        {message ?? "پیام ارسال نشد. اتصالت رو چک کن و دوباره تلاش کن."}
        {onRetry ? (
          <Pill onClick={onRetry} className="h-8 border-primary/50 text-[#f2a0a2]">
            تلاش مجدد
          </Pill>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
