"use client";

/** ConversationMessage — user bubble / action chip / assistant block stack. */
import type { ChatMessage } from "@/lib/types";
import { BlockRenderer, type RegistryHandlers } from "@/components/generative/registry";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { ErrorState } from "@/components/generative/blocks/empty-state";

export function ConversationMessage({
  message,
  handlers,
  onRetry,
}: {
  message: ChatMessage;
  handlers: RegistryHandlers;
  onRetry?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="msg-in flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-bubble px-3.5 py-2.5 text-[13.5px] leading-7 text-foreground">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === "action") {
    return (
      <div className="msg-in flex justify-center py-0.5">
        <span className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-[11px] text-muted-foreground">
          {message.text}
        </span>
      </div>
    );
  }

  // assistant
  if (message.failed) {
    return <ErrorState onRetry={onRetry} />;
  }
  if (message.pending) {
    return <TypingIndicator />;
  }
  return (
    <div className="msg-in space-y-0.5">
      {(message.blocks ?? []).map((b, i) => (
        <BlockRenderer key={i} block={b} handlers={handlers} />
      ))}
    </div>
  );
}
