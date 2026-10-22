import { NextRequest, NextResponse } from "next/server";
import { handleMessage } from "@/lib/agent/orchestrator";
import { validateBlocks } from "@/lib/block-schema";
import { DEFAULT_CONTEXT, type ConversationContext } from "@/lib/types";
import { buildBasketView } from "@/lib/basket/basket-view";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat — user text message → agent turn (typed blocks only).
 * Stateless: the client echoes its persisted context; the server is the
 * single source of truth for data (catalog + stores + simulator).
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
    const ctx: ConversationContext = { ...DEFAULT_CONTEXT, ...(context ?? {}) };
    const { turn, context: nextCtx } = handleMessage(message.trim(), ctx);
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
    });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
