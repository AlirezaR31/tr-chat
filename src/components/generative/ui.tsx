"use client";

/** Shared small primitives for generative blocks — consistent radii, borders, chips. */
import { cn } from "@/lib/utils";

export function Pill({
  children,
  className,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] leading-6 transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-[#f2b8ba]"
          : "border-border bg-secondary/60 text-foreground/90 hover:bg-secondary",
        "disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Tag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-5 text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export function ScoreBar({
  value,
  max = 100,
  highlight,
  className,
}: {
  value: number;
  max?: number;
  highlight?: boolean;
  className?: string;
}) {
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          highlight ? "bg-primary" : "bg-muted-foreground/60"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h4 className="text-[13px] font-semibold text-foreground/90">{children}</h4>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Safe image with graceful fallback when the asset is missing. */
export function SafeImage({
  src,
  alt,
  className,
  fallbackLabel,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      className={className}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const parent = el.parentElement;
        if (parent && !parent.dataset.fallback) {
          parent.dataset.fallback = "1";
          const div = document.createElement("div");
          div.className =
            "flex h-full w-full items-center justify-center bg-secondary text-lg font-bold text-muted-foreground";
          div.textContent = fallbackLabel;
          parent.appendChild(div);
        }
      }}
    />
  );
}
