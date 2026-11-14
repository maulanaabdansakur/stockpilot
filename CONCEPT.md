# StockPilot — Base Stocks Maxxing entry (Agentic Stock Finance track)

**Status:** CONCEPT — awaiting user approval before build.
**Date:** 2026-11-14. **Builder:** Maulana Abdan Sakur (solo, Bandung, Indonesia).
**Deadline:** submit by 5 Dec 2026 (Quest period 5 Nov–5 Dec 2026 UTC; build window 13 Nov–5 Dec).
**Submission (reserved for user):** public X post with recorded video demo tagging @buildonbase + official Google form. No posting/submitting by the agent.

---

## 1. The concept (one paragraph)

**StockPilot is an autonomous AI agent that paper-trades tokenized stocks on Base — with real prices, real reasoning, and real onchain settlement.**

The agent reads real Coinbase tokenized-stock prices from Chainlink feeds on Base Mainnet (NVDA, AAPL, TSLA, META, MSFT, GOOGL…), reasons about them with a free LLM, and executes paper trades that settle fully onchain on Base Sepolia: it mints/burns synthetic TEST B20 ASSET tokens — created through Base's own B20 factory precompile, clearly labeled `TEST-`, never mimicking real tickers — against test USDC in a vault contract. Every decision carries a written rationale, every trade is a real Sepolia transaction, and anyone can open a paper portfolio and let the agent trade it. A public dashboard shows live prices, positions, P&L, and the agent's reasoning log.

## 2. Why this fits the track

| Quest angle | How StockPilot answers it |
|---|---|
| **Agentic** | The agent acts on its own schedule: watches prices, reasons, trades, updates the oracle. No button-pushing demo. |
| **Stock Finance** | Built on the quest's own theme: Coinbase B20 tokenized stocks + Chainlink equity feeds — the exact stack Base documents for this. |
| **Real onchain usage** | Every trade = a Sepolia tx. Every user portfolio = more txs. Builder Codes can attribute the activity to the app. |
| **Testnet-native** | Zero capital, no mainnet, no KYC, no paid services — fully inside the rules (testnet "will not be judged less favorably"). |
| **Honest** | Synthetic instruments labeled TEST-; prices real from mainnet feeds; no claim of real shares anywhere. |

## 3. The hard truth the design is built around

Verified 2026-11-14 from official sources (see `RESEARCH.md`):

- **No real tokenized-stock asset exists on any testnet.** Coinbase issues B20 tokenized stocks on Base Mainnet only. Dinari dShares are on Base Mainnet but KYC-gated with whitelisted transfers. xStocks and Ondo are not on Base at all. There is no Chainlink Coinbase equity feed on Base Sepolia.
- **But Base Sepolia has the real B20 factory precompile** (live since 18 Jun 2026), so the product can create synthetic TEST B20 ASSET tokens through the exact same factory Coinbase uses — the honest testnet-native path.
- **Real prices are free and public:** Chainlink Coinbase equity feeds on Base Mainnet (read-only, no key, 8 decimals, 24/5) + the public Tokenized Stocks API (no key) for token list, multipliers, and NAV.
- **Differentiation vs the nearest existing project:** QuantL sells signal readings on Base Sepolia via x402. StockPilot is different — an agent that actually trades (paper) onchain with settlement and portfolio management, not a signal shop.

## 4. Architecture

### Onchain — Base Sepolia (chain 84532), Solidity, Foundry

1. **`StockPilotVault`** — holds test USDC; tracks portfolios (user deposits/withdraws test USDC; share accounting per portfolio).
2. **`PaperMarket`** — executes paper buys/sells at oracle price: mints/burns synthetic TEST B20 ASSET tokens (fallback: plain ERC-20 paper shares — see risk R1); records every trade, position, and P&L onchain; enforces a deviation band against the oracle so the agent cannot trade at a stale or wrong price.
3. **`TestOracle`** — TEST_ONLY price oracle on Sepolia, mirroring the mainnet Chainlink feed values, pushed by the agent's offchain relayer with staleness bounds. Explicitly labeled test-only; it exists because no real equity feed lives on Sepolia.

### Offchain agent — Node.js / TypeScript (viem), runs on Vultr

- **Price watcher:** reads Chainlink Coinbase feeds on Base Mainnet via public RPC (free, no key).
- **Strategist:** rule-based signals (momentum / mean-reversion + volatility filter) + free LLM (Pollinations — already proven in TokoAI) writing a 1–2 sentence rationale per trade.
- **Executor:** submits buy/sell txs to `PaperMarket` on Base Sepolia on a schedule (every 30 min during US market hours, hourly off-hours; weekends hold — feeds hold last close).
- **Relayer:** pushes prices to `TestOracle` on the same schedule.
- Runs as a light Node process on the existing Vultr box (hosts Revenant Reader; plenty of headroom for a small agent).

### Frontend — Next.js, public URL

