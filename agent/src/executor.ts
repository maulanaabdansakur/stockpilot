/**
 * Executor — submits paper buy/sell transactions to PaperMarket on
 * Base Sepolia, per the strategist's decisions.
 *
 * Contract rules enforced onchain (see ../contracts/src/PaperMarket.sol):
 *  - Trades execute AT the TestOracle price. The agent passes its expected
 *    price (maxPrice on buy / minPrice on sell); the contract requires it
 *    within `maxDeviationBps` (default 100 = ±1%) of the oracle price.
 *  - Buy: maxPrice must ALSO be >= oracle price (never pay above the cap).
 *    Sell: minPrice must ALSO be <= oracle price (never accept below floor).
 *  - The oracle price itself must be fresh (not stale per maxStaleAge, 3d).
 *
 * This module mirrors those rules offchain: expected prices are set 0.5%
 * inside the band (buy cap = price * 1.005, sell floor = price * 0.995),
 * so a trade can only fail onchain if the oracle moved >0.5% between the
 * relayer push and the trade — in which case the revert is correct.
 *
 * Dry-run mode (no PAPER_MARKET_ADDRESS, or --dry-run): no transaction is
 * sent; the exact calldata that WOULD be sent is logged and returned.
 * Positions in the state file are only updated on confirmed live receipts —
 * dry-run trades are recorded separately and never mutate positions.
 */
import { createPublicClient, createWalletClient, encodeFunctionData, http } from "viem";
import type { Account, Chain, PublicClient, Transport, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_RPC_URL, PORTFOLIO_ID, SELL_FRACTION_BPS, TRADE_USDC_AMOUNT, loadAgentWallet } from "./config.js";
import type { Decision } from "./strategist.js";
import type { PositionState } from "./strategist.js";

export const PAPER_MARKET_ABI = [
  {
    name: "buy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "portfolioId", type: "uint256" },
      { name: "ticker", type: "string" },
      { name: "usdcAmount", type: "uint256" },
      { name: "maxPrice", type: "int256" },
      { name: "rationale", type: "string" },
    ],
    outputs: [{ name: "tokenAmount", type: "uint256" }],
  },
  {
    name: "sell",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "portfolioId", type: "uint256" },
      { name: "ticker", type: "string" },
      { name: "tokenAmount", type: "uint256" },
      { name: "minPrice", type: "int256" },
      { name: "rationale", type: "string" },
    ],
    outputs: [{ name: "usdcOut", type: "uint256" }],
  },
] as const;

/** Buy cap: oracle price + 0.5% (inside the ±1% onchain band, >= oracle). */
export function buyMaxPrice(oraclePrice: bigint): bigint {
  return (oraclePrice * 10050n) / 10000n;
}

/** Sell floor: oracle price − 0.5% (inside the ±1% onchain band, <= oracle). */
export function sellMinPrice(oraclePrice: bigint): bigint {
  return (oraclePrice * 9950n) / 10000n;
}

export interface TradeResult {
  ticker: string;
  action: "BUY" | "SELL";
  mode: "dry-run" | "live";
  calldata: `0x${string}`;
  to: `0x${string}`;
  txHash?: `0x${string}`;
  skipped?: string;
  /** Args, for the state log / dashboard. */
  args: Record<string, string>;
}

export function buildBuyCalldata(
  portfolioId: number,
  ticker: string,
  usdcAmount: bigint,
  maxPrice: bigint,
  rationale: string,
): `0x${string}` {
  return encodeFunctionData({
    abi: PAPER_MARKET_ABI,
    functionName: "buy",
    args: [BigInt(portfolioId), ticker, usdcAmount, maxPrice, rationale],
  });
}

export function buildSellCalldata(
  portfolioId: number,
  ticker: string,
  tokenAmount: bigint,
  minPrice: bigint,
  rationale: string,
): `0x${string}` {
  return encodeFunctionData({
    abi: PAPER_MARKET_ABI,
    functionName: "sell",
    args: [BigInt(portfolioId), ticker, tokenAmount, minPrice, rationale],
  });
}

/**
 * Execute all BUY/SELL decisions. `prices` maps ticker -> current oracle
 * price (8 decimals). `positions` maps ticker -> open position (needed to
 * size sells). HOLD decisions are ignored. Returns one result per attempted
 * trade.
 */
