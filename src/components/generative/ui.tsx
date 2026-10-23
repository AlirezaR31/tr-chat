"use client";

/**
 * Shared small primitives for generative blocks.
 * Built on shadcn/ui (Button, Badge) so focus rings, disabled states,
 * tap heights and typography stay consistent everywhere.
 *
 * Type scale (see globals.css): text-sm/leading-6 body · text-xs/leading-5 meta.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Rounded chip button (quick replies, filters, criteria) — shadcn Button under the hood. */
export function Pill({
  children,
  className,
  active,
  ...props
}: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      {...props}
      variant="outline"
      className={cn(
        "h-9 gap-1.5 rounded-full border-border bg-secondary/60 px-3.5 text-xs font-medium leading-5 hover:bg-secondary hover:text-foreground",
        active &&
          "border-primary/60 bg-primary/15 text-[#f2b8ba] hover:bg-primary/20 hover:text-[#f2b8ba]",
        className
      )}
    >
      {children}
    </Button>
  );
}

/** Small meta chip — shadcn Badge. */
export function Tag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 rounded-md bg-secondary px-1.5 font-normal leading-4 text-muted-foreground", className)}
    >
      {children}
    </Badge>
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
      <h4 className="text-sm font-semibold leading-6 text-foreground/90">{children}</h4>
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
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
