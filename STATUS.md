# StockPilot — status / milestone tracker

**Updated:** Sun 2026-11-15 ~01:10 WIB (Days 12–13 polish).
**Deadline:** submit by 5 Dec 2026 (Quest period 5 Nov–5 Dec 2026).
**Builder:** Maulana Abdan Sakur (solo, Bandung, Indonesia).
**Track:** Agentic Stock Finance. **Testnet only — zero capital, no mainnet.**

## Milestones

| Milestone | Dates | Status |
|---|---|---|
| Days 1–2 — Probes | 15–16 Nov | ✅ DONE — R1 GO. `ActivationRegistry.isActivated("base.b20_asset")` = true on Base Sepolia (verified onchain 2026-11-15 ~00:14–00:30 WIB). Chainlink NVDA $160.77 / AAPL $355.58 live on mainnet feeds; Tokenized Stocks API reachable (no key); Pollinations LLM reachable. ERC-20 fallback NOT needed. Details: `PROBES.md`. |
| Days 3–5 — Contracts | — | ✅ DONE, committed (`c2c352a`), **NOT deployed**. `StockPilotVault` + `PaperMarket` + `TestOracle` written; `forge test` 47 pass; `base-forge test` 49/49 pass incl. real-precompile B20 mint/burn. Deploy script ready (`contracts/script/Deploy.s.sol`). Details: `contracts/DEPLOY.md`. |
| Days 6–8 — Agent | — | ✅ DONE, committed (`251b8d1`), **dry-run only**. Watcher reads real mainnet feeds (6 tickers verified); strategist + Pollinations rationale; relayer + executor with dry-run calldata logging; scheduler 30 min market hours / 60 min off-hours; `npm test` 26/26 pass. No live tx sent. Details: `agent/README.md`. |
| Days 9–11 — Frontend | — | ✅ DONE, committed (`d71fa0b`, `7cc7a43`), **LIVE**. Next.js dashboard at http://167.179.88.69:3001 (Vultr Docker `stockpilot`, port 3001; Revenant Reader :3000 + VeriBrief :80 untouched). Live Chainlink prices verified; agent panel reads `agent/state.json` snapshot; onboarding locked until contracts deploy. Details: `frontend/README.md`. |
| Days 12–13 — Polish | 15 Nov | ✅ DONE (this file's items). Demo video script (`DEMO-VIDEO-SCRIPT.md`, Scenes 1/2/5 recordable now; Scenes 3/4 placeholder until deployment + first live trade); submission-form draft (`SUBMISSION-DRAFT.md`, TODOs marked); build-in-public drafts (`BUILD-IN-PUBLIC.md`, 2 postable now, 1 placeholder); this tracker; README status updated. |
| Dec 1–4 — Buffer + submit | 1–4 Dec | ⏳ PENDING. Buffer for slips; user posts the X video + submits the official form (both reserved for the user). |

## Current blockers

1. **Repo creation (user/parent act).** No GitHub remote exists (`git remote -v`
   is empty). Repo to create: `github.com/maulanaabdansakur/stockpilot`.
   Local commits ready to push: `ab28545` (scaffold), `c2c352a` (contracts),
   `251b8d1` (agent), `d71fa0b` + `7cc7a43` (frontend), plus this polish
   commit. **Before pushing, verify `.gitignore` covers `agent-wallet.json`
   (private key — never committed).**
2. **Wallet funding (browser act by parent).** Deployer/agent wallet
   `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3` holds **0 ETH and 0 test
   USDC** (verified via RPC). All faucets are bot-gated; funding needs a
   browser: Chainlink faucet for Sepolia ETH + Circle faucet for test USDC.
   Exact steps: `FAUCETS.md` ("What the user/parent must do"). The deploy
   script refuses to broadcast with a 0-ETH deployer. **Nothing deploys
   until this clears.**

## Exact next commands after funding

Run in order once the wallet is funded (verify balances first via
`eth_getBalance` + USDC `balanceOf` on `https://sepolia.base.org`, or
Basescan Sepolia):

```bash
# 1. Deploy contracts (from contracts/)
cd ~/workspace/base-stocks-maxxing/contracts
export PATH="$HOME/.foundry/bin:$PATH"
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://sepolia.base.org \
  --broadcast
# Record TestOracle / StockPilotVault / PaperMarket addresses in
# contracts/DEPLOYED.md and verify each on Basescan Sepolia.

# 2. First live createB20 check (owner wallet)
#    PaperMarket.createInstrument("NVDA") -> expect a 0xb200... token.
#    Sanity: name() = "StockPilot Test NVDA", symbol() = "TEST-NVDA",
#    decimals() = 18, MINT_ROLE + BURN_ROLE held by PaperMarket,
#    supplyCap() = 1e9 tokens.
#    If it reverts: fallback is the BlueAgent launchpad
#    (blueagent.dev/app/b20) + PaperMarket.registerInstrument("NVDA", <token>).
#    Then create the remaining instruments: AAPL, TSLA, META, MSFT, GOOGL.

# 3. Push a real price + first paper trade (post-deploy checklist in
#    contracts/DEPLOY.md §"Post-deploy checklist"):
#    TestOracle.pushPrice("NVDA", <price 8-dec>, <updatedAt>), then
#    PaperMarket.buy(<portfolioId>, "NVDA", <usdc 6-dec>, <maxPrice 8-dec>,
#    "first test trade") after funding a portfolio with test USDC.
#    Confirm the TradeExecuted event + TEST-NVDA mint + vault debit on
#    Basescan; record the tx hash (needed for the demo video Scene 3,
#    the submission draft §4, and build-in-public post (c)).

# 4. Configure + start the agent live (from agent/)
cd ~/workspace/base-stocks-maxxing/agent
cp .env.example .env   # if not done; fill in the three deployed addresses
# TEST_ORACLE_ADDRESS=<from step 1>
# PAPER_MARKET_ADDRESS=<from step 1>
# STOCKPILOT_VAULT_ADDRESS=<from step 1>
npm run dev -- --once   # one live cycle first; check the trade lands onchain
npm start                # then the scheduled loop (30 min market / 60 min off-hours)

# 5. Redeploy the frontend with contract addresses (from frontend/)
cd ~/workspace/base-stocks-maxxing/frontend
# Set in .env.local: NEXT_PUBLIC_VAULT_ADDRESS, NEXT_PUBLIC_PAPER_MARKET_ADDRESS,
# NEXT_PUBLIC_TEST_ORACLE_ADDRESS (plus server-side mirrors for /api/trades)
./deploy-vultr.sh        # builds locally, syncs, restarts stockpilot on :3001
# Verify http://167.179.88.69:3001 shows onchain positions/trades and the
# onboarding panel is unlocked; test connect -> deposit test USDC end-to-end.

# 6. Push the repo (once created on GitHub)
cd ~/workspace/base-stocks-maxxing
git push origin master   # verify remote/branch name at repo creation time
```

After steps 1–6: record the demo-video Scene 3/4 footage, fill the TODOs in
`DEMO-VIDEO-SCRIPT.md` / `SUBMISSION-DRAFT.md` / `BUILD-IN-PUBLIC.md`, and
hand the X post + form submission to the user (Dec 1–4 buffer).

## Files

- `CONCEPT.md` — concept, architecture, milestone plan, risks
- `RESEARCH.md` — verified research (quest rules, B20, feeds, faucets)
- `PROBES.md` — Day 1–2 probe evidence (R1 GO)
- `FAUCETS.md` — faucet attempts + exact browser funding steps
- `contracts/DEPLOY.md` — deploy guide + post-deploy checklist
- `agent/README.md` — agent setup, run flags, verified dry-run behaviour
- `frontend/README.md` — dashboard + Vultr deploy
- `DEMO-VIDEO-SCRIPT.md` — 90 s demo script (Scenes 3–4 placeholder)
- `SUBMISSION-DRAFT.md` — filled form draft (TODOs marked)
- `BUILD-IN-PUBLIC.md` — 3 X post drafts (2 postable, 1 placeholder)
- `STATUS.md` — this tracker
