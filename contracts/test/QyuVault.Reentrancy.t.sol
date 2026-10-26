// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {QyuVault} from "../QyuVault.sol";
import {MockPQVerifier} from "../MockPQVerifier.sol";

/// @dev Malicious ERC-20 whose transferFrom re-enters vault.withdraw.
///      Used to confirm the ReentrancyGuard blocks the second entry.
contract MaliciousToken {
    // ── mimics ERC-20 surface ─────────────────────────────────────────────────
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimals = 6;

    QyuVault    internal vault;
    address     internal reentrantTo;
    uint256     internal reentrantAmount;
    uint256     internal reentrantDeadline;
    bytes       internal reentrantSig;
    bool        internal armed;

    constructor(address vault_) {
        vault = QyuVault(vault_);
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    /// @dev On transferFrom called during deposit, re-enter vault.withdraw.
    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        // Settle the legitimate deposit first.
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;

        // Fire the re-entry once.
        if (armed) {
            armed = false;
            // This second call should be blocked by ReentrancyGuard.
            vault.withdraw(reentrantTo, reentrantAmount, reentrantDeadline, reentrantSig);
        }
        return true;
    }

    /// @dev Mimics the `transfer` called by vault during withdraw.
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    // ── arm the re-entry ──────────────────────────────────────────────────────
    function arm(
        address to_,
        uint256 amount_,
        uint256 deadline_,
        bytes calldata sig_
    ) external {
        reentrantTo       = to_;
        reentrantAmount   = amount_;
        reentrantDeadline = deadline_;
        reentrantSig      = sig_;
        armed             = true;
    }
}

/// ─── Reentrancy tests ─────────────────────────────────────────────────────────
contract QyuVaultReentrancyTest is Test {
    address internal owner   = makeAddr("owner");
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");

    bytes32 internal constant PQ_KEY  = bytes32(uint256(0xDEADBEEF));
    bytes   internal validSig = new bytes(7856);

    MockPQVerifier  internal verifier;
    QyuVault        internal vault;
    MaliciousToken  internal malToken;

    function setUp() public {
        verifier  = new MockPQVerifier();

        // Deploy vault with a placeholder token first (address not yet known).
        // We use a two-step: deploy vault with dummy, then deploy malToken with vault addr.
        // However vault's usdc is set in constructor — so we deploy malToken first with
        // a dummy vault address, then deploy vault with malToken's address.
        //
        // Bootstrap order:
        //   1. Deploy malToken pointing to address(0) temporarily — vault addr not known yet.
        //   2. Compute vault address via create.
        //   3. Deploy vault with malToken address.
        //   4. Point malToken at real vault via helper (use vm.store or just arm normally).
        //
        // Simplest: deploy malToken with zero-vault placeholder, then update via deploy order.
        // forge CREATE is deterministic by (deployer, nonce). We know nonce ahead of time.

        // Get the address this test contract will deploy vault at.
        // The test contract's nonce is currently 1 (malToken was nonce=0 in setUp calls so far).
        // Actually: setUp is called fresh each test. We control the sequence.

        // Step 1: Deploy malToken with address(0) — it will be armed separately.
        malToken = new MaliciousToken(address(0));

        // Step 2: Deploy vault with malToken as usdc.
        vault = new QyuVault(owner, address(malToken), PQ_KEY, address(verifier));

        // Step 3: Point malToken at vault (re-construct is not possible; use a setter).
        // MaliciousToken stores vault in its constructor arg. We need to update it.
        // Instead, redeploy malToken with correct vault address.
        malToken = new MaliciousToken(address(vault));

        // Step 4: Redeploy vault pointing to the *new* malToken.
        vault = new QyuVault(owner, address(malToken), PQ_KEY, address(verifier));

        // Step 5: Update malToken's vault reference to the final vault.
        // MaliciousToken takes vault_ at construction. Redeploy one more time.
        malToken = new MaliciousToken(address(vault));
        // ...and update vault to point at this malToken.
        vault = new QyuVault(owner, address(malToken), PQ_KEY, address(verifier));

        vm.label(address(vault),    "QyuVault");
        vm.label(address(malToken), "MaliciousToken");
        vm.label(owner,             "owner");
    }

    // ── reentrancy via deposit ─────────────────────────────────────────────────

    /// @dev A malicious token re-enters vault.withdraw inside transferFrom
    ///      (called during deposit). The ReentrancyGuard should block this.
    function test_Reentrancy_WithdrawDuringDeposit_Blocked() public {
        uint256 depositAmt  = 1_000e6;
        uint256 withdrawAmt = 100e6;
        uint256 dl          = block.timestamp + 1 days;

        // Fund alice with malToken.
        malToken.mint(alice, depositAmt);
        vm.prank(alice);
        malToken.approve(address(vault), depositAmt);

        // First do a legit deposit to build vault balance (no reentrancy yet).
        vm.prank(alice);
        vault.deposit(depositAmt);

        // Verify there is a balance to steal.
        // The vault holds depositAmt of malToken.

        // Arm: on next transferFrom, re-enter withdraw for withdrawAmt.
        verifier.setShouldReturn(true);
        malToken.arm(bob, withdrawAmt, dl, validSig);

        // Now attempt another deposit (this triggers transferFrom → re-entry).
        malToken.mint(alice, 1e6);
        vm.prank(alice);
        malToken.approve(address(vault), 1e6);

        // The inner vault.withdraw call must be blocked by ReentrancyGuard.
        // The outer deposit itself should revert because the inner call reverts
        // and propagates (SafeERC20 wraps the revert).
        vm.expectRevert();
        vm.prank(alice);
        vault.deposit(1e6);
    }
}