export async function executeDecisions(
  decisions: Decision[],
  prices: Map<string, bigint>,
  positions: Map<string, PositionState>,
  marketAddress: `0x${string}` | "",
  dryRun: boolean,
): Promise<TradeResult[]> {
  const results: TradeResult[] = [];
  const to = (marketAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`;

  const live = !dryRun && !!marketAddress;
  let walletClient: WalletClient<Transport, Chain, Account> | null = null;
  let publicClient: PublicClient<Transport, Chain> | null = null;
  if (live) {
    const { privateKey } = loadAgentWallet();
    const account = privateKeyToAccount(privateKey);
    // The concrete baseSepolia client type is narrower than the generic
    // Chain client type (different block shapes); the cast is safe — the
    // client is only used for waitForTransactionReceipt here.
    publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(BASE_SEPOLIA_RPC_URL),
    }) as unknown as PublicClient<Transport, Chain>;
    walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(BASE_SEPOLIA_RPC_URL),
    }) as unknown as WalletClient<Transport, Chain, Account>;
  }

  for (const d of decisions) {
    if (d.action === "HOLD") continue;
    const price = prices.get(d.ticker);
    if (price === undefined) {
      console.warn(`[executor] ${d.ticker}: no price, skipping ${d.action}.`);
      continue;
    }
    const rationale = d.rationale.slice(0, 500);

    if (d.action === "BUY") {
      const maxPrice = buyMaxPrice(price);
      const calldata = buildBuyCalldata(PORTFOLIO_ID, d.ticker, TRADE_USDC_AMOUNT, maxPrice, rationale);
      const args = {
        portfolioId: String(PORTFOLIO_ID),
        ticker: d.ticker,
        usdcAmount: TRADE_USDC_AMOUNT.toString(),
        maxPrice: maxPrice.toString(),
        rationale,
      };
      if (!live) {
        console.log(
          `[executor] DRY-RUN buy(${PORTFOLIO_ID}, ${d.ticker}, ${TRADE_USDC_AMOUNT} usdc, maxPrice=${maxPrice}) -> ${marketAddress || "<PAPER_MARKET_ADDRESS unset>"} calldata=${calldata}`,
        );
        results.push({ ticker: d.ticker, action: "BUY", mode: "dry-run", calldata, to, args });
        continue;
      }
      try {
        const hash = await walletClient!.writeContract({
          address: marketAddress as `0x${string}`,
          abi: PAPER_MARKET_ABI,
          functionName: "buy",
          args: [BigInt(PORTFOLIO_ID), d.ticker, TRADE_USDC_AMOUNT, maxPrice, rationale],
        });
        const receipt = await publicClient!.waitForTransactionReceipt({ hash });
        console.log(`[executor] buy(${d.ticker}) confirmed in ${hash} (block ${receipt.blockNumber})`);
        results.push({ ticker: d.ticker, action: "BUY", mode: "live", calldata, to, txHash: hash, args });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[executor] buy(${d.ticker}) FAILED: ${msg}`);
        results.push({ ticker: d.ticker, action: "BUY", mode: "live", calldata, to, args, skipped: msg });
      }
    } else {
      // SELL
      const pos = positions.get(d.ticker);
      if (!pos || pos.amount === 0n) {
        console.warn(`[executor] ${d.ticker}: SELL signal but no position; skipping.`);
        continue;
      }
      const tokenAmount = (pos.amount * BigInt(SELL_FRACTION_BPS)) / 10000n;
      if (tokenAmount === 0n) {
        console.warn(`[executor] ${d.ticker}: sell size rounds to 0; skipping.`);
        continue;
      }
      const minPrice = sellMinPrice(price);
      const calldata = buildSellCalldata(PORTFOLIO_ID, d.ticker, tokenAmount, minPrice, rationale);
      const args = {
        portfolioId: String(PORTFOLIO_ID),
        ticker: d.ticker,
        tokenAmount: tokenAmount.toString(),
        minPrice: minPrice.toString(),
        rationale,
      };
      if (!live) {
        console.log(
          `[executor] DRY-RUN sell(${PORTFOLIO_ID}, ${d.ticker}, ${tokenAmount} tokens, minPrice=${minPrice}) -> ${marketAddress || "<PAPER_MARKET_ADDRESS unset>"} calldata=${calldata}`,
        );
        results.push({ ticker: d.ticker, action: "SELL", mode: "dry-run", calldata, to, args });
        continue;
      }
      try {
        const hash = await walletClient!.writeContract({
          address: marketAddress as `0x${string}`,
          abi: PAPER_MARKET_ABI,
          functionName: "sell",
          args: [BigInt(PORTFOLIO_ID), d.ticker, tokenAmount, minPrice, rationale],
        });
        const receipt = await publicClient!.waitForTransactionReceipt({ hash });
        console.log(`[executor] sell(${d.ticker}) confirmed in ${hash} (block ${receipt.blockNumber})`);
        results.push({ ticker: d.ticker, action: "SELL", mode: "live", calldata, to, txHash: hash, args });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[executor] sell(${d.ticker}) FAILED: ${msg}`);
        results.push({ ticker: d.ticker, action: "SELL", mode: "live", calldata, to, args, skipped: msg });
      }
    }
  }
  return results;
}
