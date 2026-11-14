/**
 * Scheduler — one run cycle: watch -> strategize -> relayer push -> execute.
 *
 * Schedule (CONCEPT.md §4): every 30 min during US market hours
 * (13:30–20:00 UTC, Mon–Fri), hourly off-hours. Weekends hold — the feeds
 * hold Friday's close, so the cycle still runs (prices get mirrored to
 * TestOracle) but no trades are placed while the market is closed.
 *
 * One cycle never throws: a failed feed read aborts that cycle (nothing
 * to reason about); a failed LLM call falls back to rule rationale; a
 * failed push/trade is logged per ticker and the cycle continues.
 */
import {
  PAPER_MARKET_ADDRESS,
  TEST_ORACLE_ADDRESS,
  isMarketOpen,
} from "./config.js";
import { assessFreshness, formatPrice, readFeeds, type FeedReading } from "./watcher.js";
import { decide, type Decision, type PricePoint } from "./strategist.js";
import { explainRationale } from "./llm.js";
import { pushPrices } from "./relayer.js";
import { executeDecisions } from "./executor.js";
import {
  appendHistory,
  getHistory,
  getPosition,
  loadState,
  logDecision,
  saveState,
  type AgentState,
  type StoredTrade,
} from "./state.js";

export interface CycleOptions {
  dryRun: boolean;
  /** Skip the LLM rationale calls (rule rationale only). */
  noLlm?: boolean;
}

export interface CycleResult {
  at: string;
  dryRun: boolean;
  marketOpen: boolean;
  readings: FeedReading[];
  decisions: Decision[];
  pushes: number;
  trades: number;
}

