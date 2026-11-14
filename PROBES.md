# StockPilot — Day 1 probes (B20 activation, price feeds, API, LLM)

**Date:** Sun 2026-11-15 ~00:14–00:30 WIB (Sat 2026-11-14 ~17:14–17:30 UTC)
**Scope:** read-only probes only. Nothing deployed, no wallet created, nothing spent.
**Tooling note:** `cast`/`foundry` are NOT installed on this VM (`which cast` → not found).
All `eth_call`s below were therefore made as raw JSON-RPC `POST`s via `curl`/`python3`
(keccak via `pycryptodome`), which is exactly what `cast call` does under the hood.
The equivalent `cast` commands are recorded for the build phase.

---

## 0. TL;DR verdicts

| Probe | Verdict |
|---|---|
| **R1 — B20 ASSET activation on Base Sepolia** | **GO — B20 synthetic path viable.** `isActivated(keccak256("base.b20_asset"))` = **true** on Sepolia. STABLECOIN also true. ERC-20 fallback NOT needed. |
| Chainlink NVDA feed (Base Mainnet) | **LIVE** — $160.77, updated Fri 2026-11-13 23:36:23 UTC (weekend hold, expected). |
| Chainlink AAPL feed (Base Mainnet) | **LIVE** — $355.58, updated Fri 2026-11-13 21:05:53 UTC (weekend hold, expected). |
| Tokenized Stocks API | **REACHABLE, HTTP 200, no key.** List endpoint returns 100 tokens/page; NVDAc/AAPLc `nav_price` matches the Chainlink feeds exactly. Caveat: most tokens have `nav_price: null`. |
| Pollinations LLM | **REACHABLE, HTTP 200** in ~2.5 s. |

---

## 1. ActivationRegistry.isActivated — exact signature (verified)

### Sources (quoted)

**BlueAgent B20 skill** (`github.com/madebyshun/blueagent-skill/blob/HEAD/skills/b20/SKILL.md`,
Step 0 — "Verify the network is activated (REQUIRED)"):

> ```
> REG=0x8453000000000000000000000000000000000001
> base-cast call $REG "isActivated(bytes32)(bool)" $(base-cast keccak "base.b20_asset")     --rpc-url <RPC>
> base-cast call $REG "isActivated(bytes32)(bool)" $(base-cast keccak "base.b20_stablecoin") --rpc-url <RPC>
> ```
> "Proceed only if it returns `true` for the variant you're deploying. If `false`,
> the network isn't live yet — use Base Sepolia to test."

**B20 Labs SDK docs** (`docs.b20labs.app`):

> "B20 activates per-variant via the Activation Registry. … Check on-chain, or deploys
> revert with `FeatureNotActivated`." … "`FEATURE_KEYS` | keccak256("base.b20_asset") /
> ("base.b20_stablecoin")"

### Resolution of the CONCEPT.md §9 hint

- The variant identifier is **a `bytes32` = `keccak256("base.b20_asset")`** — NOT a `uint8`.
  The `uint8` (0 = ASSET, 1 = STABLECOIN) is the variant discriminant used by the
  **factory's** `createB20(variant, salt, params, initCalls)`, a different call.
- `isActivated` signature: **`isActivated(bytes32)(bool)`**,
  selector `0xba87af80` (= first 4 bytes of `keccak256("isActivated(bytes32)")`, computed locally).
- Computed feature keys (keccak256, via `Crypto.Hash.keccak`):
  - `keccak256("base.b20_asset")`      = `0xcdcc772fe4cbdb1029f822861176d09e646db96723d4c1e82ddfdeb8163ef54c`
  - `keccak256("base.b20_stablecoin")` = `0xecfa0def2c10020caaf65e6155aa69c84b24892aaef76eeac52e0e2b3a0b8601`
- The official B20 spec page (`docs.base.org/specifications/b20/tokenized-stocks-on-base`,
  updated 2026-11-13) does **not** document `ActivationRegistry`/`isActivated` at all —
  the signature comes from the BlueAgent skill + B20 Labs docs above, and is confirmed
  empirically by the successful calls in §2 (a wrong signature/encoding would revert
  or return garbage, not a clean `bool`).

### Equivalent cast commands (for build phase, once base-cast is installed)

```bash
REG=0x8453000000000000000000000000000000000001
base-cast call $REG "isActivated(bytes32)(bool)" 0xcdcc772fe4cbdb1029f822861176d09e646db96723d4c1e82ddfdeb8163ef54c --rpc-url https://sepolia.base.org
# expected: true
base-cast call $REG "isActivated(bytes32)(bool)" 0xecfa0def2c10020caaf65e6155aa69c84b24892aaef76eeac52e0e2b3a0b8601 --rpc-url https://sepolia.base.org
# expected: true
```

---

## 2. R1 — isActivated on Base Sepolia (the go/no-go)

**RPC:** `https://sepolia.base.org` — `eth_chainId` returned `0x14a34` (= 84532) ✓

**Raw `eth_call` requests** (POST JSON-RPC, `to` = `0x8453000000000000000000000000000000000001`):

