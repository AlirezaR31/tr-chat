"use client";

/** Sticky header — centered topic, new-chat button, demo badge. */
import { Plus, MessageSquareText } from "lucide-react";
import { useChatStore } from "@/store/chat-store";

export function ChatHeader({ onNewChat }: { onNewChat: () => void }) {
  const topic = useChatStore((s) => s.topic);
  const hasMessages = useChatStore((s) => s.messages.length > 0);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-3">
        <button
          onClick={onNewChat}
          disabled={!hasMessages}
          aria-label="گفتگوی جدید"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
        >
          <Plus className="size-5" aria-hidden />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[14.5px] font-semibold text-foreground/95">
          {topic}
        </h1>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
          <MessageSquareText className="size-3" aria-hidden />
          نسخه نمایشی
        </span>
      </div>
    </header>
  );
}
