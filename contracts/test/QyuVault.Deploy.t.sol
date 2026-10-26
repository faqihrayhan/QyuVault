// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {QyuVaultTestBase} from "./QyuVault.Base.t.sol";
import {QyuVault} from "../QyuVault.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// ─── Deployment & happy-path tests ────────────────────────────────────────────
contract QyuVaultDeployTest is QyuVaultTestBase {

    // ── constructor ────────────────────────────────────────────────────────────

    function test_Deploy_SetsOwner() public view {
        assertEq(vault.owner(), owner);
    }

    function test_Deploy_SetsUsdc() public view {
        assertEq(vault.usdc(), address(token));
    }

    function test_Deploy_SetsPQKey() public view {
        assertEq(vault.pqPublicKey(), PQ_KEY);
    }

    function test_Deploy_SetsVerifier() public view {
        assertEq(vault.verifier(), address(verifier));
    }

    function test_Deploy_NonceStartsAtZero() public view {
        assertEq(vault.nonce(), 0);
    }

    // ── deposit happy path ─────────────────────────────────────────────────────

    function test_Deposit_HappyPath_TransfersTokens() public {
        uint256 amt = 500e6;
        _fund(alice, amt);

        uint256 vaultBalBefore = token.balanceOf(address(vault));
        uint256 aliceBalBefore = token.balanceOf(alice);

        vm.prank(alice);
        vault.deposit(amt);

        assertEq(token.balanceOf(address(vault)), vaultBalBefore + amt);
        assertEq(token.balanceOf(alice), aliceBalBefore - amt);
    }

    function test_Deposit_HappyPath_EmitsEvent() public {
        uint256 amt = 500e6;
        _fund(alice, amt);

        vm.expectEmit(true, false, false, true, address(vault));
        emit QyuVault.Deposit(alice, amt);

        vm.prank(alice);
        vault.deposit(amt);
    }

    function test_Deposit_HappyPath_IncreasesBalance() public {
        // _balance is private, so we prove it via a subsequent withdraw succeeding.
        uint256 amt = 1_000e6;
        _deposit(alice, amt);

        // Setup: allow a withdraw of exactly amt to succeed.
        verifier.setShouldReturn(true);
        uint256 dl = _future();

        vm.prank(owner);
        vault.withdraw(alice, amt, dl, validSig);

        // Alice received the tokens back → vault had the balance.
        assertEq(token.balanceOf(alice), amt);
    }

    // ── withdraw happy path ─────────────────────────────────────────────────────

    function test_Withdraw_HappyPath_TransfersTokens() public {
        uint256 amt = 300e6;
        _deposit(alice, amt);

        uint256 bobBalBefore = token.balanceOf(bob);
        verifier.setShouldReturn(true);

        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), validSig);

        assertEq(token.balanceOf(bob), bobBalBefore + amt);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_Withdraw_HappyPath_EmitsEvent() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        vm.expectEmit(true, false, false, true, address(vault));
        emit QyuVault.Withdraw(bob, amt);

        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), validSig);
    }

    function test_Withdraw_HappyPath_IncrementsNonce() public {
        uint256 amt = 100e6;
        _deposit(alice, amt);

        uint256 nonceBefore = vault.nonce();
        verifier.setShouldReturn(true);

        vm.prank(owner);
        vault.withdraw(bob, amt, _future(), validSig);

        assertEq(vault.nonce(), nonceBefore + 1);
    }

    // ── rotatePQKey happy path ─────────────────────────────────────────────────

    function test_Rotate_HappyPath_UpdatesKey() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);

        assertEq(vault.pqPublicKey(), newKey);
    }

    function test_Rotate_HappyPath_IncrementsNonce() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);
        uint256 nonceBefore = vault.nonce();

        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);

        assertEq(vault.nonce(), nonceBefore + 1);
    }

    function test_Rotate_HappyPath_EmitsEvent() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        vm.expectEmit(true, false, false, false, address(vault));
        emit QyuVault.PQKeyRotated(newKey);

        vm.prank(owner);
        vault.rotatePQKey(newKey, validSig);
    }

    // ── gas logging ───────────────────────────────────────────────────────────

    function test_Gas_Deposit() public {
        uint256 amt = 1_000e6;
        _fund(alice, amt);

        vm.prank(alice);
        uint256 gasBefore = gasleft();
        vault.deposit(amt);
        uint256 gasUsed = gasBefore - gasleft();
        console2.log("Gas used [deposit]:", gasUsed);
    }

    function test_Gas_Withdraw() public {
        uint256 amt = 1_000e6;
        _deposit(alice, amt);
        verifier.setShouldReturn(true);

        vm.prank(owner);
        uint256 gasBefore = gasleft();
        vault.withdraw(bob, amt, _future(), validSig);
        uint256 gasUsed = gasBefore - gasleft();
        console2.log("Gas used [withdraw]:", gasUsed);
    }

    function test_Gas_RotatePQKey() public {
        bytes32 newKey = bytes32(uint256(0xCAFEBABE));
        verifier.setShouldReturn(true);

        vm.prank(owner);
        uint256 gasBefore = gasleft();
        vault.rotatePQKey(newKey, validSig);
        uint256 gasUsed = gasBefore - gasleft();
        console2.log("Gas used [rotatePQKey]:", gasUsed);
    }
}
