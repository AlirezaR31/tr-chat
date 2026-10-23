"use client";

/** ProductDetails — bottom sheet with full specs (mobile-first, vaul drawer). */
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import type { ProductCardData } from "@/lib/types";
import { formatToman } from "@/lib/format";
import { SafeImage } from "@/components/generative/ui";

export function ProductDetails({
  product,
  onClose,
  onStores,
}: {
  product: ProductCardData | null;
  onClose: () => void;
  onStores: (p: ProductCardData) => void;
}) {
  if (!product) return null;
  const specs: Array<[string, string]> = [
    ["برند / مدل", `${product.brand} · ${product.model}`],
    ["وزن", `${product.specs.weightGrams.toLocaleString("fa-IR")} گرم`],
    ["کوشینگ", `${["خیلی کم", "کم", "متوسط", "خوب", "عالی"][product.specs.cushioning - 1]} (${product.specs.cushioning.toLocaleString("fa-IR")}/۵)`],
    ["دوام", `${product.specs.durability.toLocaleString("fa-IR")}/۵`],
    ["رویه", product.specs.upper],
    ["کفه", product.specs.sole],
    ["اختلاف ارتفاع پاشنه", product.specs.drop],
    ["سایزبندی", product.sizes],
  ];
  return (
    <Drawer open={!!product} onClose={onClose} direction="bottom">
      <DrawerContent className="mx-auto max-w-lg border-border bg-card" dir="rtl">
        <DrawerHeader className="pb-1 text-right">
          <DrawerTitle className="text-sm font-semibold leading-6">{product.name}</DrawerTitle>
        </DrawerHeader>
        <div className="chat-scroll max-h-[62vh] overflow-y-auto px-4 pb-4">
          <div className="mb-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-white">
            <SafeImage
              src={product.image}
              alt={product.name}
              fallbackLabel={product.brand.slice(0, 2)}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-elevated px-3 py-2.5">
            <span className="text-xs leading-5 text-muted-foreground">قیمت پایه</span>
            <span className="text-sm font-bold leading-6">{formatToman(product.priceFrom)}</span>
          </div>
          <dl className="mb-3 space-y-1.5">
            {specs.map(([k, v]) => (
              <div
                key={k}
                className="flex items-start justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2"
              >
                <dt className="shrink-0 text-xs leading-5 text-muted-foreground">{k}</dt>
                <dd className="text-left text-xs font-medium leading-5">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mb-3 rounded-xl border border-border bg-elevated p-3">
            <p className="mb-1 text-sm font-semibold leading-6 text-foreground/90">چرا این مدل؟</p>
            <ul className="list-inside list-disc space-y-1 text-xs leading-5 text-muted-foreground">
              {product.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
              <li>{product.matchReason}</li>
            </ul>
          </div>
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            داده‌ها نمایشی هستند و از مجموعه دیتاست ترب‌چت آمده‌اند؛ قبل از خرید حضوری، قیمت و موجودی را از فروشگاه استعلام کنید.
          </p>
          <Button
            onClick={() => onStores(product)}
            className="mb-2 h-11 w-full rounded-xl text-sm font-semibold"
          >
            دیدن فروشگاه‌های تهران
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
