# StockPilot

**Autonomous AI agent that paper-trades tokenized stocks on Base — with real prices, real reasoning, and real onchain settlement.**

Entry for the **Base Stocks Maxxing Builder Quest 2026** (Agentic Stock Finance track).
Builder: Maulana Abdan Sakur (solo, Bandung, Indonesia).
Deadline: submit by **5 Dec 2026**.

> **Testnet only. Zero capital, no mainnet, no KYC, no paid services.**
> The agent reads real Coinbase tokenized-stock prices from Chainlink feeds on
> Base Mainnet (NVDA, AAPL, TSLA, META, MSFT, GOOGL…), reasons about them with
> a free LLM, and executes paper trades that settle fully onchain on
> **Base Sepolia**: it mints/burns synthetic `TEST-` B20 ASSET tokens — created
> through Base's own B20 factory precompile, clearly labeled, never mimicking
> real tickers — against test USDC in a vault contract. Every decision carries
> a written rationale; every trade is a real Sepolia transaction.

## Layout

| Path | What |
|---|---|
| `CONCEPT.md` | Full concept, architecture, milestone plan, scope cuts, risks |
| `RESEARCH.md` | Verified research: quest rules, B20, Chainlink feeds, faucets |
| `contracts/` | Foundry project (Solidity) — `StockPilotVault`, `PaperMarket`, `TestOracle` |
| `agent/` | Node.js/TypeScript agent (viem) — price watcher, strategist, executor, relayer |
| `agent-wallet.json` | **Gitignored.** Fresh throwaway test wallet for the agent/deployer (Base Sepolia only, chmod 600) |

## Build plan (see CONCEPT.md §5)

1. **Days 1–2 (15–16 Nov)** — Setup + go/no-go probes: repo, `ActivationRegistry.isActivated` for the B20 ASSET variant on Sepolia, Circle faucet test USDC, Sepolia ETH faucet. Decision R1: B20 synthetic vs ERC-20 paper shares.
2. **Days 3–5** — Contracts: Vault + PaperMarket + TestOracle deployed to Sepolia; first onchain paper trade.
3. **Days 6–8** — Agent strategist: rules + LLM rationale live; relayer pushing prices; scheduled runs.
4. **Days 9–11** — Frontend + paper portfolios: public dashboard.
5. **Days 12–13** — Polish + demo video.
6. **Dec 1–4** — Buffer + submit (X video post + official form — user posts/submits).

## What we will NOT build

Real-money features; mainnet; leverage/derivatives; a DEX/AMM; KYC; any claim
of real shares; any ticker mimicry (synthetics are `TEST-` prefixed).

## Status

- **Contracts (Days 3–5):** written, tested (`forge test` 47 pass; `base-forge` 49 pass incl. real B20 sim), committed locally. **Not deployed** — deployer wallet `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3` has 0 ETH; funding in progress (see `contracts/DEPLOY.md`, `FAUCETS.md`).
- **Agent (Days 6–8):** complete. Watcher reads real mainnet feeds (verified: NVDA $160.76, AAPL $355.58 Friday closes); strategist rules + Pollinations rationale; relayer + executor with dry-run calldata logging; scheduler (30 min market hours / 60 min off-hours); `npm test` 26/26 pass. Runs in **dry-run** until contract addresses are set in `agent/.env` — see `agent/README.md`.
- **Frontend (Days 9–11):** not started. Dashboard reads `agent/state.json` + Sepolia events.
