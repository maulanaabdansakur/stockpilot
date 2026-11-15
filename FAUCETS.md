# Faucet attempts — StockPilot test wallet (Base Sepolia)

**Date:** 2026-11-15 (checks run 2026-11-14 ~17:19 UTC / 2026-11-15 ~00:19 WIB)
**Wallet:** `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3` (from `agent-wallet.json`, created by sibling agent; fresh test wallet, testnet only)
**Chain:** Base Sepolia, chain ID 84532. Public RPC `https://sepolia.base.org` — verified live (chainId `0x14a34`, block `0x380cdf6` at check time).
**USDC (Base Sepolia, native):** `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)

## Result: NO faucet delivered funds via curl/API

Every automated path is blocked by a human/bot gate or a sign-in that must happen in a browser. Nothing was spent, no accounts were created, no logins performed, no real wallets touched.

## Final balances (verified via RPC after all attempts)

| Asset | Balance |
|---|---|
| Base Sepolia ETH | **0** (`eth_getBalance` → `0x0`) |
| Test USDC | **0** (`balanceOf` → `0x0`) |
| Nonce / tx count | **0** (`eth_getTransactionCount` → `0x0`) |

Wallet is confirmed fresh and empty.

## 1. Circle faucet — test USDC (faucet.circle.com)

- Page `GET https://faucet.circle.com` → **HTTP 200** (144,932 bytes, Next.js app).
- No REST endpoint: `POST /api/faucet` → **HTTP 404** (Next.js 404 page); `POST /api/request-token` → **HTTP 404**. `POST /graphql` → **HTTP 307** redirect to `/`.
- Real API found in the frontend JS: **GraphQL `POST https://faucet.circle.com/api/graphql`**, Apollo client, `credentials: include`, header `Apollo-Require-Preflight: true`.
  Mutation: `RequestToken($input: RequestTokenInput!)`, input `{destinationAddress, blockchain, token}` where `blockchain` is an enum (`BASE`, not `BASE-SEPOLIA`) and `token` is a `Currency` enum (`USDC` / `EURC` / `CIRBTC`).
- Attempts via curl (all with the real wallet address):
  1. Wrong selection set (`txHash`) → HTTP 400 `GRAPHQL_VALIDATION_FAILED` ("Did you mean `hash`?") — proves the endpoint is live and validates queries.
  2. `blockchain: "BASE-SEPOLIA"`, no `token` → HTTP 400 `BAD_USER_INPUT` (enum value does not exist; `token` of required type `Currency!` not provided).
  3. Correct shape `{destinationAddress, blockchain: "BASE", token: "USDC"}` → **HTTP 200** with `{"errors":[{"message":"ReCAPTCHA verification failed","path":["requestToken"],"extensions":{"code":"RECAPTCHA_ERROR"}}], "data":null}`.
- Frontend JS confirms the mechanism: the submit is wrapped in a `withReCaptcha` hook (Google reCAPTCHA, v3 invisible with v2 fallback — `recaptchaSiteKey`, `recaptchaV2FallbackEnabled` in the page config). The token can only be produced by solving the challenge in a real browser session.
- **Verdict: BOT-GATED. Cannot be claimed via curl. Needs a browser.**

## 2. Base Sepolia ETH faucets

### 2a. Chainlink faucet (faucets.chain.link/base-sepolia)
- Page `GET` → **HTTP 200** (136,775 bytes).
- API found in frontend JS: `POST /api/faucet` with `{turnstileToken, requests, walletAddress}`.
- Attempt via curl (no Turnstile token): **HTTP 400** `{"success":false,"message":"Could not verify if you are human."}`
- JS confirms: Cloudflare **Turnstile** widget (`challenges.cloudflare.com/turnstile/v0/api.js`, 14 references) plus an optional wallet-signature step (`REQUEST_SIGNATURE` / `requestSignature` flow on HTTP 401).
- **Verdict: BOT-GATED. Needs a browser (Turnstile challenge + wallet connect, possibly a signature).**

