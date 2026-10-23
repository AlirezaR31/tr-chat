"use client";

/**
 * RoutePlanBlock — interactive multi-stop itinerary inside the chat.
 * Schematic map (real coordinates, disclosed demo tile) + a synchronized
 * stop list that stays fully usable without touching the map. All metrics
 * shown are either real (distances, prices, hours) or disclosed estimates
 * (travel minutes) — the methodology footnote ships with the plan.
 */
import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Footprints,
  Car,
  ExternalLink,
  Phone,
  Route as RouteIcon,
  ShoppingBag,
  TrainFront,
  Trash2,
} from "lucide-react";
import type { ActionRequestType, Block, RouteStop } from "@/lib/types";
import { projectBounds } from "@/lib/geo";
import { formatToman, formatTomanShort, toFaDigits } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/generative/ui";

const STOCK_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: { label: "تاییدشده", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  reported: { label: "گزارش فروشنده", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  listing_only: { label: "داده آگهی", className: "bg-secondary text-muted-foreground border-border" },
  unknown: { label: "نامشخص", className: "bg-secondary text-muted-foreground border-border" },
};

const MODE_LABEL: Record<string, string> = {
  fastest: "سریع‌ترین مسیر",
  cheapest: "کم‌هزینه‌ترین خرید",
  fewest_stops: "کمترین توقف",
  balanced: "پیشنهاد متعادل",
};

const TRANSPORT_ICON: Record<string, typeof Car> = { car: Car, walk: Footprints, transit: TrainFront };
const TRANSPORT_LABEL: Record<string, string> = { car: "با ماشین", walk: "پیاده", transit: "حمل‌ونقل عمومی" };

function mapsUrl(stop: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
}

export function RoutePlanBlock({
  block,
  onAction,
  onContactStore,
  busy,
}: {
  block: Extract<Block, { type: "route_plan" }>;
  onAction: (type: ActionRequestType, payload: Record<string, unknown>, label?: string) => void;
  onContactStore: (storeId: string, productId: string, storeName: string) => void;
  busy: boolean;
}) {
  const { plan } = block;
  const [selected, setSelected] = useState<number | null>(null);
  const listRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const { startPt, pins, path } = useMemo(() => {
    const pts = [
      { lat: plan.startLocation.lat, lng: plan.startLocation.lng },
      ...plan.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    ];
    const { project } = projectBounds(pts, 100, 62, 10);
    const start = project({ lat: plan.startLocation.lat, lng: plan.startLocation.lng });
    const pins = plan.stops.map((s) => ({ ...s, pt: project({ lat: s.lat, lng: s.lng }) }));
    const path = [start, ...pins.map((p) => p.pt)];
    return { startPt: start, pins, path };
  }, [plan]);

  const selectStop = (order: number) => {
    setSelected(order);
    listRefs.current[order]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const moveStop = (order: number, dir: -1 | 1) => {
    const ids = plan.stops.map((s) => s.storeId);
    const i = order - 1;
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onAction("move_stop", { order: ids }, "جابه‌جایی ایستگاه");
  };

  const TransportIcon = TRANSPORT_ICON[plan.transport] ?? Car;

  return (
    <Card className="my-1.5 gap-0 overflow-hidden rounded-2xl border-border bg-card">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold leading-6 text-foreground/90">
          <RouteIcon className="size-4 text-primary" aria-hidden />
          برنامه مسیر خرید
        </h4>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="rounded-md border-primary/40 bg-primary/10 px-1.5 leading-4 text-[#f2b8ba]">
            {MODE_LABEL[plan.mode] ?? plan.mode}
          </Badge>
          <Badge variant="outline" className="rounded-md border-border bg-secondary px-1.5 leading-4 text-muted-foreground">
            <TransportIcon className="size-3" aria-hidden />
            {TRANSPORT_LABEL[plan.transport] ?? plan.transport}
          </Badge>
        </div>
      </div>

      {/* map */}
      <div className="px-3 pt-2.5">
        <div className="relative overflow-hidden rounded-xl border border-border bg-[#0d1117]">
          <svg viewBox="0 0 100 62" className="block h-auto w-full" role="img" aria-label="نقشه شماتیک مسیر خرید">
            <g stroke="#161c25" strokeWidth="0.5">
              {[10, 20, 30, 40, 50].map((y) => (
                <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} />
              ))}
              {[14, 28, 42, 56, 70, 84].map((x) => (
                <line key={`v${x}`} x1={x} y1="0" x2={x} y2="62" />
              ))}
              <line x1="0" y1="50" x2="100" y2="12" strokeWidth="0.9" stroke="#1a2029" />
              <line x1="20" y1="62" x2="88" y2="0" strokeWidth="0.9" stroke="#1a2029" />
            </g>

            {/* ordered path */}
            <polyline
              points={path.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgba(229,72,77,0.55)"
              strokeWidth="0.55"
              strokeDasharray="2 1.4"
              strokeLinecap="round"
            />

            {/* start marker */}
            <g>
              <circle cx={startPt.x} cy={startPt.y} r="2.2" fill="#fff" opacity="0.95" />
              <circle cx={startPt.x} cy={startPt.y} r="3.4" fill="none" stroke="#fff" strokeWidth="0.4" opacity="0.5" />
              <text x={startPt.x} y={startPt.y - 4.6} textAnchor="middle" fontSize="2.8" fill="#e8ebf0" className="select-none">
                شروع
              </text>
            </g>

            {/* numbered stop pins */}
            {pins.map((p) => {
              const isSel = selected === p.order;
              return (
                <g
                  key={p.storeId}
                  onClick={() => selectStop(p.order)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`ایستگاه ${p.order}: ${p.storeName}`}
                >
                  {isSel ? <circle cx={p.pt.x} cy={p.pt.y} r="4.6" fill="rgba(229,72,77,0.25)" /> : null}
                  <circle
                    cx={p.pt.x}
                    cy={p.pt.y}
                    r={isSel ? 3.4 : 2.7}
                    fill={p.closedAtArrival ? "#8a6d1a" : isSel ? "#e5484d" : "#232b35"}
                    stroke={isSel ? "#f2555a" : "#3a4452"}
                    strokeWidth="0.5"
                  />
                  <text
                    x={p.pt.x}
                    y={p.pt.y + 1.05}
                    textAnchor="middle"
                    fontSize={isSel ? "2.9" : "2.4"}
                    fontWeight={isSel ? 700 : 500}
                    fill={isSel ? "#fff" : "#aeb7c2"}
                    className="pointer-events-none select-none"
                  >
                    {p.order}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-xs leading-4 text-white/80 backdrop-blur">
            نقشه شماتیک نمایشی · مختصات و فاصله‌ها واقعی
          </div>
        </div>
      </div>

      {/* synchronized stop list */}
      <div className="space-y-2 px-3 pt-2.5">
        {plan.stops.map((stop) => (
          <StopCard
            key={stop.storeId}
            stop={stop}
            selected={selected === stop.order}
            onSelect={() => setSelected(stop.order)}
            onAction={onAction}
            onContactStore={onContactStore}
            onMove={moveStop}
            busy={busy}
            isFirst={stop.order === 1}
            total={plan.stops.length}
            registerRef={(el) => {
              listRefs.current[stop.order] = el;
            }}
          />
        ))}
      </div>

      {/* totals */}
      <div className="mx-3 mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-border/70 bg-secondary/30 p-2.5 text-xs leading-5 sm:grid-cols-3">
        <Total label="جمع کالا" value={formatToman(plan.totalProductCost)} strong />
        <Total label="مسافت کل" value={`${toFaDigits(plan.totalDistanceKm.toLocaleString("fa-IR"))} کیلومتر`} />
        <Total
          label="زمان سفر (برآورد)"
          value={`حدود ${toFaDigits(plan.totalTravelMin)} دقیقه`}
        />
        <Total label="زمان خرید" value={`حدود ${toFaDigits(plan.totalShopMin)} دقیقه`} />
        <Total label="انتظار/استعلام" value={`حدود ${toFaDigits(plan.totalWaitMin)} دقیقه`} />
        <Total
          label="زمان کل"
          value={`حدود ${toFaDigits(plan.totalTravelMin + plan.totalShopMin + plan.totalWaitMin)} دقیقه`}
          strong
        />
      </div>

      {/* trade-off + score */}
      <div className="px-3 pt-2">
        <p className="text-xs leading-5 text-foreground/85">{plan.tradeoff}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(4, plan.score)}%` }} />
          </div>
          <span className="text-xs leading-5 tabular-nums text-muted-foreground">
            امتیاز برنامه {toFaDigits(plan.score)} از ۱۰۰
          </span>
        </div>
      </div>

      {/* failure-recovery notes */}
      {plan.changes.length ? (
        <div className="mx-3 mt-2 space-y-1">
          {plan.changes.map((c, i) => (
            <p key={i} className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs leading-5 text-amber-200">
              {c}
            </p>
          ))}
        </div>
      ) : null}

      {/* unassigned */}
      {plan.unassigned.length ? (
        <div className="mx-3 mt-2 space-y-1">
          {plan.unassigned.map((u) => (
            <p key={u.productId} className="rounded-lg border border-destructive/25 bg-destructive/10 px-2 py-1 text-xs leading-5 text-destructive">
              {u.reason}
            </p>
          ))}
        </div>
      ) : null}

      {/* recalculate controls */}
      <div className="px-3 pt-2.5">
        <p className="mb-1.5 text-xs font-semibold leading-5 text-muted-foreground">محاسبه دوباره با اولویت:</p>
        <div className="flex flex-wrap gap-1.5">
          {(["fastest", "cheapest", "fewest_stops", "balanced"] as const).map((m) => (
            <Pill
              key={m}
              active={plan.mode === m}
              disabled={busy}
              onClick={() => onAction("recalculate_route", { mode: m }, `محاسبه: ${MODE_LABEL[m]}`)}
              className="h-8 px-3"
            >
              {MODE_LABEL[m]}
            </Pill>
          ))}
        </div>
        <p className="mb-1.5 mt-2 text-xs font-semibold leading-5 text-muted-foreground">حمل‌ونقل:</p>
        <div className="flex flex-wrap gap-1.5">
          {(["car", "walk", "transit"] as const).map((tr) => {
            const Icon = TRANSPORT_ICON[tr];
            return (
              <Pill
                key={tr}
                active={plan.transport === tr}
                disabled={busy}
                onClick={() => onAction("recalculate_route", { transport: tr }, `حمل‌ونقل: ${TRANSPORT_LABEL[tr]}`)}
                className="h-8 px-3"
              >
                <Icon className="size-3.5" aria-hidden />
                {TRANSPORT_LABEL[tr]}
              </Pill>
            );
          })}
        </div>
      </div>

      {/* methodology footnote */}
      <p className="px-3 pb-3 pt-2 text-xs leading-5 text-muted-foreground">{plan.methodology}</p>
    </Card>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold text-foreground" : "font-medium text-foreground/85"}`}>{value}</span>
    </div>
  );
}

function StopCard({
  stop,
  selected,
  onSelect,
  onAction,
  onContactStore,
  onMove,
  busy,
  isFirst,
  total,
  registerRef,
}: {
  stop: RouteStop;
  selected: boolean;
  onSelect: () => void;
  onAction: (type: ActionRequestType, payload: Record<string, unknown>, label?: string) => void;
  onContactStore: (storeId: string, productId: string, storeName: string) => void;
  onMove: (order: number, dir: -1 | 1) => void;
  busy: boolean;
  isFirst: boolean;
  total: number;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={registerRef}
      onClick={onSelect}
      className={`rounded-xl border bg-secondary/30 p-2.5 transition-colors ${
        selected ? "border-primary/60 ring-1 ring-primary/30" : "border-border/70"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-5 ${
            stop.closedAtArrival ? "bg-amber-500/25 text-amber-200" : "bg-primary text-white"
          }`}
        >
          {toFaDigits(stop.order)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <h6 className="text-xs font-semibold leading-5 text-foreground">{stop.storeName}</h6>
            <span className="text-xs leading-5 text-muted-foreground">{stop.area}</span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            ساعت کاری {stop.hoursLabel}
            {" · "}
            رسیدن حدود {stop.etaLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={`rounded-md px-1.5 leading-4 ${
                stop.closedAtArrival
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              <Clock3 className="size-3" aria-hidden />
              {stop.closedAtArrival ? "بسته در زمان رسیدن" : "باز در زمان رسیدن"}
            </Badge>
            <Badge variant="outline" className="rounded-md border-border bg-secondary px-1.5 leading-4 text-muted-foreground">
              {stop.clusterLabel}
            </Badge>
          </div>
          {/* leg from previous */}
          {!isFirst && stop.legKm !== null ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              از ایستگاه قبل: {toFaDigits(stop.legKm.toLocaleString("fa-IR"))} کیلومتر
              {stop.legMin !== null ? ` · حدود ${toFaDigits(stop.legMin)} دقیقه` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-bold leading-6 tabular-nums text-foreground">
            {formatTomanShort(stop.subtotal)}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              disabled={busy || stop.order === 1}
              onClick={(e) => {
                e.stopPropagation();
                onMove(stop.order, -1);
              }}
              aria-label={`جابه‌جایی ${stop.storeName} به بالا`}
              className="size-6 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ArrowUp className="size-3" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy || stop.order === total}
              onClick={(e) => {
                e.stopPropagation();
                onMove(stop.order, 1);
              }}
              aria-label={`جابه‌جایی ${stop.storeName} به پایین`}
              className="size-6 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ArrowDown className="size-3" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onAction("remove_stop", { storeId: stop.storeId }, `حذف ${stop.storeName} از مسیر`);
              }}
              aria-label={`حذف ${stop.storeName} از مسیر`}
              className="size-6 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {/* items at this stop */}
      <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
        {stop.items.map((it) => {
          const badge = STOCK_BADGE[it.stockStatus] ?? STOCK_BADGE.unknown;
          return (
            <div key={it.productId} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <ShoppingBag className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-xs leading-5 text-foreground/90">
                  {it.productName}
                  {it.quantity > 1 ? ` × ${toFaDigits(it.quantity)}` : ""}
                </span>
                <Badge variant="outline" className={`shrink-0 rounded-md px-1 leading-4 ${badge.className}`}>
                  {badge.label}
                </Badge>
                {it.installmentVerified ? (
                  <Badge variant="outline" className="shrink-0 rounded-md border-sky-500/30 bg-sky-500/10 px-1 leading-4 text-sky-300">
                    اقساطی
                  </Badge>
                ) : null}
              </div>
              <span className="shrink-0 text-xs leading-5 tabular-nums text-muted-foreground">
                {formatTomanShort(it.price)}
              </span>
            </div>
          );
        })}
      </div>

      {/* actions */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <a
          href={mapsUrl(stop)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-secondary/50 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ExternalLink className="size-3" aria-hidden />
          مسیریابی
        </a>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onContactStore(stop.storeId, stop.items[0].productId, stop.storeName);
          }}
          className="h-7 gap-1 rounded-lg border-border bg-secondary/50 px-2.5 text-xs font-medium text-foreground/90 hover:bg-secondary hover:text-foreground"
        >
          <Phone className="size-3" aria-hidden />
          استعلام موجودی
        </Button>
        <span className="mr-auto text-xs leading-5 text-muted-foreground">
          {stop.address.length > 34 ? `${stop.address.slice(0, 34)}…` : stop.address}
        </span>
      </div>
    </div>
  );
}
