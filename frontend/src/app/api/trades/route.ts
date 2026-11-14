import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { paperMarketAbi } from "@/lib/abis";
import { BASE_SEPOLIA_RPC_URL, PAPER_MARKET_ADDRESS_SERVER, TICKERS } from "@/lib/config";

/**
 * GET /api/trades — onchain PaperMarket state on Base Sepolia.
 *
 * Primary source: PaperMarket.getTrade(i) / tradeCount() reads (cheap,
 * reliable on the public RPC) + getPosition() for the agent portfolio.
 * Falls back to TradeExecuted event logs when the read path fails.
 * When PAPER_MARKET_ADDRESS is unset the contracts are not deployed yet
 * and this returns { deployed: false } — the dashboard then shows the
 * agent's dry-run record from /api/agent instead of inventing trades.
 */
export const revalidate = 0;

const TRADE_EXECUTED = parseAbiItem(
  "event TradeExecuted(uint256 indexed portfolioId, string indexed ticker, bool isBuy, uint256 tokenAmount, uint256 usdcAmount, int256 price, string rationale)",
);

export async function GET() {
  const address = PAPER_MARKET_ADDRESS_SERVER;
  if (!address) {
    return NextResponse.json({
      deployed: false,
      note: "Contracts not deployed yet — no onchain trades exist. See /api/agent for the agent's dry-run record.",
      trades: [],
      positions: {},
    });
  }

  const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) });
  const market = address as `0x${string}`;
  const portfolioId = Number(process.env.AGENT_PORTFOLIO_ID ?? "1");

  try {
    const count = Number(
      await client.readContract({ address: market, abi: paperMarketAbi, functionName: "tradeCount" }),
    );
    const trades = [];
    const capped = Math.min(count, 200);
    for (let i = 0; i < capped; i++) {
      const t = (await client.readContract({
        address: market,
        abi: paperMarketAbi,
        functionName: "getTrade",
        args: [BigInt(i)],
      })) as {
        portfolioId: bigint;
        ticker: string;
        isBuy: boolean;
        tokenAmount: bigint;
        usdcAmount: bigint;
        price: bigint;
        rationale: string;
        timestamp: bigint;
      };
      trades.push({
        index: i,
        portfolioId: Number(t.portfolioId),
        ticker: t.ticker,
        isBuy: t.isBuy,
        tokenAmount: t.tokenAmount.toString(),
        usdcAmount: t.usdcAmount.toString(),
        price: t.price.toString(),
        rationale: t.rationale,
        timestamp: Number(t.timestamp),
      });
    }

    // Agent portfolio positions, onchain.
    const positions: Record<string, { amount: string; avgCost: string; totalCost: string }> = {};
    for (const t of TICKERS) {
      const p = (await client.readContract({
        address: market,
        abi: paperMarketAbi,
        functionName: "getPosition",
        args: [BigInt(portfolioId), t.ticker],
      })) as { amount: bigint; avgCost: bigint; totalCost: bigint };
      if (p.amount > 0n) {
        positions[t.ticker] = {
          amount: p.amount.toString(),
          avgCost: p.avgCost.toString(),
          totalCost: p.totalCost.toString(),
        };
      }
    }

    return NextResponse.json({
      deployed: true,
      source: "onchain",
      address,
      portfolioId,
      tradeCount: count,
      trades: trades.reverse(),
      positions,
    });
  } catch (e) {
    // Fall back to event logs.
    try {
      const fromBlock = process.env.PAPER_MARKET_DEPLOY_BLOCK
        ? BigInt(process.env.PAPER_MARKET_DEPLOY_BLOCK)
        : 0n;
      const logs = await client.getLogs({
        address: market,
        event: TRADE_EXECUTED,
        fromBlock,
        toBlock: "latest",
      });
      const trades = logs.map((l, i) => ({
        index: i,
        portfolioId: Number(l.args.portfolioId ?? 0),
        ticker: l.args.ticker ?? "",
        isBuy: Boolean(l.args.isBuy),
        tokenAmount: (l.args.tokenAmount ?? 0n).toString(),
        usdcAmount: (l.args.usdcAmount ?? 0n).toString(),
        price: (l.args.price ?? 0n).toString(),
        rationale: l.args.rationale ?? "",
        txHash: l.transactionHash,
        blockNumber: Number(l.blockNumber),
      }));
      return NextResponse.json({
        deployed: true,
        source: "onchain-events",
        address,
        portfolioId,
        tradeCount: trades.length,
        trades: trades.reverse(),
        positions: {},
        warning: "getTrade read path failed; showing indexed TradeExecuted events instead.",
      });
    } catch (e2) {
      return NextResponse.json(
        {
          deployed: true,
          address,
          error:
            "PaperMarket is set but unreadable on Base Sepolia: " +
            (e2 instanceof Error ? e2.message : String(e2)),
          trades: [],
          positions: {},
        },
        { status: 502 },
      );
    }
  }
}
