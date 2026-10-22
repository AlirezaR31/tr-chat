"use client";

/**
 * ChatShell — the mobile-first conversational shell.
 * Owns: message sending, actions (contact/GPS/filters), compare bar,
 * auto-scroll, product details drawer. All state persists in the
 * zustand store (localStorage) for reload continuity.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Scale, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useChatStore } from "@/store/chat-store";
import type {
  ChatResponseBody,
  Criteria,
  Priority,
  ProductCardData,
  QuickReply,
  StoreCardData,
  StoreFilters as StoreFiltersT,
} from "@/lib/types";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatComposer } from "@/components/chat/composer";
import { ConversationMessage } from "@/components/chat/conversation-message";
import { Hero } from "@/components/chat/hero";
import { ProductDetails } from "@/components/generative/blocks/product-details";
import { PRIORITY_FA } from "@/lib/scoring";

export function ChatShell() {
  const [busy, setBusy] = useState(false);
  const [contactingId, setContactingId] = useState<string | null>(null);
  const [detailsProduct, setDetailsProduct] = useState<ProductCardData | null>(null);
  const [showJump, setShowJump] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useChatStore((s) => s.messages);
  const sessionId = useChatStore((s) => s.sessionId);
  const compareIds = useChatStore((s) => s.context.compareIds);
  const contacted = useChatStore((s) => s.context.contacted);
  const reset = useChatStore((s) => s.reset);

  /* ---------------- scrolling ---------------- */
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => scrollToBottom(true));
    return () => cancelAnimationFrame(id);
  }, [messages.length, busy, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 420);
  };

  /* ---------------- core send ---------------- */
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || useChatStore.getState().messages.some((m) => m.pending)) return;
    const store = useChatStore.getState();
    store.addMessage({ role: "user", text: trimmed });
    const pendingId = store.addMessage({ role: "assistant", pending: true });
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: useChatStore.getState().sessionId,
          context: useChatStore.getState().context,
          message: trimmed,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ChatResponseBody = await res.json();
      useChatStore.getState().updateMessage(pendingId, {
        pending: false,
        text: data.turn.text,
        blocks: data.turn.blocks,
      });
      useChatStore.getState().setContext(data.context);
      if (data.context.category) useChatStore.getState().setTopic("خرید کفش");
    } catch {
      useChatStore.getState().updateMessage(pendingId, { pending: false, failed: true });
    } finally {
      setBusy(false);
    }
  }, []);

  /* ---------------- quick replies / GPS ---------------- */
  const handleQuickReply = useCallback(
    (qr: QuickReply) => {
      if (qr.payload?.requestGps) {
        if (!("geolocation" in navigator)) {
          toast({ title: "موقعیت مکانی در این مرورگر پشتیبانی نمی‌شود", description: "محله‌ات رو تایپ کن." });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            useChatStore.getState().patchContext({
              location: {
                name: "موقعیت من",
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                source: "gps",
              },
            });
            void send(qr.message ?? "فروشگاه‌های نزدیکم رو نشون بده");
          },
          () => {
            toast({
              title: "دسترسی به موقعیت رد شد",
              description: "محله‌ات رو تایپ کن تا فاصله‌ها رو حساب کنم.",
            });
          },
          { timeout: 8000, enableHighAccuracy: false }
        );
        return;
      }
      if (qr.payload?.confirmedOnly) {
        useChatStore.getState().patchContext({
          storeFilters: {
            ...useChatStore.getState().context.storeFilters,
            confirmedStockOnly: true,
          },
        });
        void send("فقط فروشگاه‌های موجودی تاییدشده");
        return;
      }
      if (qr.message) void send(qr.message);
    },
    [send]
  );

  /* ---------------- compare ---------------- */
  const toggleCompare = useCallback((productId: string) => {
    const ctx = useChatStore.getState().context;
    const has = ctx.compareIds.includes(productId);
    const next = has
      ? ctx.compareIds.filter((id) => id !== productId)
      : [...ctx.compareIds, productId].slice(-3);
    useChatStore.getState().patchContext({ compareIds: next });
    if (!has && next.length === 1) {
      toast({ title: "برای مقایسه، یک محصول دیگه هم انتخاب کن" });
    }
  }, []);

  const compareBarVisible = compareIds.length > 0;

  /* ---------------- product actions ---------------- */
  const productStores = useCallback(
    (p: ProductCardData) => {
      useChatStore.getState().patchContext({ selectedProductId: p.id });
      void fetch("/api/chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: useChatStore.getState().sessionId,
          context: useChatStore.getState().context,
          action: { type: "update_context", payload: { selectedProductId: p.id } },
        }),
      }).catch(() => {});
      setDetailsProduct(null);
      void send(`کجا حضوری بخرم؟ (${p.name})`);
    },
    [send]
  );

  const preferencePick = useCallback(
    (p: Priority) => {
      void send(`اولویت: ${PRIORITY_FA[p]}`);
    },
    [send]
  );

  const criteriaChange = useCallback((c: Criteria) => {
    useChatStore.getState().patchContext({ criteria: c });
    void fetch("/api/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: useChatStore.getState().sessionId,
        context: useChatStore.getState().context,
        action: { type: "update_context", payload: { criteria: c } },
      }),
    }).catch(() => {});
  }, []);

  const filtersChange = useCallback((f: StoreFiltersT) => {
    useChatStore.getState().patchContext({ storeFilters: f });
    void fetch("/api/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: useChatStore.getState().sessionId,
        context: useChatStore.getState().context,
        action: { type: "update_context", payload: { storeFilters: f } },
      }),
    }).catch(() => {});
  }, []);

  /* ---------------- store contact ---------------- */
  const contactStore = useCallback(
    async (store: StoreCardData) => {
      if (contactingId) return;
      const productId = useChatStore.getState().context.selectedProductId;
      if (!productId) {
        toast({ title: "اول مدل محصول رو انتخاب کن" });
        return;
      }
      setContactingId(store.id);
      const st = useChatStore.getState();
      st.addMessage({ role: "action", text: `استعلام موجودی از «${store.name}»` });
      const pendingId = st.addMessage({ role: "assistant", pending: true });
      try {
        const res = await fetch("/api/chat/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: useChatStore.getState().sessionId,
            context: useChatStore.getState().context,
            action: {
              type: "contact_store",
              payload: { storeId: store.id, productId },
            },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ChatResponseBody = await res.json();
        useChatStore.getState().updateMessage(pendingId, {
          pending: false,
          text: data.turn.text,
          blocks: data.turn.blocks,
        });
        useChatStore.getState().setContext(data.context);
      } catch {
        useChatStore.getState().updateMessage(pendingId, { pending: false, failed: true });
      } finally {
        setContactingId(null);
      }
    },
    [contactingId]
  );

  /* ---------------- handlers bundle ---------------- */
  const handlers = {
    onQuickReply: handleQuickReply,
    onToggleCompare: toggleCompare,
    onProductDetails: (p: ProductCardData) => setDetailsProduct(p),
    onProductStores: productStores,
    onCriteriaChange: criteriaChange,
    onFiltersChange: filtersChange,
    onContactStore: (s: StoreCardData) => void contactStore(s),
    onPreferencePick: preferencePick,
    compareIds,
    contacted,
    contactingId,
    busy,
  };

  const retryLast = (index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].text) {
        void send(messages[i].text!);
        return;
      }
    }
  };

  const newChat = () => {
    reset();
    setDetailsProduct(null);
    toast({ title: "گفتگوی جدید شروع شد" });
  };

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <ChatHeader onNewChat={newChat} />

      {/* messages */}
      <main
        ref={scrollRef}
        onScroll={onScroll}
        className="chat-scroll relative flex-1 overflow-y-auto overscroll-contain px-3 pt-4"
        aria-label="گفتگو"
      >
        {messages.length === 0 ? (
          <Hero onSuggest={(m) => void send(m)} />
        ) : (
          <div className="space-y-3 pb-4">
            {messages.map((m, i) => (
              <ConversationMessage
                key={m.id}
                message={m}
                handlers={handlers}
                onRetry={() => retryLast(i)}
              />
            ))}
          </div>
        )}
      </main>

      {/* jump-to-bottom FAB */}
      {showJump && messages.length > 0 ? (
        <button
          onClick={() => scrollToBottom(true)}
          aria-label="برو به آخر پیام‌ها"
          className="absolute bottom-32 left-4 z-20 flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground"
        >
          <ArrowDown className="size-4.5" aria-hidden />
        </button>
      ) : null}

      {/* compare bar */}
      {compareBarVisible ? (
        <div className="border-t border-border/70 bg-background/95 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Scale className="size-4 text-primary" aria-hidden />
              {compareIds.length < 2
                ? "برای مقایسه حداقل ۲ محصول انتخاب کن"
                : `${compareIds.length} محصول برای مقایسه انتخاب شد`}
            </div>
            <div className="flex items-center gap-1.5">
              {compareIds.length >= 2 ? (
                <button
                  onClick={() => void send("مقایسه‌شون کن")}
                  disabled={busy}
                  className="min-h-9 rounded-full bg-primary px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  مقایسه کن
                </button>
              ) : null}
              <button
                onClick={() => useChatStore.getState().patchContext({ compareIds: [] })}
                aria-label="پاک کردن انتخاب مقایسه"
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* composer */}
      <div className="border-t border-border/70 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <ChatComposer onSend={(t) => void send(t)} busy={busy} />
          <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">
            دستیار تُرب ممکنه اشتباه کنه؛ اطلاعات مهم رو بررسی کن. داده‌های این نسخه نمایشی است.
          </p>
        </div>
      </div>

      {/* product details drawer */}
      <ProductDetails
        product={detailsProduct}
        onClose={() => setDetailsProduct(null)}
        onStores={productStores}
      />
    </div>
  );
}
