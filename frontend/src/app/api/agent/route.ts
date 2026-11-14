import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GET /api/agent — the offchain agent's state (agent/state.json).
 *
 * The agent writes prices, price history, positions, decisions and the
 * rationale log to state.json (see agent/src/state.ts). The dashboard
 * reads that file — it never invents agent activity.
 *
 * Where the file lives:
 *  - Local dev / this repo: ../agent/state.json (source of truth).
 *  - Deployed standalone build: public/agent-state.json, refreshed from
 *    agent/state.json at build time (`npm run prebuild`) and on redeploy.
 *  - Later, when the agent runs on the same host: set AGENT_STATE_PATH to
 *    the live file and the dashboard reads it directly.
 */
export const revalidate = 0;

interface AgentState {
  version: number;
  updatedAt: string;
  prices: Record<string, { price: string; updatedAt: number; stale: boolean; fetchedAt: number }>;
  history: Record<string, { price: string; ts: number }[]>;
  positions: Record<string, { amount: string; avgCost: string; totalCost: string }>;
  decisions: unknown[];
  dryRunTrades: unknown[];
  liveTrades: unknown[];
}

function loadState(): AgentState | null {
  const candidates = [
    process.env.AGENT_STATE_PATH,
    join(process.cwd(), "..", "agent", "state.json"),
    join(process.cwd(), "public", "agent-state.json"),
    join(process.cwd(), "data", "agent-state.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf-8")) as AgentState;
      if (raw && raw.version === 1) return raw;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function GET() {
  const state = loadState();
  if (!state) {
    return NextResponse.json(
      {
        available: false,
        error: "agent state.json not found — the agent has not run yet or the state file is not mounted.",
      },
      { status: 200 },
    );
  }
  return NextResponse.json(
    { available: true, ...state },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
