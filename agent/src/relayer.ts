/**
 * Relayer — mirrors Base Mainnet Chainlink feed values into the
 * TestOracle contract on Base Sepolia (`pushPrice(ticker, price, updatedAt)`).
 *
 * Why a mirror exists: there is no Chainlink Coinbase equity feed on
 * Base Sepolia (see ../RESEARCH.md §2). TestOracle is TEST_ONLY.
 *
 * Dry-run mode (no TEST_ORACLE_ADDRESS, or --dry-run): no transaction is
 * sent; the exact calldata that WOULD be sent is logged and returned.
 * Live mode: the agent wallet (../agent-wallet.json, testnet only) signs
 * and the receipt is awaited. A `StalePush` revert (price not newer than
 * the stored one — e.g. a weekend re-push of Friday's close) is logged
 * and skipped, not fatal.
 */
import { createPublicClient, createWalletClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_RPC_URL, loadAgentWallet } from "./config.js";
import type { FeedReading } from "./watcher.js";

export const TEST_ORACLE_ABI = [
  {
    name: "pushPrice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ticker", type: "string" },
      { name: "price", type: "int256" },
      { name: "updatedAt", type: "uint256" },
    ],
    outputs: [],
  },
  // Error entries so viem decodes reverts by name (StalePush = 0x011d3081).
  { name: "StalePush", type: "error", inputs: [] },
  { name: "NotRelayer", type: "error", inputs: [] },
  { name: "InvalidPrice", type: "error", inputs: [] },
  { name: "InvalidTimestamp", type: "error", inputs: [] },
] as const;

export interface PushResult {
  ticker: string;
  price: bigint;
  updatedAt: number;
  mode: "dry-run" | "live";
  /** Exact calldata that was (or would be) sent. */
  calldata: `0x${string}`;
  to: `0x${string}`;
  txHash?: `0x${string}`;
  skipped?: string;
}

export function buildPushCalldata(ticker: string, price: bigint, updatedAt: number): `0x${string}` {
  return encodeFunctionData({
    abi: TEST_ORACLE_ABI,
    functionName: "pushPrice",
    args: [ticker, price, BigInt(updatedAt)],
  });
}

export async function pushPrices(
  readings: FeedReading[],
  oracleAddress: `0x${string}` | "",
  dryRun: boolean,
): Promise<PushResult[]> {
  const results: PushResult[] = [];
  if (dryRun || !oracleAddress) {
    for (const r of readings) {
      const calldata = buildPushCalldata(r.ticker, r.price, r.updatedAt);
      results.push({
        ticker: r.ticker,
        price: r.price,
        updatedAt: r.updatedAt,
        mode: "dry-run",
        calldata,
        to: (oracleAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      });
      console.log(
        `[relayer] DRY-RUN pushPrice(${r.ticker}, ${r.price}, ${r.updatedAt}) ` +
          `-> ${oracleAddress || "<TEST_ORACLE_ADDRESS unset>"} calldata=${calldata}`,
      );
    }
    return results;
  }

  const { privateKey } = loadAgentWallet();
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) });

  for (const r of readings) {
    const calldata = buildPushCalldata(r.ticker, r.price, r.updatedAt);
    try {
      const hash = await walletClient.writeContract({
        address: oracleAddress,
        abi: TEST_ORACLE_ABI,
        functionName: "pushPrice",
        args: [r.ticker, r.price, BigInt(r.updatedAt)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[relayer] pushPrice(${r.ticker}) confirmed in ${hash} (block ${receipt.blockNumber})`);
      results.push({ ticker: r.ticker, price: r.price, updatedAt: r.updatedAt, mode: "live", calldata, to: oracleAddress, txHash: hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Weekend re-push of an unchanged close reverts StalePush — expected, not fatal.
      // Match by name (decoded, now that the ABI lists the errors) or by selector.
      if (/StalePush|0x011d3081/.test(msg)) {
        console.log(`[relayer] pushPrice(${r.ticker}) skipped: price not newer than stored (StalePush).`);
        results.push({ ticker: r.ticker, price: r.price, updatedAt: r.updatedAt, mode: "live", calldata, to: oracleAddress, skipped: "StalePush" });
      } else {
        console.error(`[relayer] pushPrice(${r.ticker}) FAILED: ${msg}`);
        results.push({ ticker: r.ticker, price: r.price, updatedAt: r.updatedAt, mode: "live", calldata, to: oracleAddress, skipped: msg });
      }
    }
  }
  return results;
}
