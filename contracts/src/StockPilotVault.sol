// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @notice Minimal interface the PaperMarket needs from the vault.
interface IStockPilotVault {
    function debitForTrade(uint256 portfolioId, uint256 usdcAmount) external;
    function creditFromTrade(uint256 portfolioId, uint256 usdcAmount) external;
    function portfolioExists(uint256 portfolioId) external view returns (bool);
    function portfolioUsdcBalance(uint256 portfolioId) external view returns (uint256);
}

/// @title StockPilotVault
/// @notice Custodian for test USDC (Base Sepolia native USDC, 6 decimals).
/// @dev Holds ALL test USDC. Portfolios are independent: each has an owner,
///      a USDC balance, and shares. Share price floats pro-rata, so realized
///      paper-trading P&L (settled back into the portfolio balance by the
///      PaperMarket) is reflected in the value of each share:
///        shares minted on deposit = amount * totalShares / balanceBefore
///        USDC out on withdraw   = sharesBurned * balance / totalShares
///      The vault is the SOLE custodian: the PaperMarket settles trades by
///      pure accounting (debitForTrade / creditFromTrade) and never holds
///      USDC itself. That keeps the paper market solvent by construction —
///      a profitable sell credits more USDC than the original buy debited,
///      which a USDC-holding market contract could not pay out of its own
///      balance. Users can only withdraw free (uninvested) USDC; positions
///      must be sold first via the PaperMarket.
contract StockPilotVault {
    IERC20 public immutable usdc;
    address public owner;
    address public market;

    struct Portfolio {
        address owner;
        uint256 shares;
        uint256 usdcBalance; // free (uninvested) test USDC, 6 decimals
        bool exists;
    }

    mapping(uint256 => Portfolio) private _portfolios;
    uint256 public nextPortfolioId = 1;

    event PortfolioCreated(uint256 indexed portfolioId, address indexed owner);
    event Deposited(uint256 indexed portfolioId, address indexed depositor, uint256 usdcAmount, uint256 sharesMinted);
    event Withdrawn(uint256 indexed portfolioId, address indexed owner, uint256 sharesBurned, uint256 usdcAmount);
    event TradeDebit(uint256 indexed portfolioId, uint256 usdcAmount, uint256 newBalance);
    event TradeCredit(uint256 indexed portfolioId, uint256 usdcAmount, uint256 newBalance);
    event MarketSet(address indexed market);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotMarket();
    error NotPortfolioOwner();
    error UnknownPortfolio();
    error ZeroAmount();
    error InsufficientBalance();
    error MarketAlreadySet();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMarket() {
        if (msg.sender != market) revert NotMarket();
        _;
    }

    modifier onlyPortfolioOwner(uint256 portfolioId) {
        if (!_portfolios[portfolioId].exists) revert UnknownPortfolio();
        if (_portfolios[portfolioId].owner != msg.sender) revert NotPortfolioOwner();
        _;
    }

    /// @param usdc_ Base Sepolia native USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
    /// @param market_ PaperMarket address; may be address(0) at deploy time and
    ///        set once via setMarket after the market is deployed.
    constructor(address usdc_, address market_) {
        require(usdc_ != address(0), "zero usdc");
        usdc = IERC20(usdc_);
        owner = msg.sender;
        market = market_;
    }

    /// @notice Set the PaperMarket once. Callable only by the owner, only while unset.
    function setMarket(address market_) external onlyOwner {
        if (market != address(0)) revert MarketAlreadySet();
        require(market_ != address(0), "zero market");
        market = market_;
        emit MarketSet(market_);
    }

    /// @notice Create a portfolio owned by the caller. Returns its id.
    function createPortfolio() external returns (uint256 portfolioId) {
        portfolioId = nextPortfolioId++;
        _portfolios[portfolioId] = Portfolio({
            owner: msg.sender,
            shares: 0,
            usdcBalance: 0,
            exists: true
        });
        emit PortfolioCreated(portfolioId, msg.sender);
    }

    /// @notice Deposit test USDC into a portfolio you own. Mints shares pro-rata.
    /// @dev Caller must approve the vault for `amount` USDC first.
    function deposit(uint256 portfolioId, uint256 amount) external onlyPortfolioOwner(portfolioId) returns (uint256 sharesMinted) {
        if (amount == 0) revert ZeroAmount();
        Portfolio storage p = _portfolios[portfolioId];
        if (p.shares == 0) {
            sharesMinted = amount; // first deposit: 1 share per USDC base unit
        } else {
            sharesMinted = (amount * p.shares) / p.usdcBalance;
            if (sharesMinted == 0) revert ZeroAmount(); // dust deposit, would mint 0 shares
        }
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transfer failed");
        p.usdcBalance += amount;
        p.shares += sharesMinted;
        emit Deposited(portfolioId, msg.sender, amount, sharesMinted);
    }

    /// @notice Withdraw test USDC by burning shares. Only free USDC can leave;
    ///         sell positions first if the portfolio is invested.
    function withdraw(uint256 portfolioId, uint256 sharesToBurn) external onlyPortfolioOwner(portfolioId) returns (uint256 usdcOut) {
        if (sharesToBurn == 0) revert ZeroAmount();
        Portfolio storage p = _portfolios[portfolioId];
        if (sharesToBurn > p.shares) revert InsufficientBalance();
        usdcOut = (sharesToBurn * p.usdcBalance) / p.shares;
        if (usdcOut == 0) revert ZeroAmount();
        if (usdcOut > p.usdcBalance) revert InsufficientBalance();
        p.shares -= sharesToBurn;
        p.usdcBalance -= usdcOut;
        require(usdc.transfer(msg.sender, usdcOut), "usdc transfer failed");
        emit Withdrawn(portfolioId, msg.sender, sharesToBurn, usdcOut);
    }

    /// @notice PaperMarket only: pay for a buy out of the portfolio's free USDC.
    ///         USDC stays in the vault; this is accounting, not a transfer.
    function debitForTrade(uint256 portfolioId, uint256 usdcAmount) external onlyMarket {
        Portfolio storage p = _portfolios[portfolioId];
        if (!p.exists) revert UnknownPortfolio();
        if (usdcAmount == 0) revert ZeroAmount();
        if (usdcAmount > p.usdcBalance) revert InsufficientBalance();
        p.usdcBalance -= usdcAmount;
        emit TradeDebit(portfolioId, usdcAmount, p.usdcBalance);
    }

    /// @notice PaperMarket only: credit sell proceeds into the portfolio's free USDC.
    ///         USDC stays in the vault; this is accounting, not a transfer.
    function creditFromTrade(uint256 portfolioId, uint256 usdcAmount) external onlyMarket {
        Portfolio storage p = _portfolios[portfolioId];
        if (!p.exists) revert UnknownPortfolio();
        if (usdcAmount == 0) revert ZeroAmount();
        p.usdcBalance += usdcAmount;
        emit TradeCredit(portfolioId, usdcAmount, p.usdcBalance);
    }

    // ---- views ----

    function portfolioExists(uint256 portfolioId) external view returns (bool) {
        return _portfolios[portfolioId].exists;
    }

    function portfolioOwner(uint256 portfolioId) external view returns (address) {
        if (!_portfolios[portfolioId].exists) revert UnknownPortfolio();
        return _portfolios[portfolioId].owner;
    }

    function portfolioUsdcBalance(uint256 portfolioId) external view returns (uint256) {
        if (!_portfolios[portfolioId].exists) revert UnknownPortfolio();
        return _portfolios[portfolioId].usdcBalance;
    }

    function portfolioShares(uint256 portfolioId) external view returns (uint256) {
        if (!_portfolios[portfolioId].exists) revert UnknownPortfolio();
        return _portfolios[portfolioId].shares;
    }

    /// @notice Current value of one share in USDC base units (6 decimals), scaled by 1e6.
    ///         Returns 1e6 (i.e. 1.0) for an empty portfolio.
    function sharePrice(uint256 portfolioId) external view returns (uint256) {
        Portfolio storage p = _portfolios[portfolioId];
        if (!p.exists) revert UnknownPortfolio();
        if (p.shares == 0) return 1e6;
        return (p.usdcBalance * 1e6) / p.shares;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
