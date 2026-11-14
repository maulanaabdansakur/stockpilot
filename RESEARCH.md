# Research — tokenized-stock infrastructure on Base (verified 2026-11-14)

All facts below were verified from official docs/pages or from evidence-based third-party probes
(usance capability matrix, probed 2026-09-08) on 2026-11-14. Aggregator claims were NOT used
where an official source exists.

## 1. The quest itself

- Quest: Base Stocks Maxxing Builder Quest 2026 — `base.org/stocksmaxxing`
  (read directly 2026-11-14). "Build the next generation of tokenized stock products on
  Base. 1 Month • $100,000+ in Rewards • Nov 5 to Dec 5."
- Timeline on the page: Nov 5 applications open; Nov 6–13 brainstorm with partners;
  Nov 13–Dec 5 build & launch; Dec 5 submit; winners announced after.
- "Ship a new tokenized-stock product on Base: an app, agent, community, or financial tool.
  Launching a token is optional." / "Each track has a Base prize pool. Launchpad partners add
  their own prizes, incentives, and other support on top."
- Partners listed: o1 Exchange, Bankr, Stonks Exchange, BaseStonk, Feel.cash, Hydropump by Hydrex.
- Resources linked: Builder Codes (attribute onchain activity), Tokenized Stocks API,
  "Integrate tokenized stocks", Builder Stack.
- FAQ: "Any teams that have previously launched tokens are not eligible by default. Teams must
  ship a demonstrable stock-linked product or feature during the campaign."
- **Per-track prize amounts and judging weights: NOT visible in the text fetch** (JS-rendered
  track sections). Still unverified. The ~50% traction / 25% product / 25% building-in-public
  split comes from secondary reports (Crypto Briefing, cryptosbank.in) only.
- Rules: `base.org/stocksmaxxing/rules` — verified by the parent agent 2026-11-14 17:11 WIB
  (18+, Indonesia eligible, solo OK, testnet not judged less favorably, no payment to enter,
  prizes USD paid in USDC on Base, winners reply within 7 days with ID/age/residence proof,
  sanctions screening, W-9/W-8, wallet, signed declaration).

## 2. Coinbase tokenized stocks on Base (the quest's own theme)

Source: `docs.base.org/specifications/b20/tokenized-stocks-on-base` (read directly 2026-11-14;
updated 2026-11-13) + `base.org/stocks` + OnchainTicker issuers page.

- Built on **B20**, Base's native token standard (ERC-20 extension, asset-agnostic).
- B20 tokens are **native precompiles, not deployed contracts** — no per-asset bytecode on
  Basescan. B20 shipped in Base's Beryl upgrade; audited by Base and Spearbit; Cantina +
  HackerOne coverage.
- Issuer: Coinbase (Coinbase Onchain SPV Ltd., ADGM; FSRA-approved prospectus; shares held
  1:1 with Alpaca Securities, bankruptcy-remote). Secondary market **permissionless**; KYC
  only for Authorized Participant mint/redeem.
- Available only in eligible jurisdictions outside the US (Regulation S).
- Tokens: AAPLc, NVDAc, METAc, GOOGLc, MSFTc, TSLAc, AMZNc, MSTRc, SPCX, SNDK, COINc, CRCLc,
  INTCc… (13 tracked on Aerodrome, ~$41.7M value, 35.9k holders; OnchainTicker counts 65
  tokens, $46.03M mkt cap — counts differ by source/date; the 10 feeds below are the
  documented Chainlink set).
- B20 features: multiplier (ERC-8056, dividends/splits via `updateUIMultiplier`), policies
  (allow/blocklists, `isAuthorized`), pauses, onchain announcements, `transferWithMemo`,
  supply cap, `extraMetadata` (ISIN/CUSIP).
- **Mainnet only. No testnet versions of the real tokens exist.**

### Chainlink Coinbase tokenized-equity feeds — Base Mainnet (read-only, no key)

8 decimals, 24/5 market hours, 0.5% deviation or 24h heartbeat, **Total Return Values**
(underlying price × multiplier). Read via `latestRoundData()` on the proxy.

| Feed | Address |
|---|---|
| Coinbase AAPL | `0x787f13dEa48Db0897CbCDD985de77809D837F988` |
| Coinbase AMZN | `0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295` |
| Coinbase GOOGL | `0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2` |
| Coinbase META | `0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D` |
| Coinbase MSFT | `0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c` |
| Coinbase MSTR | `0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a` |
| Coinbase NVDA | `0x04689a41629776563E6822F76f2e57D148d28513` |
| Coinbase SNDK | `0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA` |
| Coinbase SPCX | `0x6A634B235903C4ad6376892180d6fF8612e3Fa68` |
| Coinbase TSLA | `0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4` |

Plus (from the usance probe, same feed family): COIN `0x408e44f504A7371a345F03a73dDC96A4b48e8aa7`,
CRCL `0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33`, INTC `0xAB657C39bac0D5886250D70849e2E3E008F2EECB`.

- **No Coinbase tokenized-equity feeds on Base Sepolia** (usance RDD probe: 0 of 9
  Base-Sepolia feeds). Feeds hold last close on weekends/holidays and freeze during
  corporate actions — always check `updatedAt` staleness.
- Onchain Registry (multiplier + pause flag in one call):
  `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD`.
