/**
 * StockPilot agent — shared config.
 *
 * Sources (see ../RESEARCH.md, ../PROBES.md):
 *  - Chainlink Coinbase equity feed addresses on Base Mainnet (8 decimals,
 *    24/5, latestRoundData). Verified live 2026-11-14 (NVDA $160.77,
 *    AAPL $355.58 — Friday closes, weekend hold).
 *  - Base Sepolia contracts: addresses come from env after deployment
 *    (see ../contracts/DEPLOY.md). Unset = dry-run mode.
 *  - Agent wallet: ../agent-wallet.json (testnet only, gitignored, chmod 600).
 *    The private key is read only when a live (non-dry-run) transaction is
 *    about to be sent, and is NEVER printed or logged.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const BASE_MAINNET_RPC_URL =
  process.env.BASE_MAINNET_RPC_URL ?? "https://mainnet.base.org";
export const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

export const TEST_ORACLE_ADDRESS = (process.env.TEST_ORACLE_ADDRESS ?? "") as `0x${string}` | "";
export const PAPER_MARKET_ADDRESS = (process.env.PAPER_MARKET_ADDRESS ?? "") as `0x${string}` | "";
export const VAULT_ADDRESS = (process.env.STOCKPILOT_VAULT_ADDRESS ?? "") as `0x${string}` | "";

export const POLLINATIONS_API_URL =
  process.env.POLLINATIONS_API_URL ?? "https://text.pollinations.ai/";

/** Agent portfolio traded on PaperMarket (created at deploy time). */
export const PORTFOLIO_ID = Number(process.env.PORTFOLIO_ID ?? "1");
/** Test USDC spent per BUY (6 decimals): default 100 USDC. */
export const TRADE_USDC_AMOUNT = BigInt(process.env.TRADE_USDC_AMOUNT ?? "100000000");
/** SELL sells this fraction of the open position (basis points). Default: all. */
export const SELL_FRACTION_BPS = Number(process.env.SELL_FRACTION_BPS ?? "10000");

/** Chainlink feed decimals. */
export const FEED_DECIMALS = 8;
/** Max age of a feed value before the agent treats it as stale for trading.
 *  Matches TestOracle.DEFAULT_MAX_STALE_AGE (3 days) so a normal weekend
 *  hold (Fri close -> Mon open, ~60h) is NOT stale, but anything older is. */
export const MAX_STALE_AGE_SEC = 3 * 24 * 3600;

export interface TickerConfig {
  ticker: string;
  feed: `0x${string}`;
}

export const TICKERS: TickerConfig[] = [
  { ticker: "NVDA", feed: "0x04689a41629776563E6822F76f2e57D148d28513" },
  { ticker: "AAPL", feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988" },
  { ticker: "TSLA", feed: "0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4" },
  { ticker: "META", feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D" },
  { ticker: "MSFT", feed: "0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c" },
  { ticker: "GOOGL", feed: "0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2" },
];

export function tickerList(): string[] {
  return TICKERS.map((t) => t.ticker);
}

/** US market hours in UTC (regular session 13:30–20:00 UTC, Mon–Fri).
 *  Feeds are 24/5 and hold last close outside these hours; the agent only
 *  trades while the market is open. */
export function isMarketOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins < 20 * 60;
}

/**
 * Load the agent wallet (testnet only). Returns the private key as a hex
 * string and the checksummed address. Throws if the file is missing or
 * malformed. Callers must NEVER log the returned private key.
 */
export function loadAgentWallet(): { privateKey: `0x${string}`; address: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ -> agent/ -> ../agent-wallet.json at the work-dir root.
  const walletPath = join(here, "..", "..", "agent-wallet.json");
  const raw = JSON.parse(readFileSync(walletPath, "utf-8")) as {
    private_key?: string;
    address?: string;
  };
  if (!raw.private_key || !raw.address) {
    throw new Error(`agent-wallet.json at ${walletPath} lacks private_key/address`);
  }
  const pk = raw.private_key.startsWith("0x") ? raw.private_key : `0x${raw.private_key}`;
  return { privateKey: pk as `0x${string}`, address: raw.address };
}
