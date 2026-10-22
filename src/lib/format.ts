/**
 * Persian formatting helpers: Toman prices, Persian digits, relative time,
 * Jalali dates via Intl (fa-IR default calendar is Persian/Jalali).
 */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** 1938000 -> "۱,۹۳۸,۰۰۰" (grouped, Persian digits — matches reference style) */
export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const grouped = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return toFaDigits(grouped);
}

/** 1938000 -> "از ۱,۹۳۸,۰۰۰ تومان" */
export function formatToman(n: number): string {
  return `${formatNumber(n)} تومان`;
}

/** Compact price for chips: 1938000 -> "۱.۹ میلیون" */
export function formatTomanShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const v = Number.isInteger(m) ? toFaDigits(m) : toFaDigits(m.toFixed(1));
    return `${v} میلیون تومان`;
  }
  if (n >= 1000) return `${toFaDigits(Math.round(n / 1000))} هزار تومان`;
  return formatToman(n);
}

/** Jalali date + time, e.g. "۳۰ مهر، ۱۴:۰۵" */
export function formatJalaliDateTime(ts: number | string): string {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const date = new Intl.DateTimeFormat("fa-IR", {
    day: "numeric",
    month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date}، ${time}`;
}

/** "۲ ساعت پیش" / "دیروز" / "۳۰ مهر" — for verification timestamps */
export function formatRelative(ts: number | string): string {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "همین الان";
  if (min < 60) return `${toFaDigits(min)} دقیقه پیش`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${toFaDigits(h)} ساعت پیش`;
  const days = Math.floor(h / 24);
  if (days === 1) return "دیروز";
  if (days < 7) return `${toFaDigits(days)} روز پیش`;
  return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long" }).format(d);
}

/** Current hour in Tehran (0–23 float) — real timezone math */
export function tehranNow(): { hour: number; minutes: number; date: Date } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minutes = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minutes, date: now };
}
