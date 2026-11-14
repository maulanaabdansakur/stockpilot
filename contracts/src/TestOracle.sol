// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TestOracle
/// @notice TEST_ONLY price oracle for StockPilot on Base Sepolia.
/// @dev There is no Chainlink Coinbase equity feed on Base Sepolia, so the
///      offchain relayer mirrors the Base Mainnet Chainlink feed values here.
///      Prices are 8-decimal, like the Chainlink feeds (e.g. $160.77 -> 16077000000).
///      NEVER use this contract (or its values) on mainnet or for real money:
///      any relayer can push any price, and the values are only as honest as
///      the relayer. The PaperMarket enforces staleness + deviation bands
///      against these values; it does NOT treat them as trusted mainnet data.
contract TestOracle {
    address public owner;

    /// @notice Default max age of a price before it counts as stale.
    /// @dev Chainlink equity feeds are 24/5 and hold last close over weekends,
    ///      so 3 days covers a normal weekend hold (Fri close -> Mon open).
    uint256 public constant DEFAULT_MAX_STALE_AGE = 3 days;
    uint256 public maxStaleAge = DEFAULT_MAX_STALE_AGE;

    /// @notice Relayers allowed to push prices (the agent's offchain relayer).
    mapping(address => bool) public isRelayer;

    struct Price {
        int256 price; // 8 decimals, must be > 0
        uint256 updatedAt; // unix timestamp of the mirrored feed update
        bool exists;
    }

    mapping(string => Price) private _prices;

    /// @dev TEST_ONLY: this event records a mirrored test price, not a real feed update.
    event TestPricePushed(
        string indexed ticker,
        int256 price,
        uint256 updatedAt,
        address indexed relayer
    );
    event RelayerSet(address indexed relayer, bool allowed);
    event MaxStaleAgeSet(uint256 maxStaleAge);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotRelayer();
    error InvalidPrice();
    error InvalidTimestamp();
    error StalePush();
    error UnknownTicker();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert NotRelayer();
        _;
    }

    constructor() {
        owner = msg.sender;
        isRelayer[msg.sender] = true;
        emit RelayerSet(msg.sender, true);
    }

    /// @notice Push a mirrored mainnet feed value for a ticker.
    /// @dev Rejects pushes that are not newer than the last stored update, so a
    ///      delayed/duplicate relayer run can never rewind the price.
    ///      Allows up to 1h of future clock skew between relayer and chain.
    function pushPrice(string calldata ticker, int256 price, uint256 updatedAt) external onlyRelayer {
        if (price <= 0) revert InvalidPrice();
        if (updatedAt == 0 || updatedAt > block.timestamp + 1 hours) revert InvalidTimestamp();
        Price storage current = _prices[ticker];
        if (current.exists && updatedAt <= current.updatedAt) revert StalePush();

        _prices[ticker] = Price({price: price, updatedAt: updatedAt, exists: true});
        emit TestPricePushed(ticker, price, updatedAt, msg.sender);
    }

    /// @notice Latest mirrored price for a ticker.
    function getPrice(string calldata ticker) external view returns (int256 price, uint256 updatedAt) {
        Price storage p = _prices[ticker];
        if (!p.exists) revert UnknownTicker();
        return (p.price, p.updatedAt);
    }

    /// @notice True when no price exists yet, or the last update is older than `maxAgeSeconds`.
    function isStale(string calldata ticker, uint256 maxAgeSeconds) external view returns (bool) {
        Price storage p = _prices[ticker];
        if (!p.exists) return true;
        if (p.updatedAt > block.timestamp) return false; // within clock-skew tolerance
        return block.timestamp > p.updatedAt + maxAgeSeconds;
    }

    /// @notice True when the last update is older than the contract-wide maxStaleAge.
    function isStaleDefault(string calldata ticker) external view returns (bool) {
        Price storage p = _prices[ticker];
        if (!p.exists) return true;
        if (p.updatedAt > block.timestamp) return false;
        return block.timestamp > p.updatedAt + maxStaleAge;
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        isRelayer[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
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
