# StockPilot — Deployed on Base Sepolia (chain 84532)

Deployed 2026-11-15 ~13:30 WIB by deployer 0xDAa5726A8d3e71d6346fA5Ee8B28687d05DF76a3
(funded by Abdan's faucet claim: 0.0095 ETH sent from his laptop wallet 0x14f0...).

| Contract | Address |
|---|---|
| TestOracle | 0x6EeB136E317a4B0780d91072fdcB4939ac420496 |
| StockPilotVault | 0x33D30CFADEe66bF56358eFE0bDFE1045dfb76042 |
| PaperMarket | 0x0a7DCb33866023998c63A7a37661A3f88a0c188e |

Deploy txs:
- TestOracle 0x9b4078329a756582c4d5f3381ab2361cbc0209ebf951b9706dc3cb07f7fc06b9
- StockPilotVault 0x8c0bfca6cf266f538e8a7996a656ef4aa9cc355a647297afdb88cc3afac52ab0
- PaperMarket 0x41a7dae6c8be1d3546c2f12f01f42edb9a3b6f0d7fd47f945c3c0c725b4441ea
- vault.setMarket 0xe74f69a58be8aa24cd8d1eca08d3935a81abe0be471eadcbe490960c0b717c80

Total deploy gas: 4,108,886 (~0.0000452 ETH). Deployer balance after deploy: 0.0094842 ETH.

## Instruments (all created live via PaperMarket.createInstrument, all 0xb200…)

| Ticker | Token | Tx |
|---|---|---|
| NVDA | 0xB200000000000000000000436e3D3E65cE90b481 | (createInstrument, block ~590120xx) |
| AAPL | 0xB20000000000000000000032c823E9d6efc2Bb14 | 0x389db4600c31eb1c27408b020d484ec387931de4ba319e07417056988be0dc5c |
| TSLA | 0xB200000000000000000000347f374f8d9F2e73A5 | 0x64e502a2c7f40032b1ef1acff5237e9bbb077a8d95f38f2d3bd37ebcd37b4e71 |
| META | 0xB2000000000000000000006f2D779CA4c5fcCfcE | 0x90448a931cc15e4bcb3d2dffacad4099298b6069412b8f81a7e047a9a9be905b |
| MSFT | 0xb2000000000000000000004682dAaB5f02219d7c | 0xb1f5132d6b7ed8643ca10402615f7fd483405a899ae5c580e5594c80fef19908 |
| GOOGL | 0xB20000000000000000000002E875C7cF362653b4 | 0x83d9cb9b6648a2d8e46f2e811aa287747816fa202ccd3152e7e049ef9ac2b703 |

NVDA sanity checks (verified on-chain): name "StockPilot Test NVDA", symbol "TEST-NVDA",
decimals 18, supplyCap 1e9 tokens, hasRole(MINT_ROLE, PaperMarket)=true,
hasRole(BURN_ROLE, PaperMarket)=true.