| Call | calldata | Raw result |
|---|---|---|
| `isActivated(ASSET)` | `0xba87af80` + `cdcc772fe4cbdb1029f822861176d09e646db96723d4c1e82ddfdeb8163ef54c` | `0x0000000000000000000000000000000000000000000000000000000000000001` → **true** |
| `isActivated(STABLECOIN)` | `0xba87af80` + `ecfa0def2c10020caaf65e6155aa69c84b24892aaef76eeac52e0e2b3a0b8601` | `0x0000000000000000000000000000000000000000000000000000000000000001` → **true** |

**Verdict: R1 = GO. B20 synthetic path viable on Base Sepolia.** Both variants activated.
No revert, no error, clean single-word `bool` return. ERC-20 paper-share fallback not needed
(keep as contingency only).

**Supporting checks:**
- `eth_getCode` ActivationRegistry (`0x8453…0001`) on Sepolia → `0xef` (single marker byte —
  a precompile, not a deployed contract; consistent with registry being node-level).
- `eth_getCode` B20 factory (`0xB20f000000000000000000000000000000000000`) on Sepolia → `0x`
  (no bytecode, as documented — precompiles hold no code; do NOT use `eth_getCode` to test liveness).
- One transient RPC hiccup: the first factory `eth_getCode` attempt hit
  `RemoteDisconnected` (remote end closed connection without response); the retry
  immediately after succeeded. Sepolia public RPC is flaky under load — retry logic
  is warranted in the agent.

### Enumeration probe — does the registry list activated variants?

- **No enumeration/list function found.** The two authoritative B20 sources
  (BlueAgent skill, B20 Labs docs) document only per-key `isActivated(bytes32)`;
  no `listFeatures`/`activatedFeatures`/`getAll` function is documented anywhere
  in them, and a web search for the `base-std` `IActivationRegistry` interface
  returned no usable interface definition (only unrelated results).
- The only known feature keys are `base.b20_asset` and `base.b20_stablecoin`
  (both verified `true` above). Any other variant would have to be probed by
  guessing its `keccak256("base.…")` key — there is no onchain way to enumerate.
- Practical consequence: none for StockPilot — the two variants we care about are
  both confirmed active. Do not build anything that depends on enumerating the registry.

---

## 3. Chainlink Coinbase equity feeds — Base Mainnet

**RPC:** `https://mainnet.base.org` (first try, no 429; `eth_chainId` = `0x2105` = 8453 ✓).
Call: `latestRoundData()` — selector `0xfeaf968c`, decoded as
`(roundId, answer, startedAt, updatedAt, answeredInRound)`, 8 decimals.

| Feed | Address | Answer (raw) | Price | `updatedAt` (UTC) | Round |
|---|---|---|---|---|---|
| **NVDA** | `0x04689a41629776563E6822F76f2e57D148d28513` | `16076543559` | **$160.77** | **2026-11-13 23:36:23** | phase 2, round 1296 |
| **AAPL** | `0x787f13dEa48Db0897CbCDD985de77809D837F988` | `35558500000` | **$355.58** | **2026-11-13 21:05:53** | phase 2, round 554 |

Raw `latestRoundData` returns (truncated):
- NVDA: `0x…020000000000000510…0000000003be3c9647…000000006af79eea…` (answer `0x3be3c9647` = 16076543559; updatedAt `0x6af79eea` = 1794612983)
- AAPL: `0x…02000000000000022a…00000000084773a6a0…000000006af77ba4…` (answer `0x84773a6a0` = 35558500000; updatedAt `0x6af77ba4` = 1794603953)

**Verdict: both feeds LIVE, values are Friday's close — EXPECTED, not a failure.**
Today is Sunday 2026-11-15; the feeds are 24/5 and hold last close on weekends.
Timestamps are Fri 2026-11-13 evening UTC (21:05 and 23:36 — after the 21:00 UTC market
close; the 23:36 NVDA update is a post-close/heartbeat update). No staleness concern
for a Sunday probe; the agent must still enforce `updatedAt` staleness checks at runtime
(per CONCEPT.md R2) and hold trades on weekends.

**Cross-validation (strong):** the Tokenized Stocks API (§4) reports the *identical*
values for the same tokens — NVDAc `nav_price` 160.76543559 @ 2026-11-13T23:36:23Z and
AAPLc `nav_price` 355.585 @ 2026-11-13T21:05:53Z. Two independent official sources agree
to the cent and the second. (Feeds report Total Return Values — underlying price ×
multiplier — per the B20 spec page; that is why the AAPL figure is a total-return value,
not a raw share price.)

---

## 4. Tokenized Stocks API (public, no key)

**Base URL discovery:** the docs overview page
(`docs.base.org/sdks/tokenized-stocks/overview`) does not print the base URL in its
text; it is embedded in the page's cURL examples. Grepping the fetched page HTML found it:

> **Base URL: `https://api.coinbase.com/v1/tokenized-stocks`**
> (NOT `api.base.org` — the API is hosted on `api.coinbase.com`.)

