// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {TestOracle} from "../src/TestOracle.sol";
import {StockPilotVault} from "../src/StockPilotVault.sol";
import {PaperMarket} from "../src/PaperMarket.sol";

/// @title StockPilot deploy script — Base Sepolia (chain 84532), testnet only.
/// @notice Deploys TestOracle -> StockPilotVault -> PaperMarket, then wires
///         the vault to the market. The deployer key is read from
///         ../agent-wallet.json (the test wallet); it is NEVER printed, logged,
///         or committed. Deployment REQUIRES a funded wallet — the script
///         aborts before broadcasting when the deployer holds 0 ETH.
///         See DEPLOY.md for the exact command and the post-deploy checklist.
contract Deploy is Script {
    /// @notice Base Sepolia native USDC, 6 decimals.
    address public constant SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() public {
        string memory walletJson = vm.readFile("../agent-wallet.json");
        uint256 deployerKey = vm.parseJsonUint(walletJson, ".private_key");
        address expectedDeployer = vm.parseJsonAddress(walletJson, ".address");
        address deployer = vm.addr(deployerKey);
        require(deployer == expectedDeployer, "key/address mismatch in agent-wallet.json");

        // Pre-flight: refuse to broadcast with an empty wallet.
        uint256 balance = deployer.balance;
        console.log("Deployer:", deployer);
        console.log("Deployer ETH balance (wei):", balance);
        require(balance > 0, "DEPLOY BLOCKED: deployer has 0 ETH - fund the wallet first (see FAUCETS.md)");

        vm.startBroadcast(deployerKey);

        TestOracle oracle = new TestOracle();
        console.log("TestOracle:", address(oracle));

        // Vault first with market unset; the market is wired in after deploy.
        StockPilotVault vault = new StockPilotVault(SEPOLIA_USDC, address(0));
        console.log("StockPilotVault:", address(vault));

        PaperMarket market = new PaperMarket(address(oracle), address(vault));
        console.log("PaperMarket:", address(market));

        vault.setMarket(address(market));

        vm.stopBroadcast();

        console.log("---");
        console.log("Deployment complete. Next (see DEPLOY.md):");
        console.log("1. Verify the three addresses on Basescan Sepolia.");
        console.log("2. Owner: createInstrument(\"NVDA\") etc. via PaperMarket.");
        console.log("3. Relayer: pushPrice() on TestOracle from the agent wallet.");
    }
}
