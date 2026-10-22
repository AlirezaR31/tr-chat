"use client";

/**
 * StoreMap — dependency-free schematic map.
 * Pins are placed by real lat/lng (equirectangular projection), distances are
 * real haversine results. A 5km ring is drawn from the same projection, so
 * the map never lies about geometry; tiles are intentionally omitted in the
 * sandbox (demo adapter — see docs in README).
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { StoreCardData, UserLocation } from "@/lib/types";
import { projectBounds } from "@/lib/geo";
import { formatTomanShort } from "@/lib/format";

export function StoreMap({
  stores,
  location,
  selectedId,
  onSelect,
}: {
  stores: StoreCardData[];
  location: UserLocation;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { userPt, pins, ringPx } = useMemo(() => {
    const pts = [
      { lat: location.lat, lng: location.lng },
      ...stores.map((s) => ({ lat: s.lat, lng: s.lng })),
    ];
    const { project } = projectBounds(pts, 100, 62, 10);
    // 5km ring: project a point 5km north of the user
    const north5km = { lat: location.lat + 5 / 111.32, lng: location.lng };
    const user = project({ lat: location.lat, lng: location.lng });
    const n5 = project(north5km);
    return {
      userPt: user,
      ringPx: Math.abs(user.y - n5.y),
      pins: stores.map((s, i) => ({
        ...s,
        idx: i + 1,
        pt: project({ lat: s.lat, lng: s.lng }),
      })),
    };
  }, [stores, location]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-[#0d1117]">
      <svg
        viewBox="0 0 100 62"
        className="block h-auto w-full"
        role="img"
        aria-label={`نقشه شماتیک فروشگاه‌ها نسبت به ${location.name}`}
      >
        {/* street grid (decorative) */}
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

        {/* 5km ring around user */}
        <circle
          cx={userPt.x}
          cy={userPt.y}
          r={Math.max(ringPx, 4)}
          fill="rgba(229,72,77,0.045)"
          stroke="rgba(229,72,77,0.28)"
          strokeWidth="0.35"
          strokeDasharray="1.6 1.4"
        />

        {/* user marker */}
        <g>
          <circle cx={userPt.x} cy={userPt.y} r="2.1" fill="#fff" opacity="0.95" />
          <circle cx={userPt.x} cy={userPt.y} r="3.4" fill="none" stroke="#fff" strokeWidth="0.4" opacity="0.5" />
          <text
            x={userPt.x}
            y={userPt.y - 4.4}
            textAnchor="middle"
            fontSize="3"
            fill="#e8ebf0"
            className="select-none"
          >
            {location.name}
          </text>
        </g>

        {/* store pins */}
        {pins.map((p) => {
          const selected = p.id === selectedId;
          return (
            <g
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`${p.name}، ${formatTomanShort(p.price)}`}
            >
              {selected ? (
                <circle cx={p.pt.x} cy={p.pt.y} r="4.6" fill="rgba(229,72,77,0.25)" />
              ) : null}
              <circle
                cx={p.pt.x}
                cy={p.pt.y}
                r={selected ? 3.4 : 2.6}
                fill={selected ? "#e5484d" : "#232b35"}
                stroke={selected ? "#f2555a" : "#3a4452"}
                strokeWidth="0.5"
              />
              <text
                x={p.pt.x}
                y={p.pt.y + 1.05}
                textAnchor="middle"
                fontSize={selected ? "2.9" : "2.4"}
                fontWeight={selected ? 700 : 500}
                fill={selected ? "#fff" : "#aeb7c2"}
                className="pointer-events-none select-none"
              >
                {p.idx}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[9.5px] text-white/80 backdrop-blur">
        نقشه شماتیک نمایشی · فاصله‌ها واقعی (هaversine)
      </div>
    </div>
  );
}

export function MapLegend({ count }: { count: number }) {
  return (
    <span className={cn("text-[10px] text-muted-foreground")}>
      {count} فروشگاه روی نقشه
    </span>
  );
}
