// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IB20Factory} from "base-std/interfaces/IB20Factory.sol";

/// @notice Stand-in for a real B20 ASSET token in local tests.
/// @dev Standard Foundry cannot simulate the B20 precompiles, so the mock
///      reproduces the slice of B20 behaviour PaperMarket relies on:
///      ERC-20 metadata, role-gated mint/burn, supply cap — with the REAL
///      base-std shapes: mint(to, amount) needs MINT_ROLE, burn(amount)
///      burns the caller's own balance and needs BURN_ROLE. The mock is NOT
///      a B20 implementation — B20 behaviour itself is verified by the
///      B20Integration test under base-forge and on Sepolia after funding
///      (see DEPLOY.md).
contract MockB20Token {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    uint256 public supplyCap;

    mapping(bytes32 => mapping(address => bool)) private _roles;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event RoleGranted(bytes32 indexed role, address indexed account);

    bytes32 public constant MINT_ROLE = keccak256("MINT_ROLE");
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 supplyCap_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        supplyCap = supplyCap_;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    function updateSupplyCap(uint256 newCap) external {
        supplyCap = newCap;
    }

    function mint(address to, uint256 amount) external {
        require(_roles[MINT_ROLE][msg.sender], "not minter");
        require(totalSupply + amount <= supplyCap, "cap exceeded");
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external {
        require(_roles[BURN_ROLE][msg.sender], "not burner");
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

/// @notice Stand-in for the B20 factory precompile (0xB20f...).
/// @dev Decodes the ASSET params as the canonical struct blob — the same
///      way the real factory does (a single ABI-encoded struct, leading
///      offset word included) — then deploys a MockB20Token and executes
///      the initCalls against it (grantRole + updateSupplyCap), mirroring
///      the atomic init in the real precompile. Emits B20Created with the
///      same topic[0] as the real factory for receipt-parsing parity.
contract MockB20Factory {
    event B20Created(address indexed token);

    function createB20(uint8 variant, bytes32, bytes calldata params, bytes[] calldata initCalls)
        external
        returns (address token)
    {
        require(variant == 0, "mock: only ASSET");
        IB20Factory.B20AssetCreateParams memory p =
            abi.decode(params, (IB20Factory.B20AssetCreateParams));
        require(p.version == 1, "mock: bad version");
        require(p.initialAdmin != address(0), "mock: zero admin");
        MockB20Token t = new MockB20Token(p.name, p.symbol, p.decimals, type(uint256).max);
        token = address(t);
        for (uint256 i = 0; i < initCalls.length; i++) {
            (bool ok, ) = token.call(initCalls[i]);
            require(ok, "mock: initCall failed");
        }
        emit B20Created(token);
    }
}
