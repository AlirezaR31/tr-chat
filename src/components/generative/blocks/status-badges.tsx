"use client";

/**
 * Honest verification primitives:
 *  - StockStatus: distinguishes confirmed / reported / listing-only / unknown
 *  - VerificationTimestamp: always shows source + time for verification data
 *  - CreditEligibilityBadge: verified installment vs unverified claim
 */
import { BadgeCheck, Clock, CircleHelp, Store, CircleOff, CreditCard, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstallmentInfo, StockInfo } from "@/lib/types";
import { formatJalaliDateTime, formatRelative } from "@/lib/format";

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
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-5",
        meta.cls
      )}
      title={stock.method ?? undefined}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{compact ? meta.label.split(" — ")[0] : meta.label}</span>
    </span>
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
    <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
      <ShieldAlert className="size-3 shrink-0 opacity-70" aria-hidden />
      {prefix}: {formatRelative(at)} ({formatJalaliDateTime(at)})
      {method ? ` · ${method}` : ""}
    </span>
  );
}

export function CreditEligibilityBadge({ installment }: { installment: InstallmentInfo }) {
  if (installment.verified) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-5 text-[#3ecf8e] bg-[rgba(47,179,107,0.13)]"
        title={`منبع تایید: ${installment.provider ?? "—"}${installment.verifiedAt ? ` — ${formatRelative(installment.verifiedAt)}` : ""}`}
      >
        <CreditCard className="size-3 shrink-0" aria-hidden />
        اقساط تاییدشده
      </span>
    );
  }
  if (installment.claim) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-5 text-muted-foreground bg-secondary"
        title="این ادعا توسط ترب تایید نشده است"
      >
        <CircleOff className="size-3 shrink-0" aria-hidden />
        {installment.claim} — تاییدنشده
      </span>
    );
  }
  return null;
}