Endpoints (from the overview page): `GET /` (list), `GET /chains`,
`GET /total-supply/{contract_address}`, `GET /metadata/{ticker}`, `GET /images/{symbol}`,
`GET /prospectus/{ticker}`, `GET /prospectuses`, `GET /corporate-actions/{id}`.

### List endpoint — `GET /?page_size=100`

- **HTTP 200 in ~1.8 s.** Page 1: **100 tokens**, `next_page_token` present (paginated;
  pages 2 and 3 also fetched, 100 tokens each, more pages remain).
- Tokens are B20 addresses (`0xb200…` prefix), 8 decimals, ordered by contract address.
- **Caveat — `nav_price` is sparse:** most tokens return `nav_price: null`
  (page 1: only 4/100 with a NAV; page 2: 5/100; page 3: 2/100).
  Docs warn: "Do not treat missing NAV data as a usable price." StockPilot must use
  the Chainlink feeds as the price source and treat API NAV as a cross-check only.
- Sample rows with NAV (page 1): CRCLc $61.215 @ 2026-11-14T00:34:26Z;
  TSLAc $387.793 @ 2026-11-13T21:32:29Z; GOOGLc $294.89116703 @ 2026-11-13T15:37:14Z,
  multiplier 1.0003771186767842; SNDKc $866.831 @ 2026-11-13T22:29:24Z.

### Target tickers (found on later pages)

| Token | Contract | `nav_price` | `nav_price_updated_at` | Multiplier |
|---|---|---|---|---|
| NVDAc | `0xb20000000000000000000078ee7ce2fE4908108C` | **160.76543559** | 2026-11-13T23:36:23Z | 1.0005379395763694 |
| AAPLc | `0xb200000000000000000000C2e324d24d7eEcd1fb` | **355.585** | 2026-11-13T21:05:53Z | 1 |
| METAc | `0xb2000000000000000000008bC8786B856E61707C` | 638.54030616 | 2026-11-13T21:05:04Z | 1.0003137922895982 |
| MSFTc | `0xB200000000000000000000Ab99cFa739E253872B` | 522.405 | 2026-11-13T21:03:29Z | 1 |

- NVDAc/AAPLc NAV matches the Chainlink feed values from §3 exactly (price + timestamp).
- `/metadata/{ticker}` quirk: it takes the **tokenized** ticker (`NVDAc`), NOT the bare
  equity ticker — `GET /metadata/NVDA` → **HTTP 404**
  `{"code":5,"message":"ticker \"NVDA\" is not a listed tokenized equity token"}`.
  `GET /metadata/NVDAc` → HTTP 200 but with `nav_price`/`multiplier`/`decimals`/`isin`
  all `null` (sparse record — the list endpoint is the richer source for NAV).
- `GET /chains` → HTTP 200:
  `{"chains":[{"chain_id":"8453","chain":"base","policy_registry_address":"0x8453…0002",
  "token_supply_manager_address":"0xD1Ca4dAcdf3231011D175351f1f02D15C7c5664C",
  "token_factory_address":"0x4bA3E29E254F25E94E61C4c9d67b37027331534D"}]}`
  (note: this `token_factory_address` is the API's TokenSupplyManager-era factory, not the
  `0xB20f…` precompile — do not confuse the two.)

**Verdict: API reachable and usable as a secondary price cross-check + token-list source.
Primary price source remains the Chainlink feeds (§3).**

---

## 5. Pollinations LLM — reachability

```bash
curl -s -m 30 "https://text.pollinations.ai/What%20is%202%2B2%3F%20Answer%20in%20one%20word."
# → "Four"
# HTTP 200 in 2.535852s
```

**Verdict: reachable, HTTP 200, sensible one-word answer in ~2.5 s.**
Re-confirms the TokoAI-proven path. (Rationale layer only; a failed LLM call never
blocks a trade per CONCEPT.md R4.)

---

## 6. What remains for Day 1–2 (not probed here — needs a wallet / user acts)

1. Circle faucet test USDC claim (needs a wallet address; no wallet created in this probe).
2. Base Sepolia ETH faucet claim (CDP / Superchain / Chainlink).
3. Install Base's Foundry build (`base-forge`/`base-cast`) for local B20 tests
   (standard Foundry cannot simulate B20 precompiles) — or test B20 directly on Sepolia.
4. First `createB20` dry-run design: ASSET variant, `TEST-` prefix, decimals 18,
   `MINT_ROLE` to the deployer, supply cap set at creation.

## Sources

- https://docs.base.org/specifications/b20/tokenized-stocks-on-base (updated 2026-11-13)
- https://github.com/madebyshun/blueagent-skill/blob/HEAD/skills/b20/SKILL.md (Step 0)
- https://github.com/madebyshun/blue-agent/blob/HEAD/skills/b20-launch-guide.md
- https://docs.b20labs.app/ (FEATURE_KEYS table)
- https://docs.base.org/sdks/tokenized-stocks/overview
- https://docs.base.org/sdks/tokenized-stocks/api-reference/list-tokenized-stocks
