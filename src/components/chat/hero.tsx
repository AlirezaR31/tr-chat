"use client";

/** Empty-state hero — shown when the conversation is empty. */
import { CreditCard, MapPin, Scale, Sparkles } from "lucide-react";

const SUGGESTIONS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  message: string;
}> = [
  {
    icon: Sparkles,
    title: "کفش راحتی زیر ۴ میلیون",
    hint: "حضوری در تهران",
    message:
      "می‌خوام یه کفش راحتی زیر ۴ میلیون تومان که حضوری در تهران بتونم بخرم",
  },
  {
    icon: CreditCard,
    title: "کتانی ورزشی مردانه",
    hint: "مناسب دویدن",
    message: "کتانی ورزشی مردانه برای دویدن می‌خوام",
  },
  {
    icon: Scale,
    title: "ارزون‌ترین کتانی‌ها",
    hint: "بودجه‌دوستانه",
    message: "ارزون‌ترین کتانی‌ها رو نشون بده",
  },
  {
    icon: MapPin,
    title: "نزدیک‌ترین فروشگاه‌ها",
    hint: "با موجودی تاییدشده",
    message: "نزدیک‌ترین فروشگاه‌های با موجودی تاییدشده",
  },
];

export function Hero({ onSuggest }: { onSuggest: (m: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Sparkles className="size-7" aria-hidden />
      </div>
      <h2 className="mb-1.5 text-[19px] font-bold">چطور می‌تونم کمکت کنم؟</h2>
      <p className="mb-6 max-w-xs text-[12.5px] leading-6 text-muted-foreground">
        بگو دنبال چی هستی؛ من مدل‌های مناسب رو پیدا می‌کنم، مقایسه می‌کنم و
        فروشگاه‌های نزدیکت با موجودی واقعی رو نشونت می‌دم.
      </p>
      <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onSuggest(s.message)}
            className="group rounded-2xl border border-border bg-card p-3.5 text-right transition-colors hover:border-muted-foreground/40 hover:bg-elevated"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
                <s.icon className="size-4" aria-hidden />
              </span>
              <span className="text-[13px] font-semibold">{s.title}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{s.hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
