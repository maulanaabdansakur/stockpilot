// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestOracle} from "./TestOracle.sol";
import {IStockPilotVault} from "./StockPilotVault.sol";
import {IB20Factory} from "base-std/interfaces/IB20Factory.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {B20FactoryLib} from "base-std/lib/B20FactoryLib.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";

/// @title PaperMarket
/// @notice Executes paper buys/sells of synthetic TEST B20 ASSET tokens at the
///         TestOracle price. No real shares, no real money: every instrument is
///         a synthetic token labelled TEST-<TICKER> (e.g. TEST-NVDA), created
///         through the real B20 factory precompile on Base Sepolia.
/// @dev B20 calls use the canonical base-std encoders (B20FactoryLib) — the
///      factory decodes `params` as a single ABI-encoded struct (with the
///      leading offset word), NOT as a flat tuple: hand-encoding
///      `abi.encode(uint8,string,string,address,uint8)` produces the wrong
///      bytes and the precompile reverts with an ABI-deserialization error
///      (proven by local base-forge bisect, 2026-11-15). Do NOT hand-roll
///      the factory calldata.
///      Token calls use base-std's IB20: `mint(to, amount)` needs MINT_ROLE,
///      `burn(amount)` burns the CALLER's own balance and needs BURN_ROLE —
///      both are granted to this contract in the createB20 initCalls.
/// @dev Trades execute AT the oracle price. The agent passes its expected
///      price (maxPrice on buy / minPrice on sell); the contract requires the
///      expected price to sit within `maxDeviationBps` of the oracle price, so
///      a stale or wrong agent price can never execute. It also requires the
///      oracle price itself to be fresh (not stale per `maxStaleAge`).
///      Only the agent (owner / operators) may execute trades; users only
///      deposit/withdraw test USDC via the vault. Settlement is accounting in
///      the vault — the market never holds USDC (see StockPilotVault docs).
///      Token math (oracle price has 8 decimals, USDC 6, token `decimals` d):
///        tokens = usdcAmount * 10^(d+2) / price
///        usdc   = tokenAmount * price / 10^(d+2)
contract PaperMarket {
    /// @notice Real B20 factory precompile (Base Mainnet + Sepolia).
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    /// @notice Supply cap for each synthetic TEST instrument (1e9 whole tokens).
    uint256 public constant INSTRUMENT_SUPPLY_CAP = 1_000_000_000;

    TestOracle public immutable oracle;
    IStockPilotVault public immutable vault;
    IB20Factory public immutable b20Factory;

    address public owner;
    /// @notice Agent operators allowed to execute trades (owner is one by default).
    mapping(address => bool) public isOperator;

    /// @notice Max deviation between the agent's expected price and the oracle
    ///         price, in basis points. Default 100 = 1%.
    uint256 public maxDeviationBps = 100;
    /// @notice Max age of an oracle price a trade will accept. Default 3 days
    ///         (covers the weekend hold of 24/5 equity feeds).
    uint256 public maxStaleAge = 3 days;

    /// @notice Synthetic TEST instrument per equity ticker ("NVDA" -> token).
    mapping(string => address) public tokenByTicker;
    mapping(address => string) public tickerByToken;
    mapping(string => uint8) public tokenDecimals;
    string[] public tickers;

    struct Position {
        uint256 amount; // TEST token base units held by this portfolio
        uint256 avgCost; // volume-weighted avg buy price, 8 decimals
        uint256 totalCost; // USDC base units (6 dec) paid for the open amount
        int256 realizedPnl; // USDC base units (6 dec), signed
    }

    mapping(uint256 => mapping(string => Position)) private _positions;

    struct Trade {
        uint256 portfolioId;
        string ticker;
        bool isBuy;
        uint256 tokenAmount;
        uint256 usdcAmount;
        int256 price; // execution (oracle) price, 8 decimals
        uint256 timestamp;
    }

    Trade[] public trades;

    event InstrumentCreated(string indexed ticker, address indexed token);
    event InstrumentRegistered(string indexed ticker, address indexed token);
    event TradeExecuted(
        uint256 indexed portfolioId,
        string indexed ticker,
        bool isBuy,
        uint256 tokenAmount,
        uint256 usdcAmount,
        int256 price,
        string rationale
    );
    event OperatorSet(address indexed operator, bool allowed);
    event MaxDeviationBpsSet(uint256 maxDeviationBps);
    event MaxStaleAgeSet(uint256 maxStaleAge);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotOperator();
    error UnknownTicker();
    error UnknownPortfolio();
    error InstrumentExists();
    error PriceStale();
    error PriceMismatch();
    error InvalidPrice();
    error ZeroAmount();
    error InsufficientPosition();
    error InsufficientBalance();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    constructor(address oracle_, address vault_) {
        require(oracle_ != address(0), "zero oracle");
        require(vault_ != address(0), "zero vault");
        oracle = TestOracle(oracle_);
        vault = IStockPilotVault(vault_);
        b20Factory = IB20Factory(B20_FACTORY);
        owner = msg.sender;
        isOperator[msg.sender] = true;
        emit OperatorSet(msg.sender, true);
    }

    // ---- instruments ----

    /// @notice Create a synthetic TEST B20 ASSET token for an equity ticker via
    ///         the real factory precompile. Symbol is always TEST-<TICKER>;
    ///         never a real ticker, never a real Coinbase token name.
    /// @dev The market contract is the token's initial admin and holds
    ///      MINT_ROLE + BURN_ROLE (granted in initCalls), so only this
    ///      contract can mint/burn. Params/initCalls are encoded with the
    ///      canonical base-std B20FactoryLib encoders (see contract docs).
    function createInstrument(string calldata ticker) external onlyOwner returns (address token) {
        if (tokenByTicker[ticker] != address(0)) revert InstrumentExists();
        string memory symbol = string.concat("TEST-", ticker);
        string memory name = string.concat("StockPilot Test ", ticker);
        bytes32 salt = keccak256(abi.encodePacked(ticker, block.chainid, address(this)));
        bytes memory params =
            B20FactoryLib.encodeAssetCreateParams(name, symbol, address(this), 18);
        bytes[] memory initCalls = new bytes[](3);
        initCalls[0] = B20FactoryLib.encodeGrantRole(B20Constants.MINT_ROLE, address(this));
        initCalls[1] = B20FactoryLib.encodeGrantRole(B20Constants.BURN_ROLE, address(this));
        initCalls[2] = B20FactoryLib.encodeUpdateSupplyCap(INSTRUMENT_SUPPLY_CAP * 10 ** 18);
        token = b20Factory.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);
        _register(ticker, token);
        emit InstrumentCreated(ticker, token);
    }

    /// @notice Fallback: wire in a TEST instrument created out-of-band
    ///         (e.g. via the BlueAgent launchpad), without calling createB20.
    ///         The token MUST already be a TEST- synthetic; the caller is
    ///         responsible for that — this is an owner-only escape hatch.
    function registerInstrument(string calldata ticker, address token) external onlyOwner {
        if (tokenByTicker[ticker] != address(0)) revert InstrumentExists();
        require(token != address(0), "zero token");
        _register(ticker, token);
        emit InstrumentRegistered(ticker, token);
    }

    function _register(string calldata ticker, address token) internal {
        uint8 dec = IB20(token).decimals();
        require(dec >= 6 && dec <= 18, "bad decimals");
        tokenByTicker[ticker] = token;
        tickerByToken[token] = ticker;
        tokenDecimals[ticker] = dec;
        tickers.push(ticker);
    }

    // ---- trading (agent only) ----

    /// @notice Paper-buy TEST tokens for a portfolio at the oracle price.
    /// @param maxPrice The agent's expected price (8 decimals). Must sit within
    ///        `maxDeviationBps` of the oracle price AND be >= the oracle price
    ///        (the agent never pays more than its cap). Execution is at the
    ///        oracle price, not at maxPrice.
    /// @param rationale Short human/LLM rationale, recorded in the event.
    function buy(
        uint256 portfolioId,
        string calldata ticker,
        uint256 usdcAmount,
        int256 maxPrice,
        string calldata rationale
    ) external onlyOperator returns (uint256 tokenAmount) {
        address token = tokenByTicker[ticker];
        if (token == address(0)) revert UnknownTicker();
        if (usdcAmount == 0) revert ZeroAmount();
        if (!vault.portfolioExists(portfolioId)) revert UnknownPortfolio();
        int256 price = _freshPrice(ticker);
        _checkDeviation(maxPrice, price);
        if (price > maxPrice) revert PriceMismatch(); // never pay above the agent's cap

        uint8 dec = tokenDecimals[ticker];
        tokenAmount = (usdcAmount * 10 ** (dec + 2)) / uint256(price);
        if (tokenAmount == 0) revert ZeroAmount();

        vault.debitForTrade(portfolioId, usdcAmount);
        IB20(token).mint(address(this), tokenAmount);

        Position storage pos = _positions[portfolioId][ticker];
        uint256 newTotalCost = pos.totalCost + usdcAmount;
        uint256 newAmount = pos.amount + tokenAmount;
        // volume-weighted average cost, 8 decimals
        pos.avgCost = newTotalCost == 0 ? uint256(price) : (newTotalCost * 10 ** (dec + 2)) / newAmount;
        pos.amount = newAmount;
        pos.totalCost = newTotalCost;

        trades.push(
            Trade({
                portfolioId: portfolioId,
                ticker: ticker,
                isBuy: true,
                tokenAmount: tokenAmount,
                usdcAmount: usdcAmount,
                price: price,
                timestamp: block.timestamp
            })
        );
        emit TradeExecuted(portfolioId, ticker, true, tokenAmount, usdcAmount, price, rationale);
    }

    /// @notice Paper-sell TEST tokens for a portfolio at the oracle price.
    /// @param minPrice The agent's expected price (8 decimals). Must sit within
    ///        `maxDeviationBps` of the oracle price AND be <= the oracle price
    ///        (the agent never accepts less than its floor). Execution is at the
    ///        oracle price, not at minPrice.
    function sell(
        uint256 portfolioId,
        string calldata ticker,
        uint256 tokenAmount,
        int256 minPrice,
        string calldata rationale
    ) external onlyOperator returns (uint256 usdcOut) {
        address token = tokenByTicker[ticker];
        if (token == address(0)) revert UnknownTicker();
        if (tokenAmount == 0) revert ZeroAmount();
        Position storage pos = _positions[portfolioId][ticker];
        if (tokenAmount > pos.amount) revert InsufficientPosition();
        int256 price = _freshPrice(ticker);
        _checkDeviation(minPrice, price);
        if (price < minPrice) revert PriceMismatch(); // never accept below the agent's floor

        uint8 dec = tokenDecimals[ticker];
        usdcOut = (tokenAmount * uint256(price)) / 10 ** (dec + 2);
        if (usdcOut == 0) revert ZeroAmount();

        // Realized P&L vs the cost basis of the sold slice.
        uint256 costBasis = (pos.totalCost * tokenAmount) / pos.amount;
        pos.realizedPnl += int256(usdcOut) - int256(costBasis);
        pos.amount -= tokenAmount;
        pos.totalCost -= costBasis;
        if (pos.amount == 0) pos.avgCost = 0;

        IB20(token).burn(tokenAmount);
        vault.creditFromTrade(portfolioId, usdcOut);

        trades.push(
            Trade({
                portfolioId: portfolioId,
                ticker: ticker,
                isBuy: false,
                tokenAmount: tokenAmount,
                usdcAmount: usdcOut,
                price: price,
                timestamp: block.timestamp
            })
        );
        emit TradeExecuted(portfolioId, ticker, false, tokenAmount, usdcOut, price, rationale);
    }

    // ---- price guards ----

    /// @notice Returns the oracle price, reverting when unknown or stale.
    function _freshPrice(string calldata ticker) internal view returns (int256 price) {
        (price, ) = oracle.getPrice(ticker); // reverts UnknownTicker when never pushed
        if (price <= 0) revert InvalidPrice();
        if (oracle.isStale(ticker, maxStaleAge)) revert PriceStale();
    }

    /// @notice Requires |expected - oracle| <= oracle * maxDeviationBps / 10000.
    function _checkDeviation(int256 expected, int256 oraclePrice) internal view {
        if (expected <= 0) revert InvalidPrice();
        uint256 diff = expected > oraclePrice
            ? uint256(expected - oraclePrice)
            : uint256(oraclePrice - expected);
        if (diff * 10_000 > uint256(oraclePrice) * maxDeviationBps) revert PriceMismatch();
    }

    // ---- views ----

    function getPosition(uint256 portfolioId, string calldata ticker)
        external
        view
        returns (Position memory)
    {
        return _positions[portfolioId][ticker];
    }

    /// @notice Unrealized P&L of an open position at the last oracle price
    ///         (USDC base units, signed). Returns 0 when there is no position
    ///         or no price yet; callers needing a freshness guarantee should
    ///         check oracle.isStale() themselves.
    function unrealizedPnl(uint256 portfolioId, string calldata ticker) external view returns (int256) {
        Position storage pos = _positions[portfolioId][ticker];
        if (pos.amount == 0) return 0;
        address token = tokenByTicker[ticker];
        if (token == address(0)) return 0;
        uint8 dec = tokenDecimals[ticker];
        (int256 price, ) = _tryPrice(ticker);
        if (price <= 0) return 0;
        uint256 markValue = (pos.amount * uint256(price)) / 10 ** (dec + 2);
        return int256(markValue) - int256(pos.totalCost);
    }

    function _tryPrice(string calldata ticker) internal view returns (int256 price, uint256 updatedAt) {
        try oracle.getPrice(ticker) returns (int256 p, uint256 u) {
            return (p, u);
        } catch {
            return (0, 0);
        }
    }

    function tradeCount() external view returns (uint256) {
        return trades.length;
    }

    function getTrade(uint256 index) external view returns (Trade memory) {
        return trades[index];
    }

    function tickerCount() external view returns (uint256) {
        return tickers.length;
    }

    // ---- admin ----

    function setOperator(address operator, bool allowed) external onlyOwner {
        isOperator[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setMaxDeviationBps(uint256 newMaxDeviationBps) external onlyOwner {
        require(newMaxDeviationBps <= 5000, "band too wide"); // never above 50%
        maxDeviationBps = newMaxDeviationBps;
        emit MaxDeviationBpsSet(newMaxDeviationBps);
    }

    function setMaxStaleAge(uint256 newMaxStaleAge) external onlyOwner {
        maxStaleAge = newMaxStaleAge;
        emit MaxStaleAgeSet(newMaxStaleAge);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
