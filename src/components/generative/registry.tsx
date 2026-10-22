"use client";

/**
 * Controlled Generative-UI registry.
 *
 * The ONLY way agent blocks become UI. Each block type maps to exactly one
 * approved component; every incoming block is zod-validated before render
 * and invalid/unknown blocks fall back to a safe error card. Arbitrary
 * model HTML/JS can never reach the DOM through this path.
 */
import type { Block, Criteria, QuickReply, StoreCardData, StoreFilters as StoreFiltersT } from "@/lib/types";
import { validateBlock } from "@/lib/block-schema";
import { ErrorState, EmptyStateBlock } from "@/components/generative/blocks/empty-state";
import { SearchContextBlock } from "@/components/generative/blocks/search-context";
import { QuickReplies } from "@/components/generative/blocks/quick-replies";
import { PreferenceSelector } from "@/components/generative/blocks/preference-selector";
import { ProductCarousel } from "@/components/generative/blocks/product-card";
import { ProductDetails } from "@/components/generative/blocks/product-details";
import { ComparisonPanel } from "@/components/generative/blocks/comparison-panel";
import { StorePanel } from "@/components/generative/blocks/store-panel";
import { ContactStatus } from "@/components/generative/blocks/contact-status";
import { AlternativeStores } from "@/components/generative/blocks/alternative-stores";
import { DemoNotice } from "@/components/generative/blocks/empty-state";
import type { ProductCardData } from "@/lib/types";

export interface RegistryHandlers {
  onQuickReply: (qr: QuickReply) => void;
  onToggleCompare: (productId: string) => void;
  onProductDetails: (p: ProductCardData) => void;
  onProductStores: (p: ProductCardData) => void;
  onCriteriaChange: (c: Criteria) => void;
  onFiltersChange: (f: StoreFiltersT) => void;
  onContactStore: (store: StoreCardData) => void;
  onPreferencePick: (p: "comfort" | "price" | "durability" | "style") => void;
  compareIds: string[];
  contacted: Record<string, { kind: string; at: number; method: string; note: string; newPrice?: number }>;
  contactingId: string | null;
  busy: boolean;
}

export function BlockRenderer({
  block,
  handlers,
}: {
  block: Block;
  handlers: RegistryHandlers;
}) {
  const safe = validateBlock(block);
  if (!safe) {
    return (
      <ErrorState
        message="یک بخش از پاسخ قابل نمایش نبود — بقیه گفتگو سالمه."
      />
    );
  }

  switch (safe.type) {
    case "text":
      return (
        <p className="whitespace-pre-line text-[13.5px] leading-7 text-foreground/95">
          {safe.text}
        </p>
      );
    case "search_context":
      return <SearchContextBlock block={safe} />;
    case "product_carousel":
      return (
        <ProductCarousel
          products={safe.products}
          title={safe.title}
          compareIds={handlers.compareIds}
          onToggleCompare={handlers.onToggleCompare}
          onDetails={handlers.onProductDetails}
          onStores={handlers.onProductStores}
        />
      );
    case "product_details":
      // inline inside transcript only when pushed as standalone block
      return (
        <ProductDetailsInline product={safe.product} handlers={handlers} />
      );
    case "comparison_panel":
      return <ComparisonPanel block={safe} onCriteriaChange={handlers.onCriteriaChange} />;
    case "preference_selector":
      return <PreferenceSelector block={safe} onPick={handlers.onPreferencePick} disabled={handlers.busy} />;
    case "store_panel":
      return (
        <StorePanel
          block={safe}
          contacted={handlers.contacted}
          onFiltersChange={handlers.onFiltersChange}
          onContact={handlers.onContactStore}
          contactingId={handlers.contactingId}
        />
      );
    case "contact_status":
      return <ContactStatus block={safe} />;
    case "alternative_stores":
      return (
        <AlternativeStores
          block={safe}
          onContact={handlers.onContactStore}
          contactingId={handlers.contactingId}
        />
      );
    case "empty_state":
      return <EmptyStateBlock block={safe} onPick={handlers.onQuickReply} />;
    case "quick_replies":
      return <QuickReplies replies={safe.replies} onPick={handlers.onQuickReply} disabled={handlers.busy} />;
    case "demo_notice":
      return <DemoNotice label={safe.label} />;
    default:
      return <ErrorState message="نوع پاسخ شناخته نشد." />;
  }
}

/** Standalone product_details inside transcript → compact summary card. */
import { formatToman } from "@/lib/format";
import { SafeImage, ScoreBar } from "@/components/generative/ui";
import { ChevronLeft } from "lucide-react";

function ProductDetailsInline({
  product,
  handlers,
}: {
  product: ProductCardData;
  handlers: RegistryHandlers;
}) {
  return (
    <article className="my-1.5 rounded-2xl border border-border bg-card p-2.5">
      <div className="flex gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-white">
          <SafeImage
            src={product.image}
            alt={product.name}
            fallbackLabel={product.brand.slice(0, 2)}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h5 className="mb-0.5 truncate text-[13px] font-semibold">{product.name}</h5>
          <p className="mb-1 text-[11px] text-muted-foreground">
            {product.brand} · {product.model} · سایز {product.sizes}
          </p>
          <p className="text-[13px] font-bold">{formatToman(product.priceFrom)}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <ScoreBar value={product.matchScore} className="w-20" highlight />
            <span className="text-[10px] text-muted-foreground">
              {product.matchScore}٪ تطابق
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={() => handlers.onProductStores(product)}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-secondary/50 py-2 text-[12px] font-medium text-foreground/90 transition-colors hover:bg-secondary"
      >
        دیدن فروشگاه‌های تهران
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>
    </article>
  );
}

export { ProductDetails };