### 2b. Superchain console (console.optimism.io/faucet)
- Page `GET` → **HTTP 200** (3,843-byte SPA shell; app JS at `/assets/index-CnONNpH0.js`).
- JS confirms GitHub OAuth sign-in is required: strings `Link Github to use the faucet`, `github_oauth`, `GithubAuth`, `LoginWithOAuth`; faucet calls go through tRPC (`faucet.nextDrips.useQuery`). Copy: "Anyone can claim [amount] test ETH every 24 hours. For more tokens, verify your identity." / "Verify your onchain identity to get … test ETH every 24 hours. Superchain faucet supports 4 kinds of onchain identity."
- **OUTCOME 2026-11-15 12:45 (live browser): email sign-in + GitHub link both WORKED (maulanaabdansakur, 2FA completed by the user, Authorize clicked; 'Link Github' prompt gone; pujigustiana00 never used). BUT the faucet then demands a wallet connection: only a big red 'Connect wallet' button, all 14 network options (incl. Base Sepolia) disabled, NO address field, NO claim button. Claim is impossible without connecting a wallet — BLOCKED per the no-wallet-connect rule. 0 ETH claimed, nothing connected/signed. Tab left open, signed in, GitHub linked.**

### 2c. Coinbase CDP faucet (portal.cdp.coinbase.com/products/faucet)
- `GET` → **HTTP 200** but redirected to the portal login: `https://portal.cdp.coinbase.com/?from=%2Fproducts%2Ffaucet`.
- Requires a free Coinbase Developer Platform account (sign-in). Per current CDP docs/secondary sources: 0.0001 ETH per claim, up to 0.1 ETH per rolling 24h; 1 USDC per claim, up to 10 USDC per 24h; no mainnet-balance gate — only the CDP account. (One older source claims a 0.001 mainnet-ETH gate; current docs say account-only.)
- **Verdict: CONFIRMED — needs a CDP account + browser sign-in. No account created (per instructions).**

### 2d. Alchemy faucet (alchemy.com/faucets/base-sepolia)
- Page `GET` → **HTTP 200** (294,526 bytes).
- Page text confirms the gate verbatim: *"You need at least 0.001 ETH on Ethereum Mainnet for EVM-based testnets, or an equivalent minimum balance…"* plus sufficient mainnet activity and a low existing testnet balance.
- The fresh wallet holds 0 mainnet ETH → **ineligible by design. Not used.**
- **Verdict: CONFIRMED — 0.001 mainnet ETH required. Do not use for this fresh wallet.**

## What the user/parent must do (minimal, browser-only, no accounts)

Two quick browser claims, no account creation needed for either:

**Step 1 — ETH for gas (Chainlink faucet, ~1 min):**
1. Open https://faucets.chain.link/base-sepolia in a browser.
2. Connect a wallet (or paste the address) — use `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3`.
3. Complete the Cloudflare Turnstile check and, if asked, sign the verification message with the wallet.
4. Click claim. (Drip listed as 0.5 ETH in recent faucet roundups.)

**Step 2 — test USDC (Circle faucet, ~1 min):**
1. Open https://faucet.circle.com in a browser.
2. Network: **Base Sepolia**; Token: **USDC**.
3. Paste destination address `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3`.
4. Submit — the Google reCAPTCHA runs in the browser. Claim should return a tx hash.

If Chainlink fails in the browser, fallback for ETH is the CDP faucet (https://portal.cdp.coinbase.com/products/faucet — needs a free CDP account; also drips test USDC 1 USDC/claim, up to 10/day). The Superchain console is BLOCKED 2026-11-15: it demands a wallet connection after the GitHub link, with no address field.

Unverified alternative (secondary source only, not probed): thirdweb Base Sepolia faucet — up to 0.01 ETH/day, wallet connect, no mainnet-balance check.

## Notes
- No private key is recorded in this file. The wallet's private key lives only in `agent-wallet.json` (sibling agent's file) — never paste it into any faucet or site.
- After the two browser claims, re-verify with: `eth_getBalance` + USDC `balanceOf` on `https://sepolia.base.org` for `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3`, or check Basescan Sepolia.
