/**
 * Server core config — mirrors TorobYar `app/core/config.py`.
 *
 * All agent behaviour knobs live here; nothing reads process.env outside
 * this module so behaviour is auditable in one place. API credentials are
 * server-only (z-ai-web-dev-sdk resolves them internally; no key reaches
 * the client bundle).
 */
export const SERVER_CONFIG = {
  /**
   * Tier-2 LLM agent (TorobYar-style tool loop). The deterministic Tier-1
   * NLU always runs first; the LLM only engages when the rules cannot
   * classify the message ("unknown"). Disable to force rules-only mode.
   */
  agent: {
    enabled: process.env.AGENT_LLM_DISABLED !== "1",
    /** max tool-calling rounds per turn (TorobYar uses recursion_limit 15;
     * our typed-UI contract converges in ≤3) */
    maxToolRounds: 3,
    /** hard wall-clock budget for the whole loop */
    timeoutMs: 14_000,
  },
  /** server-side conversation memory (Prisma Conversation table) */
  memory: {
    /** keep last N user/assistant messages, like TorobYar (-20) */
    maxMessages: 20,
  },
  /** REST search defaults (GET /api/products/search) */
  search: { defaultLimit: 6, maxLimit: 20 },
} as const;
