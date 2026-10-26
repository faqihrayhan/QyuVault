// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPQ {
    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata message, bytes calldata sig)
        external
        view
        returns (bool isValid);
}

contract QyuVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotOwner();
    error DeadlineExpired();
    error ZeroAddress();
    error InsufficientBalance();
    error InvalidSignatureLength();
    error InvalidPQSignature();
    error VerifierCallFailed();

    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);
    event PQKeyRotated(bytes32 indexed newKey);
    event ExcessRecovered(address indexed to, uint256 amount);

    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("QyuVault.Withdraw(uint256 chainId,address vault,address to,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 private constant ROTATE_TYPEHASH =
        keccak256("QyuVault.Rotate(uint256 chainId,address vault,bytes32 newKey,uint256 nonce)");
    uint256 private constant SIG_LENGTH = 7856;

    address public immutable owner;
    address public immutable usdc;
    bytes32 public pqPublicKey;
    address public immutable verifier;
    uint256 public nonce;
    uint256 private _balance;

    constructor(address owner_, address usdc_, bytes32 pqPublicKey_, address verifier_) {
        if (owner_ == address(0) || usdc_ == address(0) || verifier_ == address(0)) revert ZeroAddress();

        owner = owner_;
        usdc = usdc_;
        pqPublicKey = pqPublicKey_;
        verifier = verifier_;
    }

    function deposit(uint256 amount) external nonReentrant {
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        _balance += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdraw(address to, uint256 amount, uint256 deadline, bytes calldata pqSignature) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (to == address(0)) revert ZeroAddress();
        if (amount > _balance) revert InsufficientBalance();

        bytes32 digest = _withdrawDigest(to, amount, deadline);
        _verifySignature(digest, pqSignature);

        unchecked {
            ++nonce;
            _balance -= amount;
        }

        IERC20(usdc).safeTransfer(to, amount);
        emit Withdraw(to, amount);
    }

    function rotatePQKey(bytes32 newKey, bytes calldata pqSignature) external {
        if (msg.sender != owner) revert NotOwner();
        if (newKey == bytes32(0)) revert ZeroAddress();

        bytes32 digest = _rotateDigest(newKey);
        _verifySignature(digest, pqSignature);

        unchecked {
            ++nonce;
        }
        pqPublicKey = newKey;

        emit PQKeyRotated(newKey);
    }

    function recoverExcess(address to) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();

        uint256 actual = IERC20(usdc).balanceOf(address(this));
        uint256 excess = actual > _balance ? actual - _balance : 0;

        if (excess > 0) IERC20(usdc).safeTransfer(to, excess);

        emit ExcessRecovered(to, excess);
    }

    function withdrawDigest(address to, uint256 amount, uint256 deadline) external view returns (bytes32) {
        return _withdrawDigest(to, amount, deadline);
    }

    function rotateDigest(bytes32 newKey) external view returns (bytes32) {
        return _rotateDigest(newKey);
    }

    function _withdrawDigest(address to, uint256 amount, uint256 deadline) internal view returns (bytes32) {
        return keccak256(abi.encode(WITHDRAW_TYPEHASH, block.chainid, address(this), to, amount, nonce, deadline));
    }

    function _rotateDigest(bytes32 newKey) internal view returns (bytes32) {
        return keccak256(abi.encode(ROTATE_TYPEHASH, block.chainid, address(this), newKey, nonce));
    }

    function _verifySignature(bytes32 digest, bytes calldata sig) internal view {
        if (sig.length != SIG_LENGTH) revert InvalidSignatureLength();

        bytes memory vk = abi.encodePacked(pqPublicKey);
        bytes memory message = abi.encodePacked(digest);

        (bool success, bytes memory returndata) = verifier.staticcall(
            abi.encodeCall(IPQ.verifySlhDsaSha2128s, (vk, message, sig))
        );

        if (!success || returndata.length != 32) revert VerifierCallFailed();
        if (!abi.decode(returndata, (bool))) revert InvalidPQSignature();
    }
}
