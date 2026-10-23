import { NextRequest, NextResponse } from "next/server";
import { handleMessage, handleResolved } from "@/lib/agent/orchestrator";
import { validateBlocks } from "@/lib/block-schema";
import { DEFAULT_CONTEXT, type ConversationContext } from "@/lib/types";
import { buildBasketView } from "@/lib/basket/basket-view";
import { SERVER_CONFIG } from "@/server/core/config";
import {
  loadConversation,
  saveConversation,
  mergeContext,
  type StoredMessage,
} from "@/server/services/conversation-memory";
import { resolveTurn, type ResolvedTurn } from "@/server/agent/runner";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat — user text message → agent turn (typed blocks only).
 *
 * Layered pipeline (TorobYar architecture on Next.js):
 *   api route (thin, validates) → conversation memory (server truth)
 *   → agent runner (rules first, LLM tool-loop only for "unknown")
 *   → orchestrator route() (typed blocks, single source of honesty)
 *   → memory save → response {turn, context, basketView, meta}.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, context, message } = body ?? {};
    if (!sessionId || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "invalid_request", message: "sessionId و message الزامی است" },
        { status: 400 }
      );
    }

    /* 1 — memory: server copy is the fallback when the client arrives cold */
    const memory = await loadConversation(sessionId);
    const baseCtx: ConversationContext = mergeContext(context, memory.context);

    /* 2 — resolve: deterministic rules first, LLM tool-loop only if unknown */
    const history: StoredMessage[] = memory.messages;
    const outcome: ResolvedTurn = await resolveTurn(message.trim(), baseCtx, history);

    /* 3 — apply preference updates the model persisted via tools
       (`in` checks propagate explicit clear_fields deletions too) */
    const ctxWithPrefs: ConversationContext = {
      ...baseCtx,
      ...("budgetMax" in outcome.prefDraft ? { budgetMax: outcome.prefDraft.budgetMax } : {}),
      ...("gender" in outcome.prefDraft ? { gender: outcome.prefDraft.gender } : {}),
      ...("useCase" in outcome.prefDraft ? { useCase: outcome.prefDraft.useCase } : {}),
      ...("priorities" in outcome.prefDraft ? { priorities: outcome.prefDraft.priorities } : {}),
    };

    /* 4 — dispatch through the SAME typed orchestrator route */
    let turn;
    let nextCtx: ConversationContext;
    if (outcome.nlu) {
      ({ turn, context: nextCtx } = handleResolved(outcome.nlu, message.trim(), ctxWithPrefs));
    } else if (outcome.freeReply) {
      // free-form chat answer (advice/chit-chat) — never invents catalog data
      nextCtx = ctxWithPrefs;
      turn = {
        text: outcome.freeReply,
        blocks: [
          {
            type: "quick_replies",
            replies: nextCtx.recommendedIds.length
              ? [
                  { label: "کجا حضوری بخرم؟", message: "کجا حضوری بخرمش؟" },
                  { label: "سبد خریدم", message: "سبد خریدم رو نشون بده" },
                ]
              : [
                  { label: "کتانی راحتی زیر ۴ میلیون", message: "کتانی راحتی زیر ۴ میلیون تومان می‌خوام" },
                  { label: "کتانی ورزشی مردانه", message: "کتانی ورزشی مردانه می‌خوام" },
                ],
          },
        ],
      };
    } else {
      ({ turn, context: nextCtx } = handleMessage(message.trim(), ctxWithPrefs));
    }

    /* 5 — persist memory (context + trimmed message log) */
    const nextMessages: StoredMessage[] = [
      ...history,
      { role: "user", content: message.trim().slice(0, 2000) },
      { role: "assistant", content: (turn.text ?? "").slice(0, 2000) },
    ];
    await saveConversation(sessionId, nextCtx, nextMessages);

    /* 6 — basket view + validated blocks */
    const basketView = buildBasketView(nextCtx.basket ?? [], {
      optimizeMode: nextCtx.optimizeMode,
      transport: nextCtx.transport,
      hasRoute: Boolean(nextCtx.lastPlannedAt),
      lastPlannedAt: nextCtx.lastPlannedAt,
      contacted: nextCtx.contacted,
    });

    return NextResponse.json({
      turn: { ...turn, blocks: validateBlocks(turn.blocks) },
      context: nextCtx,
      basketView,
      meta: {
        source: outcome.source,
        agentEnabled: SERVER_CONFIG.agent.enabled,
        toolsTouched: outcome.prefDraft && Object.keys(outcome.prefDraft).length > 0,
      },
    });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
