// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {QyuVaultTestBase} from "./QyuVault.Base.t.sol";
import {QyuVault} from "../QyuVault.sol";

/// ─── Fuzz tests ───────────────────────────────────────────────────────────────
contract QyuVaultFuzzTest is QyuVaultTestBase {

    // ── fuzz: deposit then full withdraw ──────────────────────────────────────

    /// PROPERTY: depositing `amount` then withdrawing `amount` succeeds and
    ///           the recipient receives exactly `amount` tokens.
    function testFuzz_DepositThenWithdraw(uint256 amount) public {
        // Bound: positive, fits in uint96 to avoid overflow in token mint maths.
        amount = bound(amount, 1, type(uint96).max);

        // Deposit `amount` from alice.
        _deposit(alice, amount);

        uint256 bobBalBefore = token.balanceOf(bob);

        verifier.setShouldReturn(true);
        vm.prank(owner);
        vault.withdraw(bob, amount, _future(), validSig);

        assertEq(token.balanceOf(bob), bobBalBefore + amount, "bob balance");
        assertEq(token.balanceOf(address(vault)), 0,          "vault empty");
    }

    // ── fuzz: partial withdrawals ─────────────────────────────────────────────

    /// PROPERTY: withdrawing `part` (<= deposited `total`) succeeds;
    ///           remaining vault balance equals total - part.
    function testFuzz_PartialWithdraw(uint256 total, uint256 part) public {
        total = bound(total, 1, type(uint96).max);
        part  = bound(part, 0, total);

        _deposit(alice, total);

        verifier.setShouldReturn(true);
        vm.prank(owner);
        vault.withdraw(bob, part, _future(), validSig);

        // Residual tokens stay in vault.
        assertEq(token.balanceOf(address(vault)), total - part);
    }

    // ── fuzz: nonce advances by 1 per withdrawal ─────────────────────────────

    /// PROPERTY: after N withdrawals the nonce equals N.
    ///           We cap N at 5 to keep run times reasonable while still
    ///           exercising multi-step nonce advancement.
    function testFuzz_NonceAdvancesPerWithdrawal(uint8 n) public {
        // Bound n to 1..5.
        uint256 N = bound(uint256(n), 1, 5);

        uint256 amtEach = 1e6; // 1 USDC each time
        // Fund vault with N * amtEach.
        _deposit(alice, N * amtEach);

        verifier.setShouldReturn(true);

        for (uint256 i = 0; i < N; i++) {
            vm.prank(owner);
            vault.withdraw(bob, amtEach, _future(), validSig);
        }

        assertEq(vault.nonce(), N, "nonce == N");
    }

    // ── fuzz: nonce advances per rotation ────────────────────────────────────

    /// PROPERTY: after M rotations nonce equals M.
    function testFuzz_NonceAdvancesPerRotation(uint8 m) public {
        uint256 M = bound(uint256(m), 1, 5);

        verifier.setShouldReturn(true);

        for (uint256 i = 0; i < M; i++) {
            bytes32 newKey = bytes32(uint256(i + 1)); // distinct key each time
            vm.prank(owner);
            vault.rotatePQKey(newKey, validSig);
        }

        assertEq(vault.nonce(), M, "nonce == M");
    }

    // ── fuzz: overspend reverts ────────────────────────────────────────────────

    /// PROPERTY: trying to withdraw more than deposited always reverts.
    function testFuzz_OverWithdraw_AlwaysReverts(uint256 deposited, uint256 extra) public {
        deposited = bound(deposited, 0, type(uint96).max - 1);
        extra     = bound(extra, 1, type(uint96).max);

        if (deposited > 0) _deposit(alice, deposited);

        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.InsufficientBalance.selector);
        vm.prank(owner);
        vault.withdraw(bob, deposited + extra, _future(), validSig);
    }

    // ── fuzz: deadline edge ────────────────────────────────────────────────────

    /// PROPERTY: a deadline strictly in the future never triggers DeadlineExpired.
    function testFuzz_FutureDeadline_NeverExpires(uint32 futureDelta) public {
        // futureDelta in [1, 365 days].
        uint256 delta    = bound(uint256(futureDelta), 1, 365 days);
        uint256 deadline = block.timestamp + delta;

        uint256 amt = 1e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        // Should NOT revert with DeadlineExpired.
        vm.prank(owner);
        vault.withdraw(bob, amt, deadline, validSig);
    }

    // ── fuzz: signature length check always fires for wrong lengths ────────────

    /// PROPERTY: any sig length != 7856 causes InvalidSignatureLength.
    function testFuzz_WrongSigLength_AlwaysReverts(uint16 badLen) public {
        vm.assume(badLen != 7856);

        uint256 amt = 1e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        bytes memory badSig = new bytes(badLen);
        vm.expectRevert(QyuVault.InvalidSignatureLength.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), badSig);
    }
}
