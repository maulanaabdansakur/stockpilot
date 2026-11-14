import { NextResponse } from "next/server";
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { feedAbi } from "@/lib/abis";
import { BASE_MAINNET_RPC_URLS, MAX_STALE_AGE_SEC, TICKERS, isMarketOpen } from "@/lib/config";

/**
 * GET /api/prices — live Chainlink Coinbase equity feeds on Base Mainnet.
 * Read-only, no API key. Feeds are 24/5: on weekends / outside market
 * hours they hold the last close — that is expected, not an error.
 * Response is cached 60 s (feeds update at most every 24 h / 0.5% move).
 */
export const revalidate = 0;

export async function GET() {
  const client = createPublicClient({
    chain: base,
    transport: fallback(BASE_MAINNET_RPC_URLS.map((u) => http(u, { timeout: 12_000 }))),
  });
  const nowSec = Math.floor(Date.now() / 1000);
  const marketOpen = isMarketOpen(new Date());

  const results = await Promise.all(
    TICKERS.map(async (t) => {
      try {
        const [roundId, answer, , updatedAt] = await client.readContract({
          address: t.feed,
          abi: feedAbi,
          functionName: "latestRoundData",
        });
        const ageSec = nowSec - Number(updatedAt);
        const stale = ageSec > MAX_STALE_AGE_SEC;
        return {
          ticker: t.ticker,
          feed: t.feed,
          price: answer.toString(), // 8-decimal fixed point
          priceUsd: Number(answer) / 1e8,
          updatedAt: Number(updatedAt),
          ageSec,
          stale,
          roundId: roundId.toString(),
          ok: true as const,
        };
      } catch (e) {
        return {
          ticker: t.ticker,
          feed: t.feed,
          price: null,
          priceUsd: null,
          updatedAt: null,
          ageSec: null,
          stale: true,
          roundId: null,
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  const anyStale = results.some((r) => r.stale);
  const status = marketOpen
    ? anyStale
      ? "market-open-stale"
      : "market-open"
    : "market-closed-hold";

  return NextResponse.json(
    {
      status,
      marketOpen,
      fetchedAt: new Date().toISOString(),
      note:
        "Chainlink Coinbase tokenized-equity feeds on Base Mainnet (8 decimals, 24/5). " +
        "Weekend / off-hours values are the last close — expected hold, not a failure.",
      prices: results,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
