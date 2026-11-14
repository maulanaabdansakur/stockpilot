// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TestOracle} from "../src/TestOracle.sol";
import {StockPilotVault} from "../src/StockPilotVault.sol";
import {PaperMarket} from "../src/PaperMarket.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockB20Factory, MockB20Token} from "./mocks/MockB20.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";

/// @dev Standard Foundry cannot simulate the B20 precompiles, so the mock
///      factory is etched onto the real factory precompile address
///      (0xB20f...) for these tests. B20 behaviour itself is verified on
///      Sepolia after funding (see DEPLOY.md).
contract PaperMarketTest is Test {
    TestOracle oracle;
    StockPilotVault vault;
    PaperMarket market;
    MockUSDC usdc;

    address agent = address(0xA6E17);
    address user = address(0xA11CE);
    address stranger = address(0xDEAD);

    int256 constant NVDA_PRICE = 16_077_000_000; // $160.77, 8 decimals
    uint256 constant T0 = 1_700_000_000;
    uint256 portfolioId;

    function setUp() public {
        vm.warp(T0);
        // Under stock forge the B20 precompile does not exist, so etch the
        // mock factory onto the real factory address. Under base-forge the
        // precompile IS live (etch is rejected there), so use it directly —
        // the suite then runs against the real factory, which is strictly
        // better. The mock token ABI matches the real B20 surface the tests
        // touch (name/symbol/decimals/supplyCap/hasRole/balanceOf).
        (bool live, bytes memory ret) = address(0xB20f000000000000000000000000000000000000).staticcall(
            abi.encodeWithSignature(
                "getB20Address(uint8,address,bytes32)", uint8(0), address(this), bytes32(uint256(0))
            )
        );
        if (!live || ret.length != 32) {
            MockB20Factory mockFactory = new MockB20Factory();
            vm.etch(0xB20f000000000000000000000000000000000000, address(mockFactory).code);
        }

        usdc = new MockUSDC();
        oracle = new TestOracle();
        vault = new StockPilotVault(address(usdc), address(0));
        market = new PaperMarket(address(oracle), address(vault));
        vault.setMarket(address(market));

        // Agent is the operator; owner is this test contract.
        market.setOperator(agent, true);

        // Fund the user and open + fund a portfolio with $10,000 test USDC.
        usdc.mint(user, 10_000_000_000);
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(user);
        portfolioId = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(portfolioId, 10_000_000_000);

        // Relayer (this test contract) pushes a fresh NVDA price.
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 - 60);
    }

    // ---- instruments ----

    function test_CreateInstrument() public {
        address token = market.createInstrument("NVDA");
        assertTrue(token != address(0));
        assertEq(market.tokenByTicker("NVDA"), token);
        assertEq(market.tokenDecimals("NVDA"), 18);
        assertEq(MockB20Token(token).symbol(), "TEST-NVDA");
        assertEq(MockB20Token(token).name(), "StockPilot Test NVDA");
        assertEq(MockB20Token(token).supplyCap(), 1_000_000_000 * 1e18);
        assertTrue(MockB20Token(token).hasRole(B20Constants.MINT_ROLE, address(market)));
        assertTrue(MockB20Token(token).hasRole(B20Constants.BURN_ROLE, address(market)));
    }

    function test_CreateInstrument_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(PaperMarket.NotOwner.selector);
        market.createInstrument("NVDA");
    }

    function test_CreateInstrument_RevertDuplicate() public {
        market.createInstrument("NVDA");
        vm.expectRevert(PaperMarket.InstrumentExists.selector);
        market.createInstrument("NVDA");
    }

    function test_RegisterInstrument_Fallback() public {
        MockB20Token token = new MockB20Token("StockPilot Test AAPL", "TEST-AAPL", 18, type(uint256).max);
        market.registerInstrument("AAPL", address(token));
        assertEq(market.tokenByTicker("AAPL"), address(token));
    }

    // ---- buys ----

    function test_Buy_ExactMath() public {
        address token = market.createInstrument("NVDA");
        // $1,000 at $160.77 buys 1000/160.77 = 6.22007... tokens (18 dec).
        uint256 bought = _buy(1_000_000_000, NVDA_PRICE);
        uint256 expected = (1_000_000_000 * 1e20) / uint256(NVDA_PRICE);
        assertEq(bought, expected);
        assertEq(MockB20Token(token).balanceOf(address(market)), bought);
        assertEq(vault.portfolioUsdcBalance(portfolioId), 9_000_000_000);
        PaperMarket.Position memory pos = market.getPosition(portfolioId, "NVDA");
        assertEq(pos.amount, bought);
        assertEq(pos.avgCost, uint256(NVDA_PRICE));
        assertEq(pos.totalCost, 1_000_000_000);
        assertEq(market.tradeCount(), 1);
    }

    function test_Buy_TwoBuys_WeightedAvgCost() public {
        market.createInstrument("NVDA");
        _buy(1_000_000_000, NVDA_PRICE); // $1,000 @ $160.77
        // Price rises to $200; buy $1,000 more.
        oracle.pushPrice("NVDA", 20_000_000_000, T0 - 30);
        _buy(1_000_000_000, 20_000_000_000);
        PaperMarket.Position memory pos = market.getPosition(portfolioId, "NVDA");
        // avg cost = $2,000 / total tokens, in 8 decimals.
        uint256 expectedAvg = (2_000_000_000 * 1e20) / pos.amount;
        assertEq(pos.avgCost, expectedAvg);
        assertTrue(pos.avgCost > uint256(NVDA_PRICE) && pos.avgCost < 20_000_000_000);
    }

    function test_Buy_RevertNonOperator() public {
        market.createInstrument("NVDA");
        vm.prank(stranger);
        vm.expectRevert(PaperMarket.NotOperator.selector);
        market.buy(portfolioId, "NVDA", 1_000_000_000, NVDA_PRICE, "x");
    }

    function test_Buy_RevertUnknownTicker() public {
        vm.prank(agent);
        vm.expectRevert(PaperMarket.UnknownTicker.selector);
        market.buy(portfolioId, "NOPE", 1_000_000_000, NVDA_PRICE, "x");
    }

    function test_Buy_RevertNoOraclePrice() public {
        market.createInstrument("AAPL");
        vm.prank(agent);
        vm.expectRevert(TestOracle.UnknownTicker.selector);
        market.buy(portfolioId, "AAPL", 1_000_000_000, NVDA_PRICE, "x");
    }

    function test_Buy_RevertStaleOraclePrice() public {
        market.createInstrument("NVDA");
        vm.warp(T0 + 3 days + 1); // oracle price now older than maxStaleAge
        vm.prank(agent);
        vm.expectRevert(PaperMarket.PriceStale.selector);
        market.buy(portfolioId, "NVDA", 1_000_000_000, NVDA_PRICE, "x");
    }

    function test_Buy_RevertDeviationBeyondBand() public {
        market.createInstrument("NVDA");
        // Agent's expected price 2% above oracle (> 1% band).
        int256 tooHigh = (NVDA_PRICE * 10_200) / 10_000;
        vm.prank(agent);
        vm.expectRevert(PaperMarket.PriceMismatch.selector);
        market.buy(portfolioId, "NVDA", 1_000_000_000, tooHigh, "x");
        // Agent's expected price 2% below oracle.
        int256 tooLow = (NVDA_PRICE * 9_800) / 10_000;
        vm.prank(agent);
        vm.expectRevert(PaperMarket.PriceMismatch.selector);
        market.buy(portfolioId, "NVDA", 1_000_000_000, tooLow, "x");
    }

    function test_Buy_RevertAboveAgentCap() public {
        // Edge: expected price within band but BELOW the oracle price on a buy
        // (agent would pay more than its cap) — 0.5% below is inside the 1%
        // band but still below oracle, so the cap check must catch it.
        market.createInstrument("NVDA");
        int256 belowOracle = (NVDA_PRICE * 9_950) / 10_000;
        vm.prank(agent);
        vm.expectRevert(PaperMarket.PriceMismatch.selector);
        market.buy(portfolioId, "NVDA", 1_000_000_000, belowOracle, "x");
    }

    function test_Buy_WithinBandSucceeds() public {
        market.createInstrument("NVDA");
        int256 slightlyHigh = (NVDA_PRICE * 10_050) / 10_000; // +0.5%, inside band
        vm.prank(agent);
        uint256 bought = market.buy(portfolioId, "NVDA", 1_000_000_000, slightlyHigh, "momentum");
        assertTrue(bought > 0);
    }

    function test_Buy_RevertInsufficientVaultBalance() public {
        market.createInstrument("NVDA");
        vm.prank(agent);
        vm.expectRevert(StockPilotVault.InsufficientBalance.selector);
        market.buy(portfolioId, "NVDA", 10_000_000_001, NVDA_PRICE, "x");
    }

    // ---- sells + P&L ----

    function test_Sell_Profit_RealizedPnl() public {
        market.createInstrument("NVDA");
        uint256 bought = _buy(1_000_000_000, NVDA_PRICE); // $1,000 @ $160.77
        // Price rises to $200; sell half.
        oracle.pushPrice("NVDA", 20_000_000_000, T0 - 30);
        uint256 half = bought / 2;
        vm.prank(agent);
        uint256 out = market.sell(portfolioId, "NVDA", half, 20_000_000_000, "take profit");
        uint256 expectedOut = (half * 20_000_000_000) / 1e20;
        assertEq(out, expectedOut);
        // Realized P&L = proceeds - cost basis of the sold half.
        uint256 costBasis = (1_000_000_000 * half) / bought;
        PaperMarket.Position memory pos = market.getPosition(portfolioId, "NVDA");
        assertEq(pos.amount, bought - half);
        assertEq(pos.realizedPnl, int256(expectedOut) - int256(costBasis));
        // Vault balance: $9,000 free + $1,000 proceeds = $10,000.
        assertEq(vault.portfolioUsdcBalance(portfolioId), 9_000_000_000 + expectedOut);
        assertEq(market.tradeCount(), 2);
    }

    function test_Sell_Loss_RealizedPnl() public {
        market.createInstrument("NVDA");
        uint256 bought = _buy(1_000_000_000, NVDA_PRICE);
        oracle.pushPrice("NVDA", 10_000_000_000, T0 - 30); // falls to $100
        vm.prank(agent);
        market.sell(portfolioId, "NVDA", bought, 10_000_000_000, "cut loss");
        PaperMarket.Position memory pos = market.getPosition(portfolioId, "NVDA");
        assertEq(pos.amount, 0);
        assertEq(pos.avgCost, 0);
        // Sold everything for ~$622.07 vs $1,000 cost -> negative P&L.
        assertTrue(pos.realizedPnl < 0);
        assertEq(pos.realizedPnl, int256((bought * 10_000_000_000) / 1e20) - 1_000_000_000);
    }

    function test_Sell_RevertOverPosition() public {
        market.createInstrument("NVDA");
        uint256 bought = _buy(1_000_000_000, NVDA_PRICE);
        vm.prank(agent);
        vm.expectRevert(PaperMarket.InsufficientPosition.selector);
        market.sell(portfolioId, "NVDA", bought + 1, NVDA_PRICE, "x");
    }

    function test_Sell_RevertBelowAgentFloor() public {
        market.createInstrument("NVDA");
        uint256 bought = _buy(1_000_000_000, NVDA_PRICE);
        // Agent floor 0.5% above oracle: inside the band, but oracle is below
        // the floor, so the floor check must catch it.
        int256 aboveOracle = (NVDA_PRICE * 10_050) / 10_000;
        vm.prank(agent);
        vm.expectRevert(PaperMarket.PriceMismatch.selector);
        market.sell(portfolioId, "NVDA", bought, aboveOracle, "x");
    }

    function test_UnrealizedPnl() public {
        market.createInstrument("NVDA");
        _buy(1_000_000_000, NVDA_PRICE);
        // At cost: mark value rounds down by at most 1 base unit, so allow -1.
        int256 atCost = market.unrealizedPnl(portfolioId, "NVDA");
        assertGe(atCost, -1);
        assertLe(atCost, 0);
        oracle.pushPrice("NVDA", 20_000_000_000, T0 - 30);
        int256 pnl = market.unrealizedPnl(portfolioId, "NVDA");
        assertTrue(pnl > 0);
        // Mark value $2,000-ish (6.22 tokens @ $200 = $1,244.01) minus $1,000 cost.
        uint256 bought = (1_000_000_000 * 1e20) / uint256(NVDA_PRICE);
        int256 expected = int256((bought * 20_000_000_000) / 1e20) - 1_000_000_000;
        assertEq(pnl, expected);
    }

    function test_TradeHistory_Recorded() public {
        market.createInstrument("NVDA");
        _buy(1_000_000_000, NVDA_PRICE);
        PaperMarket.Trade memory t = market.getTrade(0);
        assertEq(t.portfolioId, portfolioId);
        assertEq(t.ticker, "NVDA");
        assertTrue(t.isBuy);
        assertEq(t.usdcAmount, 1_000_000_000);
        assertEq(t.price, NVDA_PRICE);
    }

    function test_Admin_BandAndStaleness() public {
        market.setMaxDeviationBps(250);
        assertEq(market.maxDeviationBps(), 250);
        market.setMaxStaleAge(1 days);
        assertEq(market.maxStaleAge(), 1 days);
        vm.prank(stranger);
        vm.expectRevert(PaperMarket.NotOwner.selector);
        market.setMaxDeviationBps(250);
        vm.expectRevert("band too wide");
        market.setMaxDeviationBps(5001);
    }

    // ---- helpers ----

    function _buy(uint256 usdcAmount, int256 expectedPrice) internal returns (uint256) {
        vm.prank(agent);
        return market.buy(portfolioId, "NVDA", usdcAmount, expectedPrice, "test rationale");
    }
}