- Tokenized Stocks API (public, read-only, **no API key**): list token contracts, supplies,
  metadata, prospectuses, corporate actions; returns `nav_price`, `nav_price_updated_at`,
  `multiplier`. Base URL + endpoints documented at `docs.base.org/sdks/tokenized-stocks/overview`.

## 3. B20 on Base Sepolia — the testnet path

Sources: Chainstack "What is B20?" (Nov 2026), BlueAgent B20 skill/guide (GitHub), usance
capability matrix (probed 2026-09-08), Solbase B20 vs ERC-20.

- B20 live on **Base Sepolia since 18 Jun 2026** (Beryl), mainnet 25 Jun 2026. Denim upgrade
  (Sepolia 21 Oct, mainnet 5 Nov 2026) tightened B20 rules; 200 ms blocks.
- Factory precompile: `0xB20f000000000000000000000000000000000000` (same on mainnet + Sepolia).
- ActivationRegistry: `0x8453000000000000000000000000000000000001` — check `isActivated`
  before deploying; deploying early reverts `FeatureNotActivated`.
- PolicyRegistry: `0x8453000000000000000000000000000000000002`.
- `createB20(variant, salt, params, initCalls)`; variant 0 = ASSET (decimals 6–18,
  multiplier, announcements, extra metadata), 1 = STABLECOIN (decimals fixed 6, ISO code).
- Token addresses deterministic, `0xB200…` prefix; variant encoded in the address.
- **Tooling caveat:** standard Foundry cannot simulate B20 precompiles — Base's Foundry
  build (`base-forge` / `base-cast`) is needed for local B20 tests. Alternative: test B20
  behavior directly on Sepolia.
- Synthetic test B20 strategy (proven by the usance project): create ASSET-variant
  instruments on Sepolia via the real factory, labeled with a `TEST-` prefix, no ticker
  mimicry of real Coinbase instruments; Sepolia lifecycle uses a `TEST_ONLY` oracle.

## 4. Other issuers — why they don't help on testnet

| Issuer | Base? | Testnet? | Verdict |
|---|---|---|---|
| **Dinari dShares** | Yes — live on Base mainnet (dinari.com blog; 724 stocks/ETFs) | No | KYC-gated; transfers restricted to whitelisted wallets. Not usable. |
| **xStocks (Backed)** | No (Ethereum, Solana, Arbitrum, BNB, TON, Mantle, X Layer, Ink) | — | Not on Base. |
| **Ondo Global Markets** | No (Ethereum, Solana, BNB Chain; 450+ tokens) | — | Not on Base. Chainlink Ondo feeds exist (docs.chain.link) but the tokens aren't on Base. |
| **Robinhood Chain** | No — separate Arbitrum Orbit L2 (chain 46630) | Testnet faucet gives test ETH + simulated stock tokens (TSLA, AMZN, PLTR, NFLX, AMD) | Wrong chain for this quest. Reference only. |
| **Coinbase B20** | Yes, mainnet only | No real testnet tokens; synthetic B20 path only | **The path: real mainnet prices + synthetic testnet B20.** |

## 5. Adjacent existing project (differentiation)

- **QuantL** (quantl.click) — dashboard of 195 tokenized instruments with daily signals;
  agents buy one reading for $0.05 in test USDC via x402 on Base Sepolia. Trade execution by
  agents is off; no agent can trade through it. StockPilot differs: an agent that actually
  trades (paper) onchain with settlement + portfolio management, not a signal shop.

## 6. Testnet resources (Base Sepolia, chain 84532)

- Public RPC: `https://sepolia.base.org`. Explorer: Basescan Sepolia.
- Native USDC (Base Sepolia): `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals).
  Acquisition: Circle faucet (`faucet.circle.com`).
- Base Sepolia ETH faucets: Coinbase CDP faucet (up to 0.1 ETH/24h; needs Coinbase Developer
  account, no mainnet balance); Superchain console (0.01 ETH/day; GitHub link);
  Alchemy (0.1 ETH/24h; needs 0.001 mainnet ETH); Chainlink faucet (ETH + LINK, wallet
  connect); Chainstack faucet.
- Free LLM for the agent's rationale layer: Pollinations (already used in TokoAI — proven).
- Agent host: existing Vultr box (167.179.88.69) — light Node process; no new infra spend.

## 7. Source list (verbatim URLs used)

- https://www.base.org/stocksmaxxing
- https://www.base.org/stocksmaxxing/rules
- https://docs.base.org/specifications/b20/tokenized-stocks-on-base
- https://docs.base.org/build-on-base/integrate-defi/list-tokenized-stocks
- https://docs.base.org/sdks/tokenized-stocks/overview
- https://www.base.org/stocks
- https://docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase (referenced via usance probe; page exists per Chainlink docs index)
- https://docs.chain.link/data-feeds/tokenized-equity-feeds/ondo
- https://dinari.com/blog/dinari-dshares-now-live-on-base
- https://onchainticker.app/issuers/
- https://github.com/winsznx/usance/blob/HEAD/docs/base/BASE_CAPABILITY_MATRIX.md
- https://chainstack.com/what-is-b20-base-token-standard/
- https://github.com/madebyshun/blue-agent/blob/HEAD/skills/b20-launch-guide.md
- https://github.com/madebyshun/blueagent-skill/blob/HEAD/skills/b20/SKILL.md
- https://www.quantl.click/
- https://www.ickweb3.com/blog/testnet-faucets
