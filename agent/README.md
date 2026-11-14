# StockPilot agent

Offchain agent for StockPilot (Base Stocks Maxxing, Agentic Stock Finance track).
Skeleton only — see `src/main.ts` for the planned components
(price watcher → strategist → executor → relayer).

## Setup

```bash
npm install
cp .env.example .env   # fill in contract addresses after deployment
npm run dev
```

Testnet only. The agent wallet is the throwaway test wallet in
`../agent-wallet.json` (gitignored, chmod 600) — never mainnet, never committed.
