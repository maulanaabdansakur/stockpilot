/**
 * LLM rationale layer — free Pollinations text API (no key).
 *
 * RULES DECIDE, LLM EXPLAINS: this only rewords the strategist's
 * rule-based rationale into 1–2 human-readable sentences for the
 * dashboard. It NEVER blocks a trade: any failure (network, timeout,
 * bad response) returns null and the caller falls back to the
 * rule-based rationale text. Proven reachable 2026-11-14 (~2.5 s).
 * See ../PROBES.md §5.
 */
import { POLLINATIONS_API_URL } from "./config.js";

const LLM_TIMEOUT_MS = 45_000; // Pollinations took ~12 s for a long prompt (2026-11-15 probe); 45 s cap, then fall back
const MAX_RATIONALE_CHARS = 300;

export interface RationaleContext {
  ticker: string;
  action: "BUY" | "SELL";
  price: string;
  ruleRationale: string;
}

/** Returns the LLM-written rationale, or null on ANY failure. Never throws. */
export async function explainRationale(ctx: RationaleContext): Promise<string | null> {
  const prompt =
    `You are StockPilot, a paper-trading agent for tokenized stocks on Base. ` +
    `In one or two plain sentences, explain this paper-trade decision for a dashboard feed. ` +
    `Decision: ${ctx.action} ${ctx.ticker} at ${ctx.price}. ` +
    `Rule-based reason: ${ctx.ruleRationale} ` +
    `Do not mention that you are an AI. Do not add disclaimers. Keep it under 280 characters.`;
  const url = `${POLLINATIONS_API_URL.replace(/\/$/, "")}/${encodeURIComponent(prompt)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[llm] Pollinations HTTP ${res.status} for ${ctx.ticker}; using rule rationale.`);
      return null;
    }
    const text = (await res.text()).trim().replace(/\s+/g, " ");
    if (!text) return null;
    return text.slice(0, MAX_RATIONALE_CHARS);
  } catch (err) {
    console.warn(
      `[llm] Pollinations call failed for ${ctx.ticker} (${err instanceof Error ? err.message : err}); using rule rationale.`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