- Live prices (from mainnet feeds), agent portfolio, positions, P&L, trade history (indexed from Sepolia events), rationale feed.
- "Open a paper portfolio": connect wallet, deposit test USDC (Circle faucet), the agent trades it.
- Deploy: Vercel free tier (or Vultr alongside Revenant Reader — decide at build).

### Tickers (start small)

NVDA, AAPL, TSLA, META, MSFT, GOOGL (+ SPCX S&P 500 ETF as the index option). All have mainnet Chainlink feeds. Start with 4–6, expand only if time allows.

## 5. Milestone plan (solo, ~2 weeks build + buffer)

| When | What | Done when |
|---|---|---|
| **Days 1–2 (15–16 Nov)** | Setup + go/no-go probes | Repo created; RPC probe confirms `ActivationRegistry.isActivated` for the ASSET variant on Sepolia; Circle faucet test USDC claimed; CDP/Superchain faucet ETH claimed. **Decision R1:** B20 synthetic vs ERC-20 paper shares. |
| **Days 3–5** | Contracts | Vault + PaperMarket + TestOracle written, deployed to Sepolia; agent executor skeleton reads mainnet feeds and submits a first onchain paper trade. |
| **Days 6–8** | Agent strategist | Rules + LLM rationale live; relayer pushing prices; scheduled runs executing; onchain trade history verified on Basescan Sepolia. |
| **Days 9–11** | Frontend + portfolios | Dashboard live at a public URL; paper-portfolio onboarding works end-to-end (connect → deposit test USDC → agent trades). |
| **Days 12–13** | Polish + demo | Demo video script + recording; submission-form draft; a few build-in-public X posts (helps the "building in public" signal, if that weight is real). |
| **Dec 1–4** | Buffer + submit | Buffer for slips; user posts the X video + submits the form (reserved for user with final go-ahead). |

Kiroween (Revenant Reader) closes the same weekend (5 Dec 05:00 WIB) but is already submitted — remaining Kiroween work is the credits form (user's act) and optional edits, not a second build. The collision is attention, not scope; if it bites, cut scope per §6 rather than slip.

## 6. Scope cuts if the deadline threatens (in order)

1. Multi-user paper portfolios → **single agent portfolio only** (dashboard still shows it; "open portfolio" becomes post-MVP).
2. LLM rationale → **rule-based rationale text only** (still a written reason per trade).
3. Onchain `TestOracle` check → **agent-submitted price with onchain staleness check** against the last pushed value only.
4. 10 tickers → **4 tickers** (NVDA, AAPL, TSLA, META).

## 7. What we will NOT build

Real-money features; mainnet; leverage/derivatives; a DEX/AMM (no liquidity needed — paper market trades at oracle price); KYC; any claim of real shares; any ticker mimicry (synthetic tokens are `TEST-` prefixed, e.g. `TEST-NVDA`).

## 8. Risks (honest)

- **R1 — B20 ASSET activation on Sepolia.** The factory is live on Sepolia since Jun 2026 and the variant is documented, but whether the ASSET variant is activated must be probed at build start (`ActivationRegistry`). Fallback is ready: plain ERC-20 paper shares. Cost of fallback: loses the "native B20" story, keeps everything else.
- **R2 — Stale prices.** Chainlink equity feeds are 24/5 and hold last close on weekends/holidays; corporate-action pauses freeze the feed. Mitigation: `updatedAt` staleness checks everywhere; agent holds (no trades) when the feed is stale.
- **R3 — Traction weight unconfirmed.** The ~50% onchain-traction figure is secondary-source only. Design answers it anyway: public demo, anyone can paper-trade, agent transacts on a schedule.
- **R4 — Free LLM reliability.** Pollinations is already proven in TokoAI; rationale is non-critical path (rules decide, LLM explains — a failed LLM call never blocks a trade).
- **R5 — Tooling.** Standard Foundry cannot simulate B20 precompiles; Base's Foundry build (`base-forge`/`base-cast`) is needed for local B20 tests. Mitigation: test B20 behavior directly on Sepolia (cheap, fast) instead of locally.
- **R6 — Faucet friction.** Base Sepolia ETH via Coinbase CDP faucet needs a Coinbase Developer account (user's act if needed); alternatives need no new account: Superchain console (GitHub link — Abdan has GitHub), Chainlink faucet (wallet connect only). Circle faucet for test USDC.

## 9. Open verifications (Day 1 of build)

1. `ActivationRegistry.isActivated` for `base.b20_asset` on Base Sepolia via RPC.
2. Circle faucet test USDC claim works.
3. Base Sepolia ETH faucet claim works (CDP / Superchain / Chainlink).
4. Tokenized Stocks API reachable (public, no key).
5. Pollinations LLM reachable (proven in TokoAI — re-confirm).

## 10. Sources

Full verified source list with addresses and feed list: `RESEARCH.md` in this directory.
Key officials: `docs.base.org/specifications/b20/tokenized-stocks-on-base`,
`base.org/stocksmaxxing`, `base.org/stocksmaxxing/rules`,
`docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase`,
`docs.chain.link/data-feeds/tokenized-equity-feeds/ondo`.
