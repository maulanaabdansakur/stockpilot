// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TestOracle} from "../src/TestOracle.sol";

contract TestOracleTest is Test {
    TestOracle oracle;
    address relayer = address(0xBEEF);
    address stranger = address(0xDEAD);

    int256 constant NVDA_PRICE = 16_077_000_000; // $160.77, 8 decimals
    uint256 constant T0 = 1_700_000_000;

    function setUp() public {
        oracle = new TestOracle();
        vm.warp(T0);
        oracle.setRelayer(relayer, true);
    }

    function test_PushAndRead() public {
        vm.prank(relayer);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 - 100);
        (int256 price, uint256 updatedAt) = oracle.getPrice("NVDA");
        assertEq(price, NVDA_PRICE);
        assertEq(updatedAt, T0 - 100);
    }

    function test_RevertUnknownTicker() public {
        vm.expectRevert(TestOracle.UnknownTicker.selector);
        oracle.getPrice("NVDA");
    }

    function test_RevertNonRelayerPush() public {
        vm.prank(stranger);
        vm.expectRevert(TestOracle.NotRelayer.selector);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0);
    }

    function test_RevertZeroOrNegativePrice() public {
        vm.prank(relayer);
        vm.expectRevert(TestOracle.InvalidPrice.selector);
        oracle.pushPrice("NVDA", 0, T0);
        vm.prank(relayer);
        vm.expectRevert(TestOracle.InvalidPrice.selector);
        oracle.pushPrice("NVDA", -1, T0);
    }

    function test_RevertStalePush_SameTimestamp() public {
        vm.prank(relayer);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 - 100);
        vm.prank(relayer);
        vm.expectRevert(TestOracle.StalePush.selector);
        oracle.pushPrice("NVDA", NVDA_PRICE + 1, T0 - 100); // equal timestamp
    }

    function test_RevertStalePush_OlderTimestamp() public {
        vm.prank(relayer);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 - 100);
        vm.prank(relayer);
        vm.expectRevert(TestOracle.StalePush.selector);
        oracle.pushPrice("NVDA", NVDA_PRICE + 1, T0 - 200); // older timestamp
    }

    function test_NewerPushOverwrites() public {
        vm.prank(relayer);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 - 100);
        vm.prank(relayer);
        oracle.pushPrice("NVDA", NVDA_PRICE + 1_000_000, T0 - 50);
        (int256 price, ) = oracle.getPrice("NVDA");
        assertEq(price, NVDA_PRICE + 1_000_000);
    }

    function test_RevertFarFutureTimestamp() public {
        vm.prank(relayer);
        vm.expectRevert(TestOracle.InvalidTimestamp.selector);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0 + 2 hours); // > 1h skew tolerance
    }

    function test_IsStale_NoPrice() public {
        assertTrue(oracle.isStale("NVDA", 1 days));
        assertTrue(oracle.isStaleDefault("NVDA"));
    }

    function test_IsStale_FreshThenAged() public {
        vm.prank(relayer);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0);
        assertFalse(oracle.isStale("NVDA", 1 days));
        assertFalse(oracle.isStaleDefault("NVDA"));
        vm.warp(T0 + 3 days + 1);
        assertTrue(oracle.isStale("NVDA", 3 days));
        assertTrue(oracle.isStaleDefault("NVDA"));
    }

    function test_SetMaxStaleAge_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(TestOracle.NotOwner.selector);
        oracle.setMaxStaleAge(1 hours);
        oracle.setMaxStaleAge(1 hours);
        assertEq(oracle.maxStaleAge(), 1 hours);
    }

    function test_RelayerCanBeRevoked() public {
        oracle.setRelayer(relayer, false);
        vm.prank(relayer);
        vm.expectRevert(TestOracle.NotRelayer.selector);
        oracle.pushPrice("NVDA", NVDA_PRICE, T0);
    }

    function testFuzz_PushPrice(int256 price, uint256 updatedAt) public {
        vm.assume(price > 0);
        vm.assume(updatedAt > 0 && updatedAt <= T0 + 1 hours);
        vm.prank(relayer);
        oracle.pushPrice("AAPL", price, updatedAt);
        (int256 got, uint256 gotAt) = oracle.getPrice("AAPL");
        assertEq(got, price);
        assertEq(gotAt, updatedAt);
    }
}
