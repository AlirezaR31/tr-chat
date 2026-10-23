/**
 * Agent runner — mirrors TorobYar `app/agent/agent_runner.py`.
 *
 * Two-tier design ("از این استفاده کن، کم بود بزن خودت"):
 *
 *   Tier 1  deterministic rules (lib/agent/nlu.ts) — zero latency, zero
 *           hallucination, covers every known intent pattern. Always runs.
 *
 *   Tier 2  LLM tool-loop (this file) — engages ONLY when the rules return
 *           "unknown". Like TorobYar's LangChain agent it can call tools
 *           (search/offers/nearby/payment/preferences/basket) for up to
 *           maxToolRounds rounds, then must commit to a final JSON:
 *             {"action":"intent", ...}   → dispatched to the SAME typed
 *                                          orchestrator route() the rules
 *                                          use, so the UI keeps all its
 *                                          honesty guarantees and blocks
 *             {"action":"reply", "reply"} → free-text answer (chat-only
 *                                          topics: sizing advice, care
 *                                          tips, chit-chat)
 *
 * The model never fabricates data into the UI: any product/price/stock
 * claim must be grounded by a tool result that we executed server-side.
 */
import ZAI from "z-ai-web-dev-sdk";
import type { NluResult } from "@/lib/agent/nlu";
import { parseMessage } from "@/lib/agent/nlu";
import type { ConversationContext, Priority } from "@/lib/types";
import { SERVER_CONFIG } from "@/server/core/config";
import { dataset } from "@/server/repositories/dataset";
import {
  runTool,
  TOOL_SPECS,
  type ToolContext,
  type ToolName,
} from "@/server/agent/tools";
import { buildSystemPrompt } from "@/server/agent/prompts";
import { formatTomanShort } from "@/lib/format";
import { buildBasketView } from "@/lib/basket/basket-view";

export type TurnSource = "rules" | "llm-intent" | "llm-reply" | "fallback";

export interface ResolvedTurn {
  source: TurnSource;
  nlu?: NluResult;
  freeReply?: string;
  /** preference updates the model made via update_shopping_preferences */
  prefDraft: Partial<ConversationContext>;
}

const INTENTS = new Set([
  "greet", "search", "refine", "compare", "select_product", "find_stores",
  "cheapest_store", "installment", "set_location", "thanks",
  "add_to_basket", "remove_from_basket", "show_basket", "clear_basket",
  "plan_route", "set_optimize_mode", "set_transport", "cheaper_alternative",
]);

/* --------------------------- state summary --------------------------- */

function stateSummary(ctx: ConversationContext): string {
  const prefs = {
    budget_max_toman: ctx.budgetMax ?? null,
    gender: ctx.gender ?? null,
    use_case: ctx.useCase ?? null,
    priorities: ctx.priorities,
    location: ctx.location?.name ?? null,
    stage: ctx.stage,
  };
  const recent = ctx.recommendedIds.slice(-6).map((id) => {
    const p = dataset.product(id);
    return p ? `${p.id} (${p.name})` : id;
  });
  const basket = ctx.basket.map((b) => {
    const p = dataset.product(b.productId);
    return p ? `${p.name}${b.variant ? ` — ${b.variant}` : ""} ×${b.quantity}` : b.productId;
  });
  const view = ctx.basket.length
    ? buildBasketView(ctx.basket, {
        optimizeMode: ctx.optimizeMode,
        transport: ctx.transport,
        hasRoute: Boolean(ctx.lastPlannedAt),
        contacted: ctx.contacted,
      })
    : null;
  return JSON.stringify(
    {
      preferences: prefs,
      recent_recommendations: recent,
      selected_product: ctx.selectedProductId ?? null,
      basket: { items: basket, estimated_total: view ? formatTomanShort(view.estimatedTotal) : null },
      route_planned: Boolean(ctx.lastPlannedAt),
      recs_muted: ctx.recsMuted,
    },
    null,
    0
  );
}

