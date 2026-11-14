# StockPilot contracts — Base Sepolia (testnet only)

Foundry project for the StockPilot Agentic Stock Finance entry (Base Stocks
Maxxing). See `../CONCEPT.md` for the product concept and `DEPLOY.md` for
deployment.

## Contracts (`src/`)

| Contract | Role |
|---|---|
| `TestOracle.sol` | TEST_ONLY price oracle (8-decimal prices mirrored from mainnet Chainlink feeds by the offchain relayer; staleness bounds; relayer-only pushes). |
| `StockPilotVault.sol` | Custodian for test USDC (Base Sepolia native USDC); per-portfolio deposits/withdrawals with pro-rata share accounting. The market settles trades by accounting here — the vault is the sole USDC holder. |
| `PaperMarket.sol` | Paper buys/sells of synthetic TEST B20 ASSET tokens (`TEST-<TICKER>`) at the oracle price, via the real B20 factory precompile; deviation band + staleness guards; agent-only execution; onchain trades, positions, P&L. |

B20 calls use base-std's `B20FactoryLib` encoders and `IB20Factory`/`IB20`
interfaces — never hand-rolled factory calldata (see DEPLOY.md for why).

## Test

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge test          # unit tests, mock B20 factory (47 passed; B20 suite auto-skips)
base-forge test     # full suite incl. real-precompile B20 tests (49 passed)
```

`base-forge` is Base's Foundry build (v1.1.0, `base-foundryup --install
v1.1.0`); it simulates the B20 precompiles locally. Standard Foundry
cannot simulate them, so `forge test` etches a mock factory onto
`0xB20f…` instead.

## Deploy

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url https://sepolia.base.org --broadcast
```

Deploys `TestOracle` → `StockPilotVault` → `PaperMarket`, then wires the
vault to the market. The deployer key is read from
`../agent-wallet.json` (never printed, never committed). The script
refuses to broadcast when the deployer holds 0 ETH — fund the wallet
first (see `../FAUCETS.md`). Full checklist: `DEPLOY.md`.
