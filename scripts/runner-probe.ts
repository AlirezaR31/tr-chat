import { resolveTurn } from "@/server/agent/runner";
import { DEFAULT_CONTEXT } from "@/lib/types";

async function main() {
  const out = await resolveTurn(
    "برای عروسی دخترخالم چی بپوشم که تو پام اذیت نکنه؟",
    { ...DEFAULT_CONTEXT },
    []
  );
  console.log("SOURCE:", out.source);
  if (out.nlu) console.log("NLU:", JSON.stringify(out.nlu));
  if (out.freeReply) console.log("REPLY:", out.freeReply.slice(0, 200));
  console.log("prefDraft:", JSON.stringify(out.prefDraft));
  process.exit(0);
}
main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
