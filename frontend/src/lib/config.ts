/**
 * StockPilot dashboard — shared config.
 * Sources: ../RESEARCH.md, ../PROBES.md, ../agent/src/config.ts.
 * Prices come from the Chainlink Coinbase equity feeds on Base Mainnet
 * (read-only, no API key, 8 decimals, 24/5). Contracts live on Base
 * Sepolia and are NOT deployed yet — addresses come from env and the UI
 * must show a "not deployed yet" state while they are empty.
 */

export const BASE_MAINNET_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.publicnode.com",
];
export const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

export const CHAIN_ID_SEPOLIA = 84532;
export const SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/** Contract addresses — empty until deployment (see contracts/DEPLOY.md). */
export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "") as string;
export const PAPER_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_PAPER_MARKET_ADDRESS ?? "") as string;
export const TEST_ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_TEST_ORACLE_ADDRESS ?? "") as string;
/** Server-side mirror (API routes read the non-public vars too). */
export const PAPER_MARKET_ADDRESS_SERVER =
  (process.env.PAPER_MARKET_ADDRESS ?? PAPER_MARKET_ADDRESS) as string;
export const VAULT_ADDRESS_SERVER =
  (process.env.STOCKPILOT_VAULT_ADDRESS ?? VAULT_ADDRESS) as string;

export const CONTRACTS_DEPLOYED = Boolean(VAULT_ADDRESS && PAPER_MARKET_ADDRESS);

export interface TickerConfig {
  ticker: string;
  feed: `0x${string}`;
  /** Real Coinbase B20 token on Base Mainnet (reference only — never traded here). */
  realToken: string;
}

export const TICKERS: TickerConfig[] = [
  { ticker: "NVDA", feed: "0x04689a41629776563E6822F76f2e57D148d28513", realToken: "NVDAc" },
  { ticker: "AAPL", feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988", realToken: "AAPLc" },
  { ticker: "TSLA", feed: "0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4", realToken: "TSLAc" },
  { ticker: "META", feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D", realToken: "METAc" },
  { ticker: "MSFT", feed: "0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c", realToken: "MSFTc" },
  { ticker: "GOOGL", feed: "0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2", realToken: "GOOGLc" },
];

/** US market hours in UTC (regular session 13:30–20:00 UTC, Mon–Fri). */
export function isMarketOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins < 20 * 60;
}

export const MAX_STALE_AGE_SEC = 3 * 24 * 3600; // 3 days, matches TestOracle default

export const BASESCAN_SEPOLIA = "https://sepolia.basescan.org";
export const BASESCAN_MAINNET = "https://basescan.org";

export function sepoliaAddressUrl(addr: string): string {
  return `${BASESCAN_SEPOLIA}/address/${addr}`;
}
export function sepoliaTxUrl(hash: string): string {
  return `${BASESCAN_SEPOLIA}/tx/${hash}`;
}
export function mainnetAddressUrl(addr: string): string {
  return `${BASESCAN_MAINNET}/address/${addr}`;
}

/** Price of one TEST-<ticker> synthetic token = the real feed price (8-dec). */
export function formatUsd(price8: bigint | number | string): string {
  const v = typeof price8 === "bigint" ? Number(price8) / 1e8 : Number(price8) / 1e8;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatUsdRaw(v: number): string {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatTs(unixSec: number): string {
  return new Date(unixSec * 1000).toUTCString();
}
