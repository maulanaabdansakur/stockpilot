# StockPilot — submission-form draft (Base Stocks Maxxing)

**Status:** DRAFT — do not submit. Fields marked **TODO** need a deployed
contract address, the repo to exist, or the user's X post.
**Quest:** Base Stocks Maxxing Builder Quest 2026, Agentic Stock Finance track.
**Quest period:** 5 Nov–5 Dec 2026 (build window 13 Nov–5 Dec 2026).
**Submit by:** 5 Dec 2026. Submission = public X post with recorded video demo
tagging @buildonbase + this official Google form. Posting/submitting is the
user's act — never the agent's.

---

## 1. Project name

StockPilot

## 2. One-line description

Autonomous AI agent that paper-trades tokenized stocks on Base — real Chainlink
prices, written reasoning, and paper trades that settle fully onchain on Base
Sepolia via synthetic TEST- B20 tokens.

## 3. Track

Agentic Stock Finance

## 4. What was built during the Quest Period (13 Nov–5 Dec 2026)

- **Smart contracts (Base Sepolia, Solidity + Foundry)** — `StockPilotVault`
  (test-USDC custody + per-portfolio share accounting), `PaperMarket`
  (paper buys/sells at oracle price; mints/burns synthetic `TEST-` B20 ASSET
  tokens through Base's own B20 factory precompile; onchain trade/position/
  P&L records; ±1% deviation band vs the oracle), and `TestOracle`
  (test-only price mirror of the mainnet Chainlink feeds, with staleness
  bounds). Tested: `forge test` 47 pass; `base-forge test` 49/49 pass
  including real-precompile B20 mint/burn. **TODO: deployed addresses —
  contracts are written and tested but NOT yet deployed (deployer wallet
  0 ETH; funding in progress). Fill in after deployment:**
  - TestOracle: `[TODO: Base Sepolia address]`
  - StockPilotVault: `[TODO: Base Sepolia address]`
  - PaperMarket: `[TODO: Base Sepolia address]`
  - First live trade tx (Basescan Sepolia): `[TODO: tx hash + link]`
- **Offchain agent (Node.js/TypeScript, viem)** — watches the 6 Chainlink
  Coinbase equity feeds on Base Mainnet (NVDA, AAPL, TSLA, META, MSFT,
  GOOGL); rule-based strategist (momentum / mean-reversion + volatility
  filter, take-profit +5% / stop-loss −3%) with a free LLM (Pollinations)
  writing a 1–2 sentence rationale per trade (rules decide, LLM explains —
  a failed LLM call never blocks a trade); relayer mirroring prices into
  `TestOracle`; executor submitting buys/sells to `PaperMarket`; scheduler
  (30 min in US market hours, 60 min off-hours; holds when feeds are stale).
  Verified in dry-run against real feed values (NVDA $160.76, AAPL $355.58
  Friday closes); `npm test` 26/26 pass.
- **Dashboard (Next.js, public)** — live prices from the mainnet Chainlink
  feeds, agent portfolio with positions + P&L + trade history + rationale
  log, and paper-portfolio onboarding (connect wallet → Base Sepolia →
  deposit test USDC → agent trades it). **Live at
  http://167.179.88.69:3001** (Vultr Docker, port 3001).
- **Verification work** — B20 ASSET activation probed onchain before building
  (`ActivationRegistry.isActivated("base.b20_asset")` = true on Base Sepolia,
  2026-11-15); Chainlink feeds cross-validated against the Coinbase
  Tokenized Stocks API to the cent and the second.

## 5. Repository URL

https://github.com/maulanaabdansakur/stockpilot

**TODO: repo does not exist yet — create it, push the local commits, and
verify this URL resolves before submitting.** Local commits ready to push:
`c2c352a` (contracts), `251b8d1` (agent), `d71fa0b` + `7cc7a43` (frontend),
plus this polish commit.

## 6. Live demo URL

http://167.179.88.69:3001

(Dashboard is live now. Paper-portfolio onboarding is locked until the
contracts deploy — the panel shows a clear locked state, not broken buttons.)

## 7. X post link (video demo)

**TODO: the X post is the user's act.** Post the recorded demo video
(script: `DEMO-VIDEO-SCRIPT.md`) from @abdan191, tag @buildonbase, then
paste the post URL here:

- X post: `[TODO: https://x.com/abdan191/status/...]`

## 8. Team

Solo — **Maulana Abdan Sakur**, Bandung, Indonesia.
X: @abdan191 · GitHub: maulanaabdansakur.

## 9. How it works (short paragraph)

StockPilot is an autonomous agent that paper-trades tokenized stocks on Base.
It reads real Coinbase tokenized-stock prices from Chainlink feeds on Base
Mainnet, reasons about them with a rule-based strategist plus a free LLM that
writes a short rationale for every decision, and executes paper trades that
settle fully onchain on Base Sepolia: the market contract mints or burns
synthetic `TEST-` B20 ASSET tokens — created through Base's own B20 factory,
clearly labeled and never mimicking real tickers — against test USDC held in
the vault. A public dashboard shows live prices, positions, P&L, trade
history, and the reasoning log, and anyone can open a paper portfolio with
test USDC and let the agent trade it. Everything is testnet-only: zero
capital, no mainnet, no KYC, no paid services, no claim of real shares.

## 10. Pre-submit checklist

- [ ] GitHub repo created at github.com/maulanaabdansakur/stockpilot; code pushed; URL verified
- [ ] Contracts deployed; addresses + first live trade tx filled in §4
- [ ] Agent running live (not dry-run) with at least one confirmed onchain trade
- [ ] Dashboard redeployed with contract addresses; onboarding unlocked and tested end-to-end
- [ ] Demo video recorded per `DEMO-VIDEO-SCRIPT.md` (Scenes 3–4 need live footage)
- [ ] X video post published by the user, tagging @buildonbase; link pasted in §7
- [ ] This form submitted by the user before 5 Dec 2026
