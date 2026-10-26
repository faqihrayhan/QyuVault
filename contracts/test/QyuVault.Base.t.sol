// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {QyuVault} from "../QyuVault.sol";
import {MockPQVerifier} from "../MockPQVerifier.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Shared base for all QyuVault test categories.
///      No test_* / testFuzz_* / invariant_* functions here —
///      only setUp, actors, helpers, and the PQ sig constant.
abstract contract QyuVaultTestBase is Test {
    // ─── actors ────────────────────────────────────────────────────────────────
    address internal owner   = makeAddr("owner");
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");

    // ─── PQ fixtures ───────────────────────────────────────────────────────────
    // A 32-byte mock public key stored in the vault.
    bytes32 internal constant PQ_KEY = bytes32(uint256(0xDEADBEEF));

    // A 7856-byte valid-length PQ signature (all zeros — the mock only checks length).
    bytes internal validSig = new bytes(7856);

    // A wrong-length signature (10 bytes).
    bytes internal shortSig = new bytes(10);

    // ─── contracts ─────────────────────────────────────────────────────────────
    MockERC20       internal token;
    MockPQVerifier  internal verifier;
    QyuVault        internal vault;

    // ─── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        // Deploy mock ERC-20 (6 decimals, like USDC).
        token    = new MockERC20("Mock USDC", "mUSDC", 6);
        verifier = new MockPQVerifier();

        // Deploy vault: owner, usdc, pqPublicKey, verifier.
        vault = new QyuVault(owner, address(token), PQ_KEY, address(verifier));

        // Label addresses for cleaner traces.
        vm.label(address(token),    "MockERC20");
        vm.label(address(verifier), "MockPQVerifier");
        vm.label(address(vault),    "QyuVault");
        vm.label(owner,             "owner");
        vm.label(alice,             "alice");
        vm.label(bob,               "bob");
    }

    // ─── helpers ───────────────────────────────────────────────────────────────

    /// @dev Mint `amount` tokens to `who` and approve the vault.
    function _fund(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(vault), amount);
    }

    /// @dev Deposit `amount` from `who` into the vault.
    function _deposit(address who, uint256 amount) internal {
        _fund(who, amount);
        vm.prank(who);
        vault.deposit(amount);
    }

    /// @dev Set the mock verifier to return `v` and perform a withdraw as owner.
    function _withdraw(address to, uint256 amount, uint256 deadline, bool mockReturn)
        internal
    {
        verifier.setShouldReturn(mockReturn);
        vm.prank(owner);
        vault.withdraw(to, amount, deadline, validSig);
    }

    /// @dev Return a deadline far in the future.
    function _future() internal view returns (uint256) {
        return block.timestamp + 1 days;
    }
}
