export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
type Options = { messages: AiMessage[]; mode: "free" | "premium" | "support"; maxTokens: number; schema?: Record<string, unknown>; signal?: AbortSignal };
const unavailableUntil = new Map<string, number>();

/** One compact request, at most one fallback. Logs contain usage, never user text or credentials. */
export async function compactCompletion(options: Options): Promise<{ text: string; inputTokens: number; outputTokens: number; provider: string } | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim(), routerKey = process.env.OPENROUTER_API_KEY?.trim(), nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  const providers = [
    ...(options.mode !== "free" && openaiKey ? [{ name: "openai", key: openaiKey, url: "https://api.openai.com/v1/responses", model: (options.mode === "support" ? process.env.OPENAI_SUPPORT_MODEL : process.env.OPENAI_DISCOVERY_MODEL)?.trim() || "gpt-4o-mini" }] : []),
    ...(routerKey ? [{ name: "openrouter", key: routerKey, url: "https://openrouter.ai/api/v1/chat/completions", model: (options.mode === "support" ? process.env.OPENROUTER_SUPPORT_MODEL : process.env.OPENROUTER_DISCOVERY_MODEL)?.trim() || process.env.OPENROUTER_MODEL?.trim() || "nvidia/nemotron-3.5-lightning:free" }] : []),
    ...(nvidiaKey && !nvidiaKey.startsWith("sk-or-") ? [{ name: "nvidia", key: nvidiaKey, url: "https://integrate.api.nvidia.com/v1/chat/completions", model: process.env.NVIDIA_DISCOVERY_MODEL?.trim() || "nvidia/nemotron-3.5-lightning-30b-a3b" }] : []),
  ].slice(0, 2);
  for (const provider of providers) {
    if (options.signal?.aborted) return null;
    if ((unavailableUntil.get(provider.name) || 0) > Date.now()) continue;
    const timeout = provider.name === "openrouter" && provider.model.endsWith(":free") ? 45000 : 18000;
    try {
      const response = await fetch(provider.url, {
        method: "POST", headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(provider.name === "openai" ? {
          model: provider.model, input: options.messages, max_output_tokens: options.maxTokens, store: false,
          ...(options.schema ? { text: { format: { type: "json_schema", name: "grounded_ranking", strict: true, schema: options.schema } } } : {}),
        } : {
          model: provider.model, messages: options.messages, temperature: 0, max_tokens: options.maxTokens, stream: false,
          ...(provider.name === "openrouter" ? { reasoning: { effort: "none", exclude: true }, include_reasoning: false } : {}),
          // This free model does not support response_format. Its JSON is still
          // validated against the source IDs and exact quotes before use.
          ...(options.schema && !provider.model.endsWith(":free") ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 429) unavailableUntil.set(provider.name, Date.now() + 5 * 60_000);
        await response.body?.cancel(); console.warn("AI provider unavailable", provider.name, response.status); continue;
      }
      const data = await response.json() as {
        status?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
        usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      };
      if (data.status === "incomplete" || data.choices?.[0]?.finish_reason === "length") continue;
      const text = provider.name === "openai" ? (data.output || []).flatMap(item => item.type === "message" ? item.content || [] : []).filter(item => item.type === "output_text").map(item => item.text || "").join("\n") : data.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) continue;
      const usage = { inputTokens: data.usage?.input_tokens ?? data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? data.usage?.completion_tokens ?? 0 };
      console.info("AI usage", { task: options.mode, provider: provider.name, ...usage });
      return { text: text.trim(), ...usage, provider: provider.name };
    } catch { console.warn("AI provider request failed", provider.name); }
  }
  return null;
}
