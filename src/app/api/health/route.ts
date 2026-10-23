/**
 * GET /api/health — dataset stats + agent status (parity with the lifespan
 * banner TorobYar prints in main.py, exposed as a route for monitoring).
 */
import { NextResponse } from "next/server";
import { dataset } from "@/server/repositories/dataset";
import { SERVER_CONFIG } from "@/server/core/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = dataset.stats();
  return NextResponse.json({
    ok: true,
    service: "torob-shopping-assistant",
    dataset: stats,
    agent: { llmTierEnabled: SERVER_CONFIG.agent.enabled, maxToolRounds: SERVER_CONFIG.agent.maxToolRounds },
  });
}
