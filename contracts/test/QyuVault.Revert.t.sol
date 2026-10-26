// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {QyuVaultTestBase} from "./QyuVault.Base.t.sol";
import {QyuVault} from "../QyuVault.sol";

/// ─── Revert / access-control / edge-case tests ────────────────────────────────
contract QyuVaultRevertTest is QyuVaultTestBase {

    // ── access control ────────────────────────────────────────────────────────

    function test_Withdraw_NonOwner_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.NotOwner.selector);
        vm.prank(alice);
        vault.withdraw(bob, amt, _future(), validSig);
    }

    function test_Rotate_NonOwner_Reverts() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.NotOwner.selector);
        vm.prank(alice);
        vault.rotatePQKey(newKey, validSig);
    }

    // ── invalid PQ signature ──────────────────────────────────────────────────

    function test_Withdraw_VerifierReturnsFalse_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);

        // Mock returns false → InvalidPQSignature.
        verifier.setShouldReturn(false);

        vm.expectRevert(QyuVault.InvalidPQSignature.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), validSig);
    }

    function test_Rotate_VerifierReturnsFalse_Reverts() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(false);

        vm.expectRevert(QyuVault.InvalidPQSignature.selector);
        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);
    }

    // ── deadline expired ──────────────────────────────────────────────────────

    function test_Withdraw_ExpiredDeadline_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        // Warp past a past deadline.
        uint256 expiredDeadline = block.timestamp - 1;

        vm.expectRevert(QyuVault.DeadlineExpired.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, expiredDeadline, validSig);
    }

    // ── zero address ──────────────────────────────────────────────────────────

    function test_Withdraw_ZeroAddress_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.ZeroAddress.selector);
        vm.prank(owner);
        vault.withdraw(address(0), amt, _future(), validSig);
    }

    // ── insufficient balance ──────────────────────────────────────────────────

    function test_Withdraw_InsufficientBalance_Reverts() public {
        uint256 deposited = 100e6;
        _deposit(alice, deposited);
        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.InsufficientBalance.selector);
        vm.prank(owner);
        vault.withdraw(bob, deposited + 1, _future(), validSig);
    }

    // ── wrong signature length ────────────────────────────────────────────────

    function test_Withdraw_ShortSig_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        // Verifier state doesn't matter — vault checks length first.
        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.InvalidSignatureLength.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), shortSig);
    }

    function test_Rotate_ShortSig_Reverts() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        vm.expectRevert(QyuVault.InvalidSignatureLength.selector);
        vm.prank(owner);
        vault.rotatePQKey(newKey, shortSig);
    }

    function test_Withdraw_LongSig_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        bytes memory tooLong = new bytes(7857);
        vm.expectRevert(QyuVault.InvalidSignatureLength.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), tooLong);
    }

    // ── verifier hard-reverts ─────────────────────────────────────────────────

    function test_Withdraw_VerifierReverts_VerifierCallFailed() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);

        verifier.setShouldReturn(true);
        verifier.setShouldRevert(true);

        vm.expectRevert(QyuVault.VerifierCallFailed.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), validSig);
    }

    // ── replay protection (nonce) ─────────────────────────────────────────────

    /// After a successful withdraw, using the SAME params again fails:
    /// the nonce advanced, so the digest the vault computes now differs —
    /// the mock's `shouldReturn` is still true, but the vault calls verifier
    /// with a different digest (same `vk`/`sig` bytes, different `message`).
    /// The mock does NOT inspect `message`, so it returns true and the call
    /// should succeed... UNLESS we explicitly set shouldReturn=false to
    /// simulate the real verifier rejecting a mismatched digest.
    ///
    /// In a real PQ scheme the verifier WOULD reject, because the message
    /// changed. We simulate that by resetting shouldReturn=false for the
    /// replay attempt.
    function test_Withdraw_Replay_AfterNonceAdvance_Reverts() public {
        uint256 amt = 100e6;
        _deposit(alice, 2 * amt); // fund for two potential withdrawals

        verifier.setShouldReturn(true);
        uint256 dl = _future();

        // First withdraw succeeds.
        vm.prank(owner);
        vault.withdraw(bob, amt, dl, validSig);
        assertEq(vault.nonce(), 1);

        // Simulate real verifier: new digest → sig invalid.
        verifier.setShouldReturn(false);

        vm.expectRevert(QyuVault.InvalidPQSignature.selector);
        vm.prank(owner);
        vault.withdraw(bob, amt, dl, validSig);
    }

    // ── rotation replay ───────────────────────────────────────────────────────

    function test_Rotate_Replay_AfterNonceAdvance_Reverts() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        // First rotation succeeds.
        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);
        assertEq(vault.nonce(), 1);

        // Nonce changed; simulate real verifier rejecting old sig.
        verifier.setShouldReturn(false);

        vm.expectRevert(QyuVault.InvalidPQSignature.selector);
        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);
    }

    // ── key rotation: old key rejected ────────────────────────────────────────

    /// After rotation, the public key has changed. A signature that was
    /// valid under the old key is invalid under the new key. Simulate this
    /// by setting shouldReturn=false (the verifier now sees the new vk and
    /// returns false).
    function test_Rotate_OldKeySignatureRejectedAfterRotation() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        // Rotate to newKey.
        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);
        assertEq(vault.pqPublicKey(), newKey);

        // Now a withdraw signed with the old key should fail.
        // The mock is still set to return true, but we simulate the real
        // verifier seeing a new vk and rejecting the old sig.
        verifier.setShouldReturn(false);
        _deposit(alice, 100e6);

        vm.expectRevert(QyuVault.InvalidPQSignature.selector);
        vm.prank(owner);
        vault.withdraw(bob, 100e6, _future(), validSig);
    }

    /// Rotation fails when verifier returns false (wrong key).
    function test_Rotate_WrongKeySig_Reverts() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(false); // simulate signing with wrong key

        vm.expectRevert(QyuVault.InvalidPQSignature.selector);
        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);
    }

    // ── digest field sensitivity ──────────────────────────────────────────────

    /// Verifies that changing any single field in the withdraw digest produces
    /// a different digest. We call the public `withdrawDigest` view to compute
    /// and compare.
    function test_WithdrawDigest_ChangingFieldChangesDigest() public view {
        address to     = bob;
        uint256 amount = 100e6;
        uint256 dl     = block.timestamp + 1 days;

        bytes32 base = vault.withdrawDigest(to, amount, dl);

        // Change `to`.
        bytes32 d1 = vault.withdrawDigest(alice,    amount,     dl);
        assertNotEq(base, d1, "to change");

        // Change `amount`.
        bytes32 d2 = vault.withdrawDigest(to,        amount + 1, dl);
        assertNotEq(base, d2, "amount change");

        // Change `deadline`.
        bytes32 d3 = vault.withdrawDigest(to,        amount,     dl + 1);
        assertNotEq(base, d3, "deadline change");
    }

    /// Nonce is baked into the digest: after a successful withdraw (nonce++)
    /// the same (to, amount, deadline) yields a different digest.
    function test_WithdrawDigest_NonceChange_ChangeDigest() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        address to = bob;
        uint256 dl = _future();

        bytes32 digestBefore = vault.withdrawDigest(to, amt, dl);

        vm.prank(owner);
        vault.withdraw(to, amt, dl, validSig);

        // Nonce is now 1 — need more tokens to compute digest (but just the view).
        bytes32 digestAfter = vault.withdrawDigest(to, amt, dl);
        assertNotEq(digestBefore, digestAfter, "nonce change");
    }

    /// The rotate digest also includes chainId and vault address.
    function test_RotateDigest_ChangingFieldChangesDigest() public view {
        bytes32 key1 = bytes32(uint256(0xAAAA));
        bytes32 key2 = bytes32(uint256(0xBBBB));

        bytes32 d1 = vault.rotateDigest(key1);
        bytes32 d2 = vault.rotateDigest(key2);
        assertNotEq(d1, d2, "newKey change");
    }
}
