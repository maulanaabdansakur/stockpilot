// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TestOracle} from "../src/TestOracle.sol";
import {StockPilotVault} from "../src/StockPilotVault.sol";
import {PaperMarket} from "../src/PaperMarket.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice B20 integration test — runs ONLY under base-forge (Base's Foundry
///         build), which simulates the B20 factory precompile locally.
///         Under stock `forge test` the whole contract SKIPS itself (the
///         setUp guard below detects the absent precompile), so the unit
///         suite stays green on either runner.
///         Run: `base-forge test --match-contract B20IntegrationTest`
///         This test exercises the real createB20 calldata path end to end:
///         factory -> TEST-NVDA token -> mint on buy -> burn on sell.
contract B20IntegrationTest is Test {
    address constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    TestOracle oracle;
    StockPilotVault vault;
    PaperMarket market;
    MockUSDC usdc;

    address agent = address(0xA6E17);
    address user = address(0xA11CE);

    int256 constant NVDA_PRICE = 16_077_000_000; // $160.77, 8 decimals
    uint256 constant T0 = 1_700_000_000;
    uint256 portfolioId;

    function setUp() public {
        // Skip under stock forge: the real B20 precompile is not simulated
        // there (the factory address returns no data), so these tests are
        // base-forge-only by construction.
        (bool ok, bytes memory ret) = B20_FACTORY.staticcall(
            abi.encodeWithSignature(
                "getB20Address(uint8,address,bytes32)", uint8(0), address(this), bytes32(uint256(0))
            )
        );
        if (!ok || ret.length != 32) vm.skip(true);

        vm.warp(T0);
        usdc = new MockUSDC();
        oracle = new TestOracle();
        vault = new StockPilotVault(address(usdc), address(0));
        market = new PaperMarket(address(oracle), address(vault));
        vault.setMarket(address(market));
        market.setOperator(agent, true);

        usdc.mint(user, 10_000_000_000);
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(user);
        portfolioId = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(portfolioId, 10_000_000_000);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 - 60);
    }

    function test_RealB20_CreateInstrument() public {
        address token = market.createInstrument("NVDA");
        // Real B20 token addresses live in the 0xb200... namespace.
        assertTrue(token != address(0));
        assertEq(uint160(token) >> 144, 0xb200); // top 2 bytes 0xb2 0x00
        assertEq(IB20(token).symbol(), "TEST-NVDA");
        assertEq(IB20(token).name(), "StockPilot Test NVDA");
        assertEq(IB20(token).decimals(), 18);
        assertTrue(IB20(token).hasRole(B20Constants.MINT_ROLE, address(market)));
        assertTrue(IB20(token).hasRole(B20Constants.BURN_ROLE, address(market)));
        assertEq(IB20(token).supplyCap(), 1_000_000_000 * 1e18);
    }

    function test_RealB20_BuyAndSellRoundTrip() public {
        address token = market.createInstrument("NVDA");
        vm.prank(agent);
        uint256 bought = market.buy(portfolioId, "NVDA", 1_000_000_000, NVDA_PRICE, "b20 e2e");
        assertTrue(bought > 0);
        assertEq(IB20(token).balanceOf(address(market)), bought);

        oracle.pushPrice("NVDA", 20_000_000_000, T0 - 30);
        vm.prank(agent);
        uint256 out = market.sell(portfolioId, "NVDA", bought, 20_000_000_000, "b20 e2e sell");
        assertTrue(out > 1_000_000_000); // profit: sold higher than bought
        assertEq(IB20(token).balanceOf(address(market)), 0);
        assertEq(IB20(token).totalSupply(), 0);
    }
}
