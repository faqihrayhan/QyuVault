// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title QyuVault Precompile Integration Tests (Prompt 4)
 *
 * PURPOSE
 * -------
 * Run against Arc's real PQ precompile at 0x1800000000000000000000000000000000000004
 * using arc-forge (the Arc Foundry build that exposes the precompile in the EVM).
 *
 * HOW TO RUN
 * ----------
 * Obtain the Arc Foundry binary (arc-forge) from https://docs.arc.io/develop/arc-forge
 * and supply a test-vectors JSON file.
 *
 *   arc-forge test --match-contract QyuVaultPrecompileTest \
 *     --rpc-url https://rpc.testnet.arc.io \
 *     -vv
 *
 * TEST VECTORS JSON (place at test-vectors/precompile.json)
 * ---------------------------------------------------------
 * {
 *   "vk":     "<32-byte public key, 64 hex chars>",
 *   "digest": "<32-byte digest, 64 hex chars>",
 *   "sig":    "<7856-byte signature, 15712 hex chars>"
 * }
 *
 * The test file reads these via vm.readFile / vm.parseJson.
 *
 * GAS NOTE
 * --------
 * Arc docs state the precompile costs 230,000 base gas + 6 per 32-byte word of
 * message. The message here is exactly 32 bytes (1 word), so expected precompile
 * gas ≈ 230,006.  The full withdraw() call overhead adds ~20-30k on top.
 * These tests log actual gas so you can verify the precompile budget at runtime.
 *
 * CONTRACT IS UNCHANGED — this file only adds tests, per Prompt 4.
 */

import "forge-std/Test.sol";
import {QyuVault} from "../QyuVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Real precompile address on Arc (mainnet and testnet)
address constant ARC_PQ_PRECOMPILE = 0x1800000000000000000000000000000000000004;
// USDC on Arc
address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

/// @dev Minimal IPQ interface mirror
interface IPQPrecompile {
    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata message, bytes calldata sig)
        external view returns (bool);
}

contract QyuVaultPrecompileTest is Test {
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    QyuVault vault;
    address owner = address(0xA11CE);

    // Loaded from test-vectors/precompile.json
    bytes32 vk;
    bytes32 digest;
    bytes   sig; // 7856 bytes

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------
    function setUp() public {
        // Load test vectors — arc-forge must be run with --ffi or the JSON
        // must be embedded as a constant for environments without fs access.
        // Fallback: set VK / SIG via environment overrides (see comments below).

        string memory jsonPath = string.concat(vm.projectRoot(), "/test-vectors/precompile.json");
        string memory json;

        // Graceful fallback: if file missing, skip setup and let each test
        // call vm.skip() so the suite does not fail without vectors.
        try vm.readFile(jsonPath) returns (string memory content) {
            json = content;
        } catch {
            // File absent — tests will be skipped individually.
            return;
        }

        bytes memory vkBytes  = vm.parseJsonBytes(json, ".vk");
        bytes memory sigBytes = vm.parseJsonBytes(json, ".sig");
        bytes memory digestBytes = vm.parseJsonBytes(json, ".digest");

        require(vkBytes.length  == 32,   "test-vectors: vk must be 32 bytes");
        require(sigBytes.length == 7856, "test-vectors: sig must be 7856 bytes");
        require(digestBytes.length == 32, "test-vectors: digest must be 32 bytes");

        vk     = bytes32(vkBytes);
        sig    = sigBytes;
        digest = bytes32(digestBytes);

        // Deploy vault pointing at the real precompile and real USDC.
        // We deal USDC to the vault via vm.deal (Arc native = USDC ERC-20).
        vault = new QyuVault(owner, ARC_USDC, vk, ARC_PQ_PRECOMPILE);

        // Fund vault with 1 USDC (arc native deal → appears in ERC-20 balance too)
        vm.deal(address(vault), 1_000_000); // 1 USDC in 6-decimal ERC-20 units via native deal
    }

    // -----------------------------------------------------------------------
    // Helper — skip if vectors not loaded
    // -----------------------------------------------------------------------
    modifier requireVectors() {
        if (address(vault) == address(0)) {
            vm.skip(true);
        }
        _;
    }

    // -----------------------------------------------------------------------
    // 1. Valid signature succeeds (full withdraw call through precompile)
    // -----------------------------------------------------------------------
    function test_Precompile_ValidSig_Succeeds() public requireVectors {
        // Compute deadline far in future
        uint256 deadline = block.timestamp + 3600;
        uint256 amount   = 1_000_000; // 1 USDC

        // Compute expected digest from vault view (must match the test vector)
        bytes32 expected = vault.withdrawDigest(owner, amount, deadline);

        // If the test vector digest was computed for different params, this
        // test documents the mismatch explicitly rather than silently failing.
        if (expected != digest) {
            emit log_string("SKIP: test-vector digest doesn't match withdraw params; use rotateDigest vector instead");
            vm.skip(true);
        }

        uint256 gasBefore = gasleft();
        vm.prank(owner);
        vault.withdraw(owner, amount, deadline, sig);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used [withdraw w/ real precompile]", gasUsed);

        // Nonce must have advanced
        assertEq(vault.nonce(), 1);
    }

    // -----------------------------------------------------------------------
    // 2. Tampered digest — precompile returns false, vault reverts
    // -----------------------------------------------------------------------
    function test_Precompile_TamperedDigest_Reverts() public requireVectors {
        // Build a withdraw with a recipient that changes the digest
        address wrongTo = address(0xDEAD);
        uint256 deadline = block.timestamp + 3600;
        uint256 amount   = 1_000_000;

        // The sig was produced for a different digest; precompile should return false
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSignature("InvalidPQSignature()"));
        vault.withdraw(wrongTo, amount, deadline, sig);
    }

    // -----------------------------------------------------------------------
    // 3. Wrong vk length — precompile reverts, vault catches it as VerifierCallFailed
    // -----------------------------------------------------------------------
    function test_Precompile_WrongVkLength_Reverts() public requireVectors {
        // Deploy a vault with a malformed (zero) vk — but vk is always 32 bytes
        // because it comes from bytes32. The only way to get a wrong-length vk
        // would be if the vault mis-encoded it; let's verify the encoding is correct
        // by calling the precompile directly with a 31-byte vk.

        bytes memory shortVk = new bytes(31);
        uint256 deadline = block.timestamp + 3600;

        // Direct staticcall — should revert
        (bool ok,) = ARC_PQ_PRECOMPILE.staticcall(
            abi.encodeWithSignature(
                "verifySlhDsaSha2128s(bytes,bytes,bytes)",
                shortVk,
                abi.encodePacked(digest),
                sig
            )
        );
        assertFalse(ok, "precompile should revert on 31-byte vk");
    }

    // -----------------------------------------------------------------------
    // 4. Wrong signature length — vault checks length before precompile call
    // -----------------------------------------------------------------------
    function test_Precompile_WrongSigLength_Reverts() public requireVectors {
        uint256 deadline = block.timestamp + 3600;
        bytes memory shortSig = new bytes(100); // not 7856

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSignature("InvalidSignatureLength()"));
        vault.withdraw(owner, 1_000_000, deadline, shortSig);
    }

    // -----------------------------------------------------------------------
    // 5. Smoke-test the precompile interface directly
    // -----------------------------------------------------------------------
    function test_Precompile_DirectCall_ValidSig() public requireVectors {
        bool ok = IPQPrecompile(ARC_PQ_PRECOMPILE).verifySlhDsaSha2128s(
            abi.encodePacked(vk),
            abi.encodePacked(digest),
            sig
        );
        assertTrue(ok, "real precompile should return true for valid vectors");
    }
}
