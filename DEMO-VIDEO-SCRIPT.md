# StockPilot — demo video script (X submission post)

**Purpose:** the recorded video demo for the X submission post (tagging @buildonbase).
**Target length:** 90 seconds (fits the 60–120 s brief; well under the 3-minute limit).
**Status:** PARTIALLY RECORDABLE NOW — Scenes 1, 2 and 5 can be recorded today.
Scenes 3 and 4 are **PLACEHOLDER — footage to be recorded after deployment +
first live trade**; the exact narration and on-screen captions for them are
written below so recording is a single take once the onchain evidence exists.
**Recording notes:** screen-record at 1080p, no facecam needed, silent
background music optional (add at upload). All prices shown are the live
Chainlink feed values on the day of recording — do not reuse stale figures.
Reference values verified 2026-11-15 (Friday closes, weekend hold):
NVDA $160.77, AAPL $355.58, TSLA $387.79, META $638.54, MSFT $522.40,
GOOGL $294.89.

## Timing budget

| Scene | Length | Recordable now? |
|---|---|---|
| 1 — The problem | 0:00–0:10 (10 s) | Yes |
| 2 — Live dashboard, real prices | 0:10–0:25 (15 s) | Yes |
| 3 — Agent reasoning + paper trade settles onchain | 0:25–0:55 (30 s) | **NO — after deployment + first live trade** |
| 4 — Portfolio onboarding | 0:55–1:20 (25 s) | **NO — after deployment** |
| 5 — Closing | 1:20–1:30 (10 s) | Yes |
| **Total** | **90 s** | |

---

## Scene 1 — The problem (0:00–0:10)

**What to show:** full-screen text cards over a dark background (no dashboard
yet). Card 1: "Tokenized stocks live on Base mainnet." Card 2: "But there's no
testnet path — no testnet tokens, no testnet price feeds." Card 3: "So builders
can't try anything without real money and KYC."

**Narration (English):**
> "Tokenized stocks are live on Base — but only on mainnet, behind real money
> and KYC. There is no testnet path for builders to try anything."

**On-screen text:**
- "Tokenized stocks on Base: mainnet-only"
- "No testnet tokens. No testnet price feeds."
- "Builders can't experiment — until now."

---

## Scene 2 — Live dashboard, real prices (0:10–0:25)

**What to show:** screen recording of the live dashboard at
http://167.179.88.69:3001. Slow scroll/pan across the six tickers
(NVDA, AAPL, TSLA, META, MSFT, GOOGL) with their live prices and the
"market closed / weekend hold" label if recording off-hours. Hover or
highlight one ticker (NVDA) to show the price source note (Chainlink
Coinbase feed on Base Mainnet).

**Narration (English):**
> "StockPilot fixes that. The dashboard reads real Chainlink prices for
> Coinbase tokenized stocks — straight from Base mainnet feeds. Real prices,
> zero capital."

**On-screen text:**
- "LIVE — http://167.179.88.69:3001"
- "Real Chainlink prices · Base Mainnet feeds"
- "NVDA · AAPL · TSLA · META · MSFT · GOOGL"

---

## Scene 3 — Agent reasoning + paper trade settles onchain (0:25–0:55) — PLACEHOLDER

**⚠️ DO NOT RECORD YET.** Requires: contracts deployed on Base Sepolia,
`TestOracle` mirroring a live price, agent portfolio funded with test USDC,
and at least one live `PaperMarket.buy`/`sell` confirmed on Basescan Sepolia.
When recording, capture in this order: (1) the agent's reasoning log
(`agent/state.json` rationale feed on the dashboard, or terminal output) for
the trade; (2) the dashboard trade-history row appearing; (3) the Basescan
Sepolia transaction page for the trade, with the `TradeExecuted` event
visible. Fill in the bracketed values from the real trade at recording time.

**What to show:** [agent rationale text from the real trade, e.g. "NVDA above
its 8-observation moving average; momentum buy, 100 test USDC"] → dashboard
trade history → Basescan Sepolia tx page
(tx hash: `[TODO: real tx hash from first live trade]`).

**Narration (English):**
> "The agent watches those prices, reasons about them — [read the real
> 1–2 sentence rationale from the trade log] — and executes. The paper trade
> settles fully onchain: synthetic TEST-NVDA minted through Base's own B20
> factory, against test USDC in the vault. Every decision is written down,
> every trade is a real Sepolia transaction."

**On-screen text:**
- "Agent rationale: [TODO: paste the real 1–2 sentence rationale]"
- "Paper trade → onchain settlement"
- "TEST-NVDA minted via the B20 factory · test USDC"
- "Tx: [TODO: Basescan Sepolia link for the real trade]"

**Recording checklist for this scene (fill in at recording time):**
- [ ] Trade ticker + direction: `[TODO]`
- [ ] Rationale (verbatim from log): `[TODO]`
- [ ] Basescan Sepolia tx hash: `[TODO]`
- [ ] `TEST-` token address (`0xb200…`): `[TODO]`

---

## Scene 4 — Portfolio onboarding (0:55–1:20) — PLACEHOLDER

**⚠️ DO NOT RECORD YET.** Requires deployed contracts (vault + market
addresses set in the frontend env) so the onboarding panel is unlocked
(it currently shows a locked state). Record a real end-to-end flow in one
take: connect wallet → switch to Base Sepolia → create portfolio → approve
test USDC → deposit → portfolio appears on the dashboard with the agent
trading it. Use only test USDC from the Circle faucet; never real funds.

**What to show:** wallet connect prompt → network switch to Base Sepolia →
`createPortfolio()` → USDC approve + deposit → dashboard showing the new
portfolio and its first agent-managed position.

**Narration (English):**
> "And anyone can open a paper portfolio. Connect a wallet, deposit test
> USDC from the faucet, and the agent trades it for you — same rules, same
> onchain settlement, same written rationale for every move."

**On-screen text:**
- "Open a paper portfolio"
- "Connect wallet → Base Sepolia → deposit test USDC"
- "The agent trades it. You watch every decision."

---

## Scene 5 — Closing (1:20–1:30)

**What to show:** final card over the dashboard (or a clean dark card):
"StockPilot — paper-trade tokenized stocks on Base. Testnet only. Open
source." Then the live demo URL and repo URL as text.

**Narration (English):**
> "StockPilot. Real prices, real reasoning, real onchain settlement — on
> testnet only, with zero capital. Open source, built for the Base Stocks
> Maxxing quest."

**On-screen text:**
- "StockPilot — Agentic Stock Finance"
- "Testnet only · Zero capital · Open source"
- "Demo: http://167.179.88.69:3001"
- "Repo: github.com/maulanaabdansakur/stockpilot [TODO: confirm after repo creation]"

---

## Narrative arc (summary)

Problem → proof → mechanism → participation → promise. The video opens on
the gap (tokenized stocks exist but builders are locked out of experimenting),
proves the fix is real by showing live Chainlink prices on the public
dashboard, then shows the mechanism — an agent that reasons in plain language
and settles paper trades onchain through Base's own B20 factory — then opens
the door to anyone with a wallet and test USDC, and closes on the honest
terms: testnet only, zero capital, open source.
