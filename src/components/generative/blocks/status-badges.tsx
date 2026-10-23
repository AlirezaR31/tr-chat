"use client";

/**
 * Honest verification primitives (shadcn Badge based):
 *  - StockStatus: distinguishes confirmed / reported / listing-only / unknown
 *  - VerificationTimestamp: always shows source + time for verification data
 *  - CreditEligibilityBadge: verified installment vs unverified claim
 */
import { BadgeCheck, Clock, CircleHelp, Store, CircleOff, CreditCard, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstallmentInfo, StockInfo } from "@/lib/types";
import { formatJalaliDateTime, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

const STOCK_META = {
  confirmed: {
    label: "موجودی تاییدشده",
    cls: "text-[#3ecf8e] bg-[rgba(47,179,107,0.13)]",
    Icon: BadgeCheck,
  },
  reported: {
    label: "گزارش فروشنده — تاییدنشده",
    cls: "text-[#e6a23c] bg-[rgba(230,162,60,0.13)]",
    Icon: Clock,
  },
  listing_only: {
    label: "فقط داده آگهی",
    cls: "text-muted-foreground bg-secondary",
    Icon: Store,
  },
  unknown: {
    label: "موجودی نامشخص",
    cls: "text-muted-foreground bg-secondary",
    Icon: CircleHelp,
  },
} as const;

export function StockStatus({ stock, compact }: { stock: StockInfo; compact?: boolean }) {
  const meta = STOCK_META[stock.status];
  const { Icon } = meta;
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 rounded-md px-1.5 font-normal leading-4", meta.cls)}
      title={stock.method ?? undefined}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{compact ? meta.label.split(" — ")[0] : meta.label}</span>
    </Badge>
  );
}

export function VerificationTimestamp({
  at,
  method,
  prefix = "بروزرسانی",
}: {
  at: string | number | null;
  method?: string | null;
  prefix?: string;
}) {
  if (!at) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs leading-5 text-muted-foreground">
      <ShieldAlert className="size-3 shrink-0 opacity-70" aria-hidden />
      {prefix}: {formatRelative(at)} ({formatJalaliDateTime(at)})
      {method ? ` · ${method}` : ""}
    </span>
  );
}

export function CreditEligibilityBadge({ installment }: { installment: InstallmentInfo }) {
  if (installment.verified) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 rounded-md bg-[rgba(47,179,107,0.13)] px-1.5 font-normal leading-4 text-[#3ecf8e]"
        title={`منبع تایید: ${installment.provider ?? "—"}${installment.verifiedAt ? ` — ${formatRelative(installment.verifiedAt)}` : ""}`}
      >
        <CreditCard className="size-3 shrink-0" aria-hidden />
        اقساط تاییدشده
      </Badge>
    );
  }
  if (installment.claim) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 rounded-md bg-secondary px-1.5 font-normal leading-4 text-muted-foreground"
        title="این ادعا توسط ترب تایید نشده است"
      >
        <CircleOff className="size-3 shrink-0" aria-hidden />
        {installment.claim} — تاییدنشده
      </Badge>
    );
  }
  return null;
}
