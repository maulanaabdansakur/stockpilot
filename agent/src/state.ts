/**
 * Agent state file (JSON) — `agent/state.json`.
 *
 * Records last prices, price history (for the strategist's moving
 * averages), positions, decisions, and the rationale log, so the
 * dashboard (Days 9–11) can read it later. Gitignored runtime state —
 * never committed. Bigints are stored as decimal strings.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Decision, PositionState, PricePoint } from "./strategist.js";

export const MAX_HISTORY_POINTS = 48; // ~24h at 30-min cadence
export const MAX_DECISION_LOG = 100;

export interface StoredPrice {
  price: string; // 8-decimal fixed point, decimal string
  updatedAt: number;
  stale: boolean;
  fetchedAt: number;
}

export interface StoredDecision {
  at: string; // ISO timestamp
  ticker: string;
  action: string;
  rationale: string;
  llmRationale: string | null;
  signals: Decision["signals"];
}

export interface StoredTrade {
  at: string;
  ticker: string;
  action: string;
  mode: "dry-run" | "live";
  txHash: string | null;
  calldata: string;
  to: string;
  args: Record<string, string>;
}

export interface AgentState {
  version: 1;
  updatedAt: string;
  prices: Record<string, StoredPrice>;
  history: Record<string, PricePoint[]>; // JSON: price is a string in file
  positions: Record<string, { amount: string; avgCost: string; totalCost: string }>;
  decisions: StoredDecision[];
  dryRunTrades: StoredTrade[];
  liveTrades: StoredTrade[];
}

const here = dirname(fileURLToPath(import.meta.url));
export const STATE_PATH = join(here, "..", "state.json");

export function emptyState(): AgentState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    prices: {},
    history: {},
    positions: {},
    decisions: [],
    dryRunTrades: [],
    liveTrades: [],
  };
}

export function loadState(): AgentState {
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as AgentState;
    if (raw.version !== 1) return emptyState();
    return raw;
  } catch {
    return emptyState();
  }
}

export function saveState(state: AgentState): void {
  state.updatedAt = new Date().toISOString();
  // JSON cannot serialize bigint: history prices are stored as strings.
  const serializable = {
    ...state,
    history: Object.fromEntries(
      Object.entries(state.history).map(([ticker, points]) => [
        ticker,
        (points as unknown as { price: bigint | string; ts: number }[]).map((p) => ({
          price: p.price.toString(),
          ts: p.ts,
        })),
      ]),
    ),
  };
  writeFileSync(STATE_PATH, JSON.stringify(serializable, null, 2) + "\n", "utf-8");
}

/** History as PricePoints (converting stored string prices to bigint). */
export function getHistory(state: AgentState, ticker: string): PricePoint[] {
  const raw = (state.history[ticker] ?? []) as unknown as { price: string; ts: number }[];
  return raw.map((p) => ({ price: BigInt(p.price), ts: p.ts }));
}

/** Append a price point, capping history length. */
export function appendHistory(state: AgentState, ticker: string, point: PricePoint): void {
  const list = getHistory(state, ticker);
  list.push(point);
  const capped = list.slice(-MAX_HISTORY_POINTS);
  state.history[ticker] = capped as unknown as PricePoint[];
}

export function getPosition(state: AgentState, ticker: string): PositionState | null {
  const p = state.positions[ticker];
  if (!p || BigInt(p.amount) === 0n) return null;
  return { amount: BigInt(p.amount), avgCost: BigInt(p.avgCost), totalCost: BigInt(p.totalCost) };
}

/** Positions only change on CONFIRMED live receipts (executor updates the
 *  caller, which calls this). Dry-run trades never touch positions. */
export function setPosition(state: AgentState, ticker: string, pos: PositionState | null): void {
  if (pos === null || pos.amount === 0n) {
    delete state.positions[ticker];
  } else {
    state.positions[ticker] = {
      amount: pos.amount.toString(),
      avgCost: pos.avgCost.toString(),
      totalCost: pos.totalCost.toString(),
    };
  }
}

export function logDecision(state: AgentState, d: Decision, llmRationale: string | null): void {
  state.decisions.unshift({
    at: new Date().toISOString(),
    ticker: d.ticker,
    action: d.action,
    rationale: d.rationale,
    llmRationale,
    signals: d.signals,
  });
  state.decisions = state.decisions.slice(0, MAX_DECISION_LOG);
}
