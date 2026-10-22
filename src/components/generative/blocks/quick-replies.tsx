"use client";

/** Quick reply chips — continue the conversation with the right context. */
import type { QuickReply } from "@/lib/types";
import { Pill } from "@/components/generative/ui";

export function QuickReplies({
  replies,
  onPick,
  disabled,
}: {
  replies: QuickReply[];
  onPick: (qr: QuickReply) => void;
  disabled?: boolean;
}) {
  if (!replies?.length) return null;
  return (
    <div className="my-1.5 flex flex-wrap gap-1.5" role="group" aria-label="پیشنهاد پاسخ">
      {replies.map((qr, i) => (
        <Pill key={`${qr.label}-${i}`} disabled={disabled} onClick={() => onPick(qr)}>
          {qr.label}
        </Pill>
      ))}
    </div>
  );
}
