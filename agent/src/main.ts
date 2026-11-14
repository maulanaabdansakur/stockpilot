/**
 * StockPilot agent — skeleton (Day 1–2 setup).
 *
 * Planned components (see ../CONCEPT.md):
 *  - Price watcher: read Chainlink Coinbase equity feeds on Base Mainnet
 *    (read-only, no key) via public RPC.
 *  - Strategist: rule-based signals (momentum / mean-reversion + volatility
 *    filter) + free LLM (Pollinations) writing a 1–2 sentence rationale.
 *  - Executor: submit buy/sell txs to PaperMarket on Base Sepolia.
 *  - Relayer: push prices to TestOracle on the same schedule.
 *
 * Testnet only. The deployer/agent key lives in ../agent-wallet.json
 * (gitignored, chmod 600) — NEVER commit it, NEVER use it on mainnet.
 */

import "dotenv/config";

const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const BASE_MAINNET_RPC_URL =
  process.env.BASE_MAINNET_RPC_URL ?? "https://mainnet.base.org";

async function main(): Promise<void> {
  console.log("StockPilot agent — skeleton. Nothing runs yet.");
  console.log(`Base Sepolia RPC: ${BASE_SEPOLIA_RPC_URL}`);
  console.log(`Base Mainnet RPC: ${BASE_MAINNET_RPC_URL}`);
  console.log("TODO: price watcher -> strategist -> executor -> relayer.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
