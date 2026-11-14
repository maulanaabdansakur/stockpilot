# StockPilot agent

Offchain agent for StockPilot (Base Stocks Maxxing, Agentic Stock Finance track).
Watches real Chainlink Coinbase equity feeds on Base Mainnet, reasons with
rule-based signals (+ a free LLM writing the rationale), mirrors prices into
`TestOracle` on Base Sepolia, and executes paper trades on `PaperMarket`.

**Testnet only. Zero capital, no mainnet, no KYC, no paid services.**

## Components

| File | What |
|---|---|
| `src/watcher.ts` | Reads the 6 Chainlink Coinbase feeds on Base Mainnet via public RPC (multicall, one retry). Enforces `updatedAt` staleness checks — a feed older than 3 days is stale and the agent holds. Feeds hold last close on weekends (24/5). |
| `src/strategist.ts` | Pure, deterministic rules: warm-up → volatility filter (per-observation move std-dev > 2% → hold) → take-profit +5% / stop-loss −3% → mean reversion (±4% vs 20-obs MA, overrides momentum) → momentum (±1% vs 8-obs MA) → position gating (buy only when flat, sell only when holding). **Rules decide, LLM explains.** |
| `src/llm.ts` | Free Pollinations text API (`https://text.pollinations.ai/`, no key) writes a 1–2 sentence rationale per BUY/SELL. Any failure returns `null` and the rule-based rationale is used — a failed LLM call **never blocks a trade**. (Long prompts take ~12–17 s; timeout 45 s.) |
| `src/relayer.ts` | `TestOracle.pushPrice(ticker, price, updatedAt)` on Base Sepolia. A `StalePush` revert (re-pushing an unchanged weekend close) is logged and skipped. |
| `src/executor.ts` | `PaperMarket.buy` / `.sell` on Base Sepolia. Buy cap = oracle price +0.5%, sell floor = oracle price −0.5% — inside the contract's ±1% (`maxDeviationBps` = 100) band, and satisfying the buy `maxPrice >= oracle` / sell `minPrice <= oracle` direction checks. Trades execute at the oracle price. |
| `src/scheduler.ts` | One cycle: watch → strategize → relayer push → execute. Loop sleeps 30 min in US market hours (13:30–20:00 UTC Mon–Fri), 60 min off-hours. Market closed → prices still mirrored, no trades. |
| `src/state.ts` | `state.json` (gitignored runtime state): last prices, price history (48 pts/ticker), positions, decision + rationale log, dry-run/live trade records — the dashboard (Days 9–11) reads this. Positions only change on confirmed live receipts; dry-run trades never mutate them. |

## Setup

```bash
npm install
cp .env.example .env   # fill in contract addresses after deployment
```

`.env` vars (see `.env.example`):

| Var | Meaning |
|---|---|
| `BASE_MAINNET_RPC_URL` | default `https://mainnet.base.org` |
| `BASE_SEPOLIA_RPC_URL` | default `https://sepolia.base.org` |
| `TEST_ORACLE_ADDRESS` | TestOracle on Base Sepolia (unset → dry-run) |
| `PAPER_MARKET_ADDRESS` | PaperMarket on Base Sepolia (unset → dry-run) |
| `STOCKPILOT_VAULT_ADDRESS` | StockPilotVault (recorded; trades go via the market) |
| `POLLINATIONS_API_URL` | default `https://text.pollinations.ai/` |
| `PORTFOLIO_ID` | default `1` |
| `TRADE_USDC_AMOUNT` | test USDC per BUY, 6 decimals (default `100000000` = 100 USDC) |
| `SELL_FRACTION_BPS` | fraction of position sold per SELL (default `10000` = all) |

The signing key lives in `../agent-wallet.json` (testnet only, gitignored,
chmod 600). It is read only when a live transaction is about to be sent, and
is **never printed or logged**.

## Run

```bash
npm run dev -- --once --dry-run   # one cycle, no txs (default until deployed)
npm run dev -- --once             # one live cycle (needs addresses + funded wallet)
npm start -- --dry-run            # loop on schedule, dry-run
npm start                        # loop on schedule, live
npm test                         # unit tests (strategist + staleness/market-hours)
npm run build                    # tsc -> dist/
```

Flags: `--once` (single cycle, exit), `--dry-run` (never send txs; log the
exact calldata instead), `--no-llm` (rule rationale only).

**Dry-run is forced** when `TEST_ORACLE_ADDRESS` / `PAPER_MARKET_ADDRESS`
are unset — the startup log says so explicitly. In dry-run the relayer and
executor log the exact calldata that *would* be sent, e.g.:

```
[relayer] DRY-RUN pushPrice(NVDA, 16076543559, 1794612983) -> <TEST_ORACLE_ADDRESS unset> calldata=0x0d8c4084...
[executor] DRY-RUN buy(1, NVDA, 100000000 usdc, maxPrice=16156926286) -> <PAPER_MARKET_ADDRESS unset> calldata=0x...
```

## Verified behaviour (2026-11-15, Sun — market closed)

- Watcher reads **real** mainnet feed values, matching the Day-1 probes
  exactly: NVDA $160.76, AAPL $355.58, TSLA $387.79, META $638.54,
  MSFT $522.40, GOOGL $294.89 (Friday closes, weekend hold).
- All six decisions HOLD with "market closed — feed holds last close";
  relayer still mirrors the 6 prices (dry-run calldata logged); executor
  places no trades.
- `npm test`: 26/26 pass (strategist decisions on deterministic series,
  staleness boundaries, market-hours boundaries, price formatting).
- LLM probe: Pollinations returned a sensible 1–2 sentence rationale in
  ~17 s; the 45 s timeout + rule-rationale fallback were verified by an
  earlier 20 s-timeout run that fell back cleanly.

## Status

Agent complete (Days 6–8). **Blocked on deployment:** contracts are written
and tested but not deployed (deployer wallet has 0 ETH; funding in progress
via browser). Until `TEST_ORACLE_ADDRESS` / `PAPER_MARKET_ADDRESS` are set,
every run is dry-run by design. After deployment: set the addresses in
`.env`, fund the agent wallet with Sepolia ETH + a funded portfolio, then
`npm start` — the first live cycle will push prices and trade.