/** Run one full cycle. Returns a summary for logging/tests. */
export async function runCycle(opts: CycleOptions): Promise<CycleResult> {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const marketOpen = isMarketOpen(now);
  const state: AgentState = loadState();
  console.log(
    `\n=== StockPilot cycle ${now.toISOString()} (UTC) — market ${marketOpen ? "OPEN" : "CLOSED"} — ${opts.dryRun ? "DRY-RUN" : "LIVE"} ===`,
  );

  // 1. Watch — read real mainnet feeds.
  const readings = await readFeeds();
  const priceMap = new Map<string, bigint>();
  const freshTickers = new Set<string>();
  for (const r of readings) {
    const f = assessFreshness(r.updatedAt, nowSec);
    priceMap.set(r.ticker, r.price);
    const ageH = (f.ageSec / 3600).toFixed(1);
    console.log(
      `[watcher] ${r.ticker} ${formatPrice(r.price)} (feed updated ${new Date(r.updatedAt * 1000).toISOString()}, ` +
        `${ageH}h ago) — ${f.stale ? "STALE, hold" : f.reason}`,
    );
    state.prices[r.ticker] = {
      price: r.price.toString(),
      updatedAt: r.updatedAt,
      stale: f.stale,
      fetchedAt: r.fetchedAt,
    };
    appendHistory(state, r.ticker, { price: r.price, ts: r.fetchedAt } as PricePoint);
    if (!f.stale) freshTickers.add(r.ticker);
  }

  // 2. Strategize — rules decide; LLM explains (BUY/SELL only).
  const decisions: Decision[] = [];
  for (const r of readings) {
    let d: Decision;
    if (!freshTickers.has(r.ticker)) {
      d = {
        ticker: r.ticker,
        action: "HOLD",
        rationale: `${r.ticker} feed is stale; holding (no trades on stale prices).`,
        signals: {
          price: formatPrice(r.price),
          shortMa: null,
          longMa: null,
          momentumPct: null,
          meanRevPct: null,
          volatilityPct: null,
          observations: getHistory(state, r.ticker).length,
        },
        blockedReason: "stale feed",
      };
    } else if (!marketOpen) {
      d = {
        ticker: r.ticker,
        action: "HOLD",
        rationale: `${r.ticker} market closed — feed holds last close ${formatPrice(r.price)}; holding until open.`,
        signals: {
          price: formatPrice(r.price),
          shortMa: null,
          longMa: null,
          momentumPct: null,
          meanRevPct: null,
          volatilityPct: null,
          observations: getHistory(state, r.ticker).length,
        },
        blockedReason: "market closed",
      };
    } else {
      d = decide(r.ticker, getHistory(state, r.ticker), getPosition(state, r.ticker));
    }

    let llmRationale: string | null = null;
    if ((d.action === "BUY" || d.action === "SELL") && !opts.noLlm) {
      llmRationale = await explainRationale({
        ticker: d.ticker,
        action: d.action,
        price: formatPrice(r.price),
        ruleRationale: d.rationale,
      });
      if (llmRationale) d.rationale = llmRationale;
    }
    console.log(`[strategist] ${d.ticker} ${d.action} — ${d.rationale}`);
    logDecision(state, d, llmRationale);
    decisions.push(d);
  }

  // 3. Relayer — mirror prices to TestOracle (even on weekends: the mirror
  //    is a mirror; the contract rejects non-newer pushes with StalePush).
  const pushes = await pushPrices(readings, TEST_ORACLE_ADDRESS, opts.dryRun);
  for (const p of pushes) {
    const entry: StoredTrade = {
      at: now.toISOString(),
      ticker: p.ticker,
      action: "PUSH",
      mode: p.mode,
      txHash: p.txHash ?? null,
      calldata: p.calldata,
      to: p.to,
      args: { price: p.price.toString(), updatedAt: String(p.updatedAt) },
    };
    (p.mode === "dry-run" ? state.dryRunTrades : state.liveTrades).unshift(entry);
  }

  // 4. Execute — only when the market is open and feeds are fresh.
  let trades: Awaited<ReturnType<typeof executeDecisions>> = [];
  if (!marketOpen) {
    console.log("[executor] market closed — no trades this cycle.");
  } else {
    const positions = new Map(
      readings.map((r) => [r.ticker, getPosition(state, r.ticker)!] as const),
    );
    trades = await executeDecisions(decisions, priceMap, positions, PAPER_MARKET_ADDRESS, opts.dryRun);
    for (const t of trades) {
      const entry: StoredTrade = {
        at: now.toISOString(),
        ticker: t.ticker,
        action: t.action,
        mode: t.mode,
        txHash: t.txHash ?? null,
        calldata: t.calldata,
        to: t.to,
        args: t.args,
      };
      (t.mode === "dry-run" ? state.dryRunTrades : state.liveTrades).unshift(entry);
    }
    // NOTE: live positions are updated from confirmed receipts in a later
    // step (Days 9–11 dashboard work reads them onchain via PaperMarket
    // events); dry-run trades never mutate state.positions.
  }

  saveState(state);
  console.log(
    `=== cycle done: ${readings.length} prices, ${decisions.filter((d) => d.action !== "HOLD").length} trade signals, ` +
      `${pushes.length} oracle pushes, ${trades.length} trade txs (${opts.dryRun ? "dry-run" : "live"}) ===\n`,
  );
  return {
    at: now.toISOString(),
    dryRun: opts.dryRun,
    marketOpen,
    readings,
    decisions,
    pushes: pushes.length,
    trades: trades.length,
  };
}

/** Delay until the next run slot: 30 min in market hours, 60 min otherwise. */
export function nextDelayMs(now: Date = new Date()): number {
  const open = isMarketOpen(now);
  const intervalMin = open ? 30 : 60;
  const mins = now.getUTCMinutes();
  const secs = now.getUTCSeconds();
  const elapsedMs = (mins % intervalMin) * 60_000 + secs * 1000 + now.getUTCMilliseconds();
  return intervalMin * 60_000 - elapsedMs;
}

/** Run cycles forever on the schedule. Never exits on a cycle error. */
export async function runLoop(opts: CycleOptions): Promise<never> {
  console.log(
    `[scheduler] loop started — 30 min in market hours (13:30–20:00 UTC Mon–Fri), 60 min off-hours. ` +
      `Ctrl-C to stop.`,
  );
  for (;;) {
    try {
      await runCycle(opts);
    } catch (err) {
      console.error(`[scheduler] cycle failed: ${err instanceof Error ? err.message : err} — continuing.`);
    }
    const delay = nextDelayMs();
    console.log(`[scheduler] next cycle in ${(delay / 60000).toFixed(1)} min.`);
    await new Promise((r) => setTimeout(r, delay));
  }
}
