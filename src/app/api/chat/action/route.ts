import { NextRequest, NextResponse } from "next/server";
import { handleAction } from "@/lib/agent/orchestrator";
import { validateBlocks } from "@/lib/block-schema";
import { simulateContact } from "@/lib/agent/tools";
import { DEFAULT_CONTEXT, type ConversationContext } from "@/lib/types";
import { buildBasketView } from "@/lib/basket/basket-view";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/action — UI actions that need the server.
 *  - contact_store: runs the (simulated, honestly labelled) store contact
 *    with a realistic wait, then returns the honest outcome.
 *  - update_context: silent context sync (filters, GPS location…).
 *  - basket actions (add/remove/update/clear/route/dismiss/mute): server is
 *    the single source of truth; responses always carry a fresh basketView.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, context, action } = body ?? {};
    if (!sessionId || !action?.type) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const ctx: ConversationContext = { ...DEFAULT_CONTEXT, ...(context ?? {}) };

    // realistic ring-time before the outcome (only for contact attempts)
    if (action.type === "contact_store") {
      const storeId = String(action.payload?.storeId ?? "");
      const productId = String(action.payload?.productId ?? ctx.selectedProductId ?? "");
      const sim = simulateContact(storeId, productId);
      if (sim) await new Promise((r) => setTimeout(r, sim.waitMs));
    }

    const { turn, context: nextCtx } = handleAction(action, ctx);
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
    console.error("[/api/chat/action] error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
