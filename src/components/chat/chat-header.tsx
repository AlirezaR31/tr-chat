"use client";

/** Sticky header — centered topic, new-chat button, demo badge. */
import { Plus, MessageSquareText } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ChatHeader({ onNewChat }: { onNewChat: () => void }) {
  const topic = useChatStore((s) => s.topic);
  const hasMessages = useChatStore((s) => s.messages.length > 0);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              disabled={!hasMessages}
              aria-label="گفتگوی جدید"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-5" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>گفتگوی جدید</TooltipContent>
        </Tooltip>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold leading-6 text-foreground/95">
          {topic}
        </h1>
        <Badge
          variant="outline"
          className="gap-1 rounded-full px-2 py-1 font-normal leading-4 text-muted-foreground"
        >
          <MessageSquareText className="size-3" aria-hidden />
          نسخه نمایشی
        </Badge>
      </div>
    </header>
  );
}
