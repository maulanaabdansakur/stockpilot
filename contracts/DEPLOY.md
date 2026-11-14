# StockPilot — deploy guide (Base Sepolia, testnet only)

## Status: READY TO DEPLOY — BLOCKED ON FUNDING

Contracts are written, unit-tested locally (`forge test` passes), and the
deploy script is ready. Deployment has **not** been attempted: the deployer
wallet `0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3` holds **0 ETH and 0 test
USDC** (verified via RPC 2026-11-15 ~00:20 WIB; all faucets are bot-gated,
see `../FAUCETS.md`). The script itself also refuses to broadcast with a
0-ETH deployer.

## Deploy command

Run from `contracts/`:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://sepolia.base.org \
  --broadcast
```

Notes:

- The deployer private key is read from `../agent-wallet.json` by the
  script (`vm.parseJsonUint(..., ".private_key")`). It is never printed,
  never passed on the command line, and never committed
  (`.gitignore` covers `agent-wallet.json` — verify before pushing).
- No `--private-key` flag is needed or wanted.
- Deployment order: `TestOracle` → `StockPilotVault` (market unset) →
  `PaperMarket` → `vault.setMarket(market)`, all in one script run.
- Chain: Base Sepolia, 84532. USDC is the native Sepolia USDC
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals).
- The script aborts before broadcasting if the deployer balance is 0.
  Fund the wallet first (see `../FAUCETS.md`: Chainlink faucet for ETH,
  Circle faucet for test USDC — both need a browser).

## Post-deploy checklist (first run on Sepolia)

1. **Verify addresses** on Basescan Sepolia (TestOracle, StockPilotVault,
   PaperMarket) and record them in `DEPLOYED.md`.
2. **`createB20` live check (first call):** call
   `PaperMarket.createInstrument("NVDA")` from the owner wallet and confirm
   it succeeds and returns a `0xb200…` token. The factory calldata uses the
   canonical base-std `B20FactoryLib` encoders and is PROVEN against the
   simulated precompile locally (see "Local testing" below) — but the live
   Sepolia precompile runs the Denim-era build, so the first live call is
   still the moment of truth. If it reverts, the fallback is: create the
   token via the BlueAgent launchpad (`blueagent.dev/app/b20`) and wire it
   in with `PaperMarket.registerInstrument("NVDA", <token>)`.
3. **Sanity checks on the deployed token:** `name()` = `StockPilot Test
   NVDA`, `symbol()` = `TEST-NVDA`, `decimals()` = 18,
   `hasRole(MINT_ROLE, <PaperMarket>)` = true,
   `hasRole(BURN_ROLE, <PaperMarket>)` = true, `supplyCap()` =
   1e9 tokens.
4. **Oracle:** relayer pushes a real mainnet Chainlink NVDA price via
   `TestOracle.pushPrice("NVDA", <price 8-dec>, <updatedAt>)`; confirm
   `getPrice` / `isStale` behave.
5. **First paper trade:** owner (or agent operator) calls
   `PaperMarket.buy(<portfolioId>, "NVDA", <usdc 6-dec>, <maxPrice 8-dec>,
   "first test trade")` after a user portfolio is funded with test USDC;
   confirm the `TradeExecuted` event, the TEST-NVDA mint, and the vault
   debit on Basescan.
6. **Create the remaining instruments** (`AAPL`, `TSLA`, `META`, `MSFT`,
   `GOOGL`) the same way.

## Local testing

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge test          # unit tests (mock B20 factory); B20 integration suite auto-skips
base-forge test     # FULL suite incl. real-precompile B20 tests (49 tests)
forge test -vvv     # verbose, incl. event logs
```

- **Stock `forge test` (47 passed, 1 suite skipped):** all vault/market/
  oracle logic is tested against a MOCK B20 factory (etched onto the real
  factory address `0xB20f…`) + mock USDC. The `B20IntegrationTest`
  contract detects the absent precompile in `setUp` and skips itself.
- **`base-forge test` (49/49 passed):** Base's Foundry build
  (v1.1.0, installed 2026-11-15 via `base-foundryup --install v1.1.0`)
  simulates the B20 precompiles in-process. The same `PaperMarketTest`
  suite runs against the REAL factory (no mock etch), and
  `B20IntegrationTest` exercises `createB20` → mint → burn end to end
  against the real precompile simulation.
- **B20 encoding lesson (found the hard way, 2026-11-15):** the factory
  decodes `params` as a single ABI-encoded struct — `abi.encode(struct)`
  with its leading offset word (320 bytes) — NOT as a flat tuple
  `abi.encode(uint8,string,string,address,uint8)` (288 bytes). The flat
  form makes the precompile revert with an ABI-deserialization error
  ("buffer overrun"). The BlueAgent guide's `abi.encode((...))` notation
  (double parens = single tuple argument) is the correct form. The
  contracts therefore use the canonical `B20FactoryLib` encoders from
  base-std (`encodeAssetCreateParams`, `encodeGrantRole`,
  `encodeUpdateSupplyCap`) and base-std's `IB20Factory`/`IB20`
  interfaces — never hand-rolled factory calldata. Also note the real
  `burn` is `burn(uint256)` on the caller's own balance and needs
  `BURN_ROLE` (in addition to `MINT_ROLE` for `mint`).

## Dependencies

- `forge-std` v1.17.0 (submodule, in `foundry.lock`).
- `base-std` (Base's precompile interfaces + `B20FactoryLib`) — installed
  with `forge install base/base-std --no-git`. It lives in `lib/` (which
  is gitignored), so a fresh checkout needs that install step before
  `forge build`/`forge test` will compile. Pin to the same main-branch
  commit when reproducibility matters.

## base-forge (local B20 tests) — RESOLVED

Installed cleanly on the second attempt (`base-foundryup --install
v1.1.0`; the first attempt's `tar` failed on a chown error but the
binaries had already extracted, and the retry finished the install).
`base-forge`/`base-cast`/`base-anvil`/`base-chisel` are in
`~/.foundry/bin/`. Full suite green under `base-forge test` (49/49).
Sepolia remains the final B20 verification surface per the checklist
above (the local sim is the Beryl-era precompile build; Sepolia runs
Denim).
