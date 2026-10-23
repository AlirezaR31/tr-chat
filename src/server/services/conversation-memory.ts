/**
 * Conversation memory — mirrors TorobYar
 * `app/services/conversation_memory.py` (SQLite upsert per conversation).
 *
 * Our implementation persists to the Prisma `Conversation` table:
 *   - last N user/assistant messages (context for the LLM tier)
 *   - the server's copy of the ConversationContext
 *
 * Conflict rule: the client echoes its localStorage context and WINS while
 * it is present (it carries live basket edits); the server copy is the
 * fallback when the client arrives cold (new device / cleared storage) so
 * the conversation survives client state loss.
 */
import { db } from "@/lib/db";
import { DEFAULT_CONTEXT, type ConversationContext } from "@/lib/types";
import { SERVER_CONFIG } from "@/server/core/config";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationMemory {
  context: ConversationContext | null;
  messages: StoredMessage[];
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export async function loadConversation(sessionId: string): Promise<ConversationMemory> {
  try {
    const row = await db.conversation.findUnique({ where: { sessionId } });
    if (!row) return { context: null, messages: [] };
    return {
      context: safeParse<ConversationContext | null>(row.contextJson, null),
      messages: safeParse<StoredMessage[]>(row.messagesJson, []),
    };
  } catch (err) {
    console.error("[memory] load failed:", err);
    return { context: null, messages: [] };
  }
}

export async function saveConversation(
  sessionId: string,
  context: ConversationContext,
  messages: StoredMessage[]
): Promise<void> {
  const trimmed = messages.slice(-SERVER_CONFIG.memory.maxMessages);
  const data = {
    contextJson: JSON.stringify(context),
    messagesJson: JSON.stringify(trimmed),
  };
  try {
    await db.conversation.upsert({
      where: { sessionId },
      create: { sessionId, ...data },
      update: data,
    });
  } catch (err) {
    console.error("[memory] save failed:", err);
  }
}

export async function clearConversation(sessionId: string): Promise<void> {
  try {
    await db.conversation.deleteMany({ where: { sessionId } });
  } catch (err) {
    console.error("[memory] clear failed:", err);
  }
}

/** Fresh context with server fallback merge (client wins when present). */
export function mergeContext(
  clientContext: Partial<ConversationContext> | undefined,
  serverContext: ConversationContext | null
): ConversationContext {
  if (clientContext && Object.keys(clientContext).length > 0) {
    return { ...DEFAULT_CONTEXT, ...clientContext };
  }
  if (serverContext) {
    return { ...DEFAULT_CONTEXT, ...serverContext };
  }
  return { ...DEFAULT_CONTEXT };
}
