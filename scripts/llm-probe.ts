import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "تو دستیار خرید ترب هستی. فقط یک شیء JSON معتبر برگردان: {\"action\":\"intent\",\"intent\":\"search\",\"productRef\":\"...\"} یا {\"action\":\"reply\",\"reply\":\"متن\"} یا {\"action\":\"tool_call\",\"tool\":\"search_products\",\"args\":{\"query\":\"...\"}}",
      },
      { role: "user", content: "برای عروسی دخترخالم چی بپوشم که تو پام اذیت نکنه؟" },
    ],
    thinking: { type: "disabled" },
  });
  console.log("FULL:", JSON.stringify(completion, null, 2).slice(0, 1500));
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
