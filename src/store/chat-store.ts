"use client";

/**
 * Client conversation store — Zustand + localStorage persistence.
 * Holds the transcript (messages + generative blocks) and the authoritative
 * ConversationContext echoed to the server on every request. Survives reloads
 * (acceptance scenario 10).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Block,
  ChatMessage,
  ConversationContext,
  QuickReply,
  UserLocation,
} from "@/lib/types";
import { DEFAULT_CONTEXT } from "@/lib/types";

interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  context: ConversationContext;
  topic: string;
  hydrated: boolean;
  addMessage: (m: Omit<ChatMessage, "id" | "at">) => string;
  appendBlocks: (id: string, blocks: Block[]) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  setContext: (c: ConversationContext) => void;
  patchContext: (p: Partial<ConversationContext>) => void;
  setTopic: (t: string) => void;
  reset: () => void;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessionId: makeId(),
      messages: [],
      context: DEFAULT_CONTEXT,
      topic: "تُرب چت",
      hydrated: false,
      addMessage: (m) => {
        const id = makeId();
        set((s) => ({ messages: [...s.messages, { ...m, id, at: Date.now() }] }));
        return id;
      },
      appendBlocks: (id, blocks) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, blocks: [...(m.blocks ?? []), ...blocks] } : m
          ),
        })),
      updateMessage: (id, patch) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      setContext: (c) => set({ context: c }),
      patchContext: (p) => set((s) => ({ context: { ...s.context, ...p } })),
      setTopic: (t) => set({ topic: t }),
      reset: () =>
        set({
          sessionId: makeId(),
          messages: [],
          context: DEFAULT_CONTEXT,
          topic: "تُرب چت",
        }),
    }),
    {
      name: "torob-chat-session-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sessionId: s.sessionId,
        messages: s.messages,
        context: s.context,
        topic: s.topic,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // strip transient pending states from restored messages
          const cleaned = (state.messages ?? []).map((m) =>
            m.pending ? { ...m, pending: false, failed: true } : m
          );
          state.messages = cleaned;
          state.hydrated = true;
        }
      },
    }
  )
);

/** Helper: send a quick reply (posts as a user message). */
export function quickReplyMessage(qr: QuickReply): string | null {
  return qr.message ?? null;
}

export type { UserLocation };
