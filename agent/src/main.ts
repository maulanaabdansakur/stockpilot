/**
 * StockPilot agent — entry point.
 *
 * Usage:
 *   npm run dev -- --once --dry-run   # one cycle, no txs (default until deployed)
 *   npm run dev -- --once             # one live cycle (needs contract addresses + funded wallet)
 *   npm start -- --dry-run            # loop on schedule, dry-run
 *   npm start                        # loop on schedule, live
 *
 * Flags:
 *   --once      run a single cycle and exit (for testing / cron-style runs)
 *   --dry-run   never send transactions; log the exact calldata instead
 *   --no-llm    skip Pollinations rationale calls (rule rationale only)
 *
 * Dry-run is FORCED when TEST_ORACLE_ADDRESS / PAPER_MARKET_ADDRESS are
 * unset (contracts not deployed yet) — the log line says so explicitly.
 * Testnet only. The agent wallet key lives in ../agent-wallet.json and is
 * NEVER printed or logged.
 */
import "dotenv/config";
import { PAPER_MARKET_ADDRESS, TEST_ORACLE_ADDRESS, loadAgentWallet } from "./config.js";
import { runCycle, runLoop } from "./scheduler.js";

const args = new Set(process.argv.slice(2));
const once = args.has("--once");
const noLlm = args.has("--no-llm");
const flagDryRun = args.has("--dry-run");

const contractsDeployed = Boolean(TEST_ORACLE_ADDRESS) && Boolean(PAPER_MARKET_ADDRESS);
const dryRun = flagDryRun || !contractsDeployed;

async function main(): Promise<void> {
  console.log("StockPilot agent — Base Stocks Maxxing (testnet only)");
  console.log(`  TestOracle:    ${TEST_ORACLE_ADDRESS || "<unset — dry-run>"}`);
  console.log(`  PaperMarket:   ${PAPER_MARKET_ADDRESS || "<unset — dry-run>"}`);
  if (!contractsDeployed) {
    console.log("  Contracts not deployed yet: DRY-RUN forced (no txs will be sent).");
  } else if (dryRun) {
    console.log("  --dry-run: no txs will be sent.");
  } else {
    const { address } = loadAgentWallet();
    console.log(`  LIVE mode — agent wallet ${address} (testnet only)`);
  }

  const opts = { dryRun, noLlm };
  if (once) {
    await runCycle(opts);
    process.exit(0);
  }
  await runLoop(opts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
