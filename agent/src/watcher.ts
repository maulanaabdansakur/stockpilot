/**
 * Price watcher — reads Chainlink Coinbase equity feeds on Base Mainnet.
 *
 * Feeds are read-only, no key, 8 decimals, via `latestRoundData()` on the
 * feed proxy. Feeds are 24/5: they hold the last close on weekends and
 * holidays, so every read carries an `updatedAt` staleness assessment and
 * the agent HOLDS (no trades) when a feed is stale. See CONCEPT.md R2.
 */
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASE_MAINNET_RPC_URL, FEED_DECIMALS, MAX_STALE_AGE_SEC, TICKERS, isMarketOpen } from "./config.js";

export const LATEST_ROUND_DATA_ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export interface FeedReading {
  ticker: string;
  feed: `0x${string}`;
  /** Price in 8-decimal fixed point (e.g. $160.77 -> 16077000000n). */
  price: bigint;
  updatedAt: number; // unix seconds, from the feed
  roundId: bigint;
  fetchedAt: number; // unix seconds, local clock
}

export interface Freshness {
  ageSec: number;
  stale: boolean;
  reason: string;
  marketOpen: boolean;
}

/**
 * Pure staleness assessment (unit-tested in watcher.test.ts).
 * A feed is stale for trading when its last update is older than
 * MAX_STALE_AGE_SEC (3 days — covers a normal Fri-close -> Mon-open
 * weekend hold). A fresh-but-weekend value is NOT stale, but the market
 * is closed, so the strategist still holds on it.
 */
export function assessFreshness(updatedAt: number, nowSec: number = Math.floor(Date.now() / 1000)): Freshness {
  const ageSec = nowSec - updatedAt;
  const marketOpen = isMarketOpen(new Date(nowSec * 1000));
  if (ageSec < 0) {
    return { ageSec, stale: false, reason: `feed timestamp ${-ageSec}s in the future (clock skew?)`, marketOpen };
  }
  if (ageSec > MAX_STALE_AGE_SEC) {
    return {
      ageSec,
      stale: true,
      reason: `last update ${(ageSec / 3600).toFixed(1)}h ago exceeds max stale age ${MAX_STALE_AGE_SEC / 3600}h`,
      marketOpen,
    };
  }
  return {
    ageSec,
    stale: false,
    reason: marketOpen
      ? `fresh (${(ageSec / 60).toFixed(1)} min old, market open)`
      : `weekend/off-hours hold (${(ageSec / 3600).toFixed(1)}h old, market closed — last close)`,
    marketOpen,
  };
}

/** Format an 8-decimal fixed-point price as "$123.45". */
export function formatPrice(price8: bigint): string {
  const negative = price8 < 0n;
  const abs = negative ? -price8 : price8;
  const whole = abs / 10n ** BigInt(FEED_DECIMALS);
  const frac = abs % 10n ** BigInt(FEED_DECIMALS);
  return `${negative ? "-" : ""}$${whole}.${frac.toString().padStart(FEED_DECIMALS, "0").slice(0, 2)}`;
}

export function formatUsd8(price8: bigint): string {
  return formatPrice(price8);
}

function mainnetClient() {
  return createPublicClient({ chain: base, transport: http(BASE_MAINNET_RPC_URL) });
}

/** Read all six feeds in one multicall. Retries once on RPC failure. */
export async function readFeeds(): Promise<FeedReading[]> {
  const client = mainnetClient();
  const attempt = async (): Promise<FeedReading[]> => {
    const results = await client.multicall({
      contracts: TICKERS.map((t) => ({
        address: t.feed,
        abi: LATEST_ROUND_DATA_ABI,
        functionName: "latestRoundData",
      })),
    });
    const nowSec = Math.floor(Date.now() / 1000);
    return TICKERS.map((t, i) => {
      const r = results[i];
      if (r.status !== "success") {
        throw new Error(`feed ${t.ticker} (${t.feed}) read failed: ${String(r.error ?? "unknown")}`);
      }
      const [roundId, answer, , updatedAt] = r.result as [bigint, bigint, bigint, bigint, bigint];
      if (answer <= 0n) throw new Error(`feed ${t.ticker} returned non-positive price ${answer}`);
      return {
        ticker: t.ticker,
        feed: t.feed,
        price: answer,
        updatedAt: Number(updatedAt),
        roundId,
        fetchedAt: nowSec,
      };
    });
  };
  try {
    return await attempt();
  } catch (err) {
    // Public RPCs flap (see PROBES.md §2: one transient RemoteDisconnected).
    console.warn(`[watcher] first feed read failed, retrying once: ${err instanceof Error ? err.message : err}`);
    await new Promise((r) => setTimeout(r, 2000));
    return await attempt();
  }
}
