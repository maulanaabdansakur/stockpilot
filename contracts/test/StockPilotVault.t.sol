// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StockPilotVault} from "../src/StockPilotVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract StockPilotVaultTest is Test {
    StockPilotVault vault;
    MockUSDC usdc;
    address user = address(0xA11CE);
    address other = address(0xB0B);
    address market = address(0x1234);

    function setUp() public {
        usdc = new MockUSDC();
        vault = new StockPilotVault(address(usdc), market);
        usdc.mint(user, 10_000_000_000); // $10,000
        usdc.mint(other, 10_000_000_000);
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(other);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_CreatePortfolio() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        assertEq(id, 1);
        assertEq(vault.portfolioOwner(id), user);
        assertTrue(vault.portfolioExists(id));
        vm.prank(user);
        assertEq(vault.createPortfolio(), 2);
    }

    function test_DepositFirst_MintsOneToOne() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        uint256 shares = vault.deposit(id, 1_000_000_000); // $1,000
        assertEq(shares, 1_000_000_000);
        assertEq(vault.portfolioUsdcBalance(id), 1_000_000_000);
        assertEq(vault.portfolioShares(id), 1_000_000_000);
        assertEq(vault.sharePrice(id), 1e6);
        assertEq(usdc.balanceOf(address(vault)), 1_000_000_000);
    }

    function test_WithdrawFull() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(id, 1_000_000_000);
        vm.prank(user);
        uint256 out = vault.withdraw(id, 1_000_000_000);
        assertEq(out, 1_000_000_000);
        assertEq(usdc.balanceOf(user), 10_000_000_000);
        assertEq(vault.portfolioShares(id), 0);
    }

    function test_WithdrawProRataAfterTradeCredit() public {
        // Simulate realized P&L: market credits $100 profit into the portfolio.
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(id, 1_000_000_000); // $1,000, 1e9 shares
        vm.prank(market);
        vault.creditFromTrade(id, 100_000_000); // +$100 realized
        // Share price is now $1,100 / 1e9 shares = 1.1 USDC per share.
        assertEq(vault.sharePrice(id), 1_100_000);
        // Withdrawing half the shares returns half the balance: $550.
        vm.prank(user);
        uint256 out = vault.withdraw(id, 500_000_000);
        assertEq(out, 550_000_000);
        assertEq(vault.portfolioShares(id), 500_000_000);
        assertEq(vault.portfolioUsdcBalance(id), 550_000_000);
    }

    function test_DepositAfterProfit_MintsFewerShares() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(id, 1_000_000_000);
        vm.prank(market);
        vault.creditFromTrade(id, 100_000_000); // +$100, balance $1,100, 1e9 shares
        vm.prank(user);
        uint256 shares = vault.deposit(id, 110_000_000); // deposit $110
        // $110 at $1.10/share = 100M shares
        assertEq(shares, 100_000_000);
    }

    function test_DebitForTrade_OnlyMarket() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(id, 1_000_000_000);
        vm.prank(other);
        vm.expectRevert(StockPilotVault.NotMarket.selector);
        vault.debitForTrade(id, 1);
        vm.prank(market);
        vault.debitForTrade(id, 400_000_000);
        assertEq(vault.portfolioUsdcBalance(id), 600_000_000);
        // USDC stays in the vault (accounting only).
        assertEq(usdc.balanceOf(address(vault)), 1_000_000_000);
    }

    function test_DebitForTrade_RevertOverBalance() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(id, 1_000_000_000);
        vm.prank(market);
        vm.expectRevert(StockPilotVault.InsufficientBalance.selector);
        vault.debitForTrade(id, 1_000_000_001);
    }

    function test_Withdraw_RevertOverShares() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        vault.deposit(id, 1_000_000_000);
        vm.prank(user);
        vm.expectRevert(StockPilotVault.InsufficientBalance.selector);
        vault.withdraw(id, 1_000_000_001);
    }

    function test_OnlyPortfolioOwnerCanDepositAndWithdraw() public {
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(other);
        vm.expectRevert(StockPilotVault.NotPortfolioOwner.selector);
        vault.deposit(id, 1);
        vm.prank(other);
        vm.expectRevert(StockPilotVault.NotPortfolioOwner.selector);
        vault.withdraw(id, 1);
    }

    function test_Deposit_RevertUnknownPortfolio() public {
        vm.prank(user);
        vm.expectRevert(StockPilotVault.UnknownPortfolio.selector);
        vault.deposit(999, 1);
    }

    function test_SetMarket_OnceOnly() public {
        StockPilotVault v2 = new StockPilotVault(address(usdc), address(0));
        v2.setMarket(market);
        assertEq(v2.market(), market);
        vm.expectRevert(StockPilotVault.MarketAlreadySet.selector);
        v2.setMarket(address(0x1234));
    }

    function test_SetMarket_OnlyOwner() public {
        StockPilotVault v2 = new StockPilotVault(address(usdc), address(0));
        vm.prank(other);
        vm.expectRevert(StockPilotVault.NotOwner.selector);
        v2.setMarket(market);
    }

    function testFuzz_DepositWithdrawRoundTrip(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 10_000_000_000);
        vm.prank(user);
        uint256 id = vault.createPortfolio();
        vm.prank(user);
        uint256 shares = vault.deposit(id, amount);
        vm.prank(user);
        uint256 out = vault.withdraw(id, shares);
        assertEq(out, amount);
    }
}