/* --------------------------- JSON extraction --------------------------- */

function extractJson(content: string): Record<string, unknown> | null {
  const text = content.trim();
  const attempts: string[] = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) attempts.unshift(fence[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Map the model's intent JSON onto our strict NluResult (whitelist + coercion). */
function mapIntent(obj: Record<string, unknown>): NluResult | null {
  const intent = asString(obj.intent);
  if (!intent || !INTENTS.has(intent)) return null;
  const res: NluResult = { intent: intent as NluResult["intent"] };

  if (obj.budgetMax != null) res.budgetMax = asNumber(obj.budgetMax);
  else if (obj.budget_max_toman != null) res.budgetMax = asNumber(obj.budget_max_toman);
  if (asNumber(res.budgetMax as never)) res.budgetMax = Math.round(res.budgetMax as number);

  if (typeof obj.gender === "string" && ["men", "women", "unisex"].includes(obj.gender))
    res.gender = obj.gender as NluResult["gender"];
  if (typeof obj.useCase === "string" && ["daily", "sport"].includes(obj.useCase))
    res.useCase = obj.useCase as NluResult["useCase"];
  if (Array.isArray(obj.priorities))
    res.priorities = (obj.priorities.filter((p) =>
      ["comfort", "price", "durability", "style"].includes(String(p))
    ) as Priority[]).slice(0, 2);
  if (asString(obj.locationName)) res.locationName = asString(obj.locationName);
  if (asString(obj.productRef)) res.productRef = asString(obj.productRef);
  if (asString(obj.product_id)) res.productRef = asString(obj.product_id);
  if (asString(obj.variant)) res.variant = asString(obj.variant);
  if (obj.targetPrice != null || obj.target_price != null) {
    const tp = asNumber(obj.targetPrice ?? obj.target_price);
    if (tp) res.targetPrice = tp;
  }
  if (typeof obj.installmentOnly === "boolean") res.installmentOnly = obj.installmentOnly;
  if (typeof obj.wantsCheapest === "boolean") res.wantsCheapest = obj.wantsCheapest;
  if (
    typeof obj.optimizeMode === "string" &&
    ["fastest", "cheapest", "fewest_stops", "balanced"].includes(obj.optimizeMode)
  )
    res.optimizeMode = obj.optimizeMode as NluResult["optimizeMode"];
  if (typeof obj.transport === "string" && ["car", "walk", "transit"].includes(obj.transport))
    res.transport = obj.transport as NluResult["transport"];
  if (typeof obj.muteRecs === "boolean") res.muteRecs = obj.muteRecs;

  return res;
}

/* ------------------------------ LLM loop ------------------------------ */

interface ChatMsg {
  role: "assistant" | "user";
  content: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function llmLoop(message: string, ctx: ConversationContext, history: ChatMsg[]): Promise<ResolvedTurn> {
  const zai = await ZAI.create();
  const toolCtx: ToolContext = { ctx, prefDraft: {}, seenProducts: [] };

  const toolCatalog = TOOL_SPECS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const messages: ChatMsg[] = [
    {
      role: "assistant",
      content:
        buildSystemPrompt(stateSummary(ctx), "") +
        "\n\n## ابزارهای در دسترس\n" +
        toolCatalog,
    },
    ...history.slice(-6),
    { role: "user", content: message },
  ];

  for (let round = 0; round < SERVER_CONFIG.agent.maxToolRounds; round++) {
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
      }),
      SERVER_CONFIG.agent.timeoutMs,
      "llm"
    );
    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJson(content);

    if (!parsed) {
      // model broke the JSON contract — treat the text itself as the reply
      const text = content.trim();
      if (text) return { source: "llm-reply", freeReply: text, prefDraft: toolCtx.prefDraft };
      break;
    }

    const action = asString(parsed.action);

    if (action === "tool_call") {
      const toolName = asString(parsed.tool) as ToolName | undefined;
      if (!toolName || !TOOL_SPECS.some((t) => t.name === toolName)) {
        messages.push({ role: "assistant", content: JSON.stringify(parsed) });
        messages.push({
          role: "user",
          content: JSON.stringify({ tool_error: "unknown_tool", allowed: TOOL_SPECS.map((t) => t.name) }),
        });
        continue;
      }
      let result: Record<string, unknown>;
      try {
        result = runTool(toolName, parsed.args, toolCtx);
      } catch (err) {
        result = { tool_error: err instanceof Error ? err.message : "tool_failed" };
      }
      console.log(`[runner] round ${round + 1}: tool=${toolName}`);
      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      messages.push({
        role: "user",
        content: JSON.stringify({ tool: toolName, result }, null, 0),
      });
      continue; // next round: model sees the grounded result
    }

    if (action === "intent") {
      const nlu = mapIntent(parsed);
      if (nlu) return { source: "llm-intent", nlu, prefDraft: toolCtx.prefDraft };
      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      messages.push({
        role: "user",
        content: JSON.stringify({ error: "invalid_intent", allowed: [...INTENTS] }),
      });
      continue;
    }

    if (action === "reply" && asString(parsed.reply)) {
      return { source: "llm-reply", freeReply: asString(parsed.reply), prefDraft: toolCtx.prefDraft };
    }

    // unrecognized envelope — one nudge, then give up
    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    messages.push({
      role: "user",
      content: JSON.stringify({ error: 'bad_envelope', expected: ['tool_call', 'intent', 'reply'] }),
    });
  }

  /* Tool budget exhausted — force the final commit (no new tools allowed).
   * This mirrors TorobYar's recursion_limit behaviour: the loop must land
   * on a decision instead of silently degrading to the unknown-fallback. */
  messages.push({
    role: "user",
    content:
      'سهم ابزارها تمام شد. دیگر ابزار صدا نزن؛ بر اساس نتایج بالا فقط JSON نهایی را بده: ' +
      '{"action":"intent",...} یا {"action":"reply","reply":"متن فارسی"}',
  });
  const final = await withTimeout(
    zai.chat.completions.create({ messages, thinking: { type: "disabled" } }),
    SERVER_CONFIG.agent.timeoutMs,
    "llm-final"
  );
  const parsedFinal = extractJson(final.choices[0]?.message?.content ?? "");
  if (parsedFinal) {
    if (asString(parsedFinal.action) === "intent") {
      const nlu = mapIntent(parsedFinal);
      if (nlu) return { source: "llm-intent", nlu, prefDraft: toolCtx.prefDraft };
    }
    if (asString(parsedFinal.action) === "reply" && asString(parsedFinal.reply)) {
      return { source: "llm-reply", freeReply: asString(parsedFinal.reply), prefDraft: toolCtx.prefDraft };
    }
    const rawText = (final.choices[0]?.message?.content ?? "").trim();
    if (rawText) return { source: "llm-reply", freeReply: rawText, prefDraft: toolCtx.prefDraft };
  }

  return { source: "fallback", prefDraft: toolCtx.prefDraft };
}

/* ------------------------------ public API ------------------------------ */

/**
 * Resolve a user message into a dispatchable turn decision.
 * Never throws: every failure path degrades to the deterministic tier.
 */
export async function resolveTurn(
  message: string,
  ctx: ConversationContext,
  history: ChatMsg[] = []
): Promise<ResolvedTurn> {
  // Tier 1 — deterministic rules
  const rules = parseMessage(message, ctx);
  if (rules.intent !== "unknown") {
    return { source: "rules", nlu: rules, prefDraft: {} };
  }

  // Tier 2 — LLM tool loop
  if (!SERVER_CONFIG.agent.enabled) {
    return { source: "fallback", prefDraft: {} };
  }
  try {
    return await llmLoop(message, ctx, history);
  } catch (err) {
    console.error("[runner] LLM tier failed, falling back to rules:", err);
    return { source: "fallback", prefDraft: {} };
  }
}
