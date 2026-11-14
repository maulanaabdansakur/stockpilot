# StockPilot frontend — dashboard (Days 9–11)

Next.js + TypeScript + Tailwind (App Router). Public dashboard for the
Base Stocks Maxxing entry (Agentic Stock Finance track).

**TESTNET ONLY — Base Sepolia.** Paper trading, synthetic `TEST-` tokens,
no real shares, no real money.

## What it shows

- **Live prices** — the 6 tickers (NVDA, AAPL, TSLA, META, MSFT, GOOGL) read
  from the Chainlink Coinbase equity feeds on **Base Mainnet** via public RPC
  (no API key). Feeds are 24/5: on weekends / off-hours they hold the last
  close — the UI labels that "market closed / weekend hold", not an error.
  A feed older than 3 days is treated as stale.
- **Agent portfolio** — positions + P&L (marked vs the live feeds) + trade
  history + rationale log. Positions come from onchain PaperMarket reads
  (`getTrade`/`getPosition`, with a `TradeExecuted` event-log fallback)
  once deployed; until then they come from `agent/state.json`.
- **Open a paper portfolio** — connect wallet (injected provider, plain viem),
  switch to Base Sepolia, `createPortfolio()` + approve + `deposit()` test
  USDC into StockPilotVault. When the contracts are not deployed yet the
  panel shows a clear locked state instead of broken buttons.

## Data sources

| Panel | Source |
|---|---|
| Prices | `GET /api/prices` → viem `latestRoundData()` on Base Mainnet (public RPC, fallback list) |
| Agent state | `GET /api/agent` → `agent/state.json` (see below) |
| Onchain trades | `GET /api/trades` → PaperMarket `tradeCount`/`getTrade`/`getPosition` on Base Sepolia |

### Agent state file

`GET /api/agent` looks for the state file in this order:

1. `$AGENT_STATE_PATH` (set this when the agent runs on the same host — the
   dashboard then reads the live file).
2. `../agent/state.json` (local dev checkout).
3. `public/agent-state.json` — a snapshot copied at build time by
   `npm run prebuild` (`cp data/agent-state.json public/agent-state.json`)
   and refreshed on every redeploy. `data/agent-state.json` is the snapshot
   committed in this repo; refresh it with
   `cp ../agent/state.json data/agent-state.json` before deploying.

## Env vars

Copy `.env.example` to `.env.local`. All contract addresses are optional
until deployment — empty means "not deployed yet" UI state.

| Var | Meaning |
|---|---|
| `NEXT_PUBLIC_VAULT_ADDRESS` | StockPilotVault on Base Sepolia |
| `NEXT_PUBLIC_PAPER_MARKET_ADDRESS` | PaperMarket on Base Sepolia |
| `NEXT_PUBLIC_TEST_ORACLE_ADDRESS` | TestOracle on Base Sepolia |
| `PAPER_MARKET_ADDRESS` / `STOCKPILOT_VAULT_ADDRESS` | server-side mirrors for `/api/trades` |
| `AGENT_STATE_PATH` | live agent state file (optional) |
| `AGENT_PORTFOLIO_ID` | agent portfolio id (default 1) |
| `PAPER_MARKET_DEPLOY_BLOCK` | first block for the event-log fallback (optional) |

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # must pass; output: standalone
npm start
```

## Deploy (Vultr)

The box already runs Revenant Reader (`:3000`) and VeriBrief (`:80`).
StockPilot runs on **port 3001** — it must not touch those containers.
The box has no Node installed and very little free disk (~900 MB), so we
do NOT build on the box: build locally (`npm run build`, `output:
"standalone"`), then sync `.next/standalone` + `public` + `.next/static`
and run it with the already-present `node:24-alpine` image:

```bash
./deploy-vultr.sh   # builds, rsyncs, (re)starts stockpilot container on :3001
```

Public URL: **http://167.179.88.69:3001**
