# QyuVault

A dual-factor USDC vault where every withdrawal requires two independent approvals: the owner's normal wallet (ECDSA) and an offline post-quantum key (SLH-DSA-SHA2-128s).

Built with [Arc Studio](https://studio.arc.io)

---

## What it does

Users deposit USDC into a vault contract. To withdraw, the vault owner must:
1. Submit the Ethereum transaction (ECDSA factor — the wallet itself)
2. Provide a valid SLH-DSA-SHA2-128s signature over a deterministic 32-byte digest (post-quantum factor — an offline key)

Both factors must match for funds to move. Compromising either key alone is not enough. Key rotation also requires a valid PQ signature from the current key.

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Web3**: wagmi v2, viem, ConnectKit
- **Contracts**: Solidity ^0.8.24, Foundry, OpenZeppelin 5.6.1
- **Chain**: Arc Mainnet (chain ID 5042) / Arc Testnet (chain ID 5042002)
- **Token**: USDC at `0x3600000000000000000000000000000000000000` (6 decimals)
- **PQ Verifier**: Arc precompile at `0x1800000000000000000000000000000000000004`

---

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`)

### Install

```bash
bun install
```

### Run

```bash
bun run dev
```

### Build contracts

```bash
bun run contracts:build
```

### Test contracts

```bash
bun run contracts:test
```

### Lint & typecheck

```bash
bun run check
```

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base URL | Optional outside Arc Studio |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy token | Optional outside Arc Studio |
| `RPC_PROXY_CHAINS` | Comma-separated list of chains the proxy covers | Optional outside Arc Studio |

No private keys or API keys are required to run the frontend.

---

## Contract: QyuVault

**Constructor:** `(address owner, address usdc, bytes32 pqPublicKey, address verifier)`

| Function | Description |
|---|---|
| `deposit(uint256 amount)` | Deposit USDC from caller |
| `withdraw(address to, uint256 amount, uint256 deadline, bytes pqSignature)` | Owner-only withdrawal with PQ sig |
| `rotatePQKey(bytes32 newKey, bytes pqSignature)` | Rotate PQ key, signed by current key |
| `recoverExcess(address to)` | Recover USDC sent directly to contract |
| `withdrawDigest(address, uint256, uint256)` | Returns the digest to sign for a withdrawal |
| `rotateDigest(bytes32)` | Returns the digest to sign for key rotation |

---

## Precompile Integration Tests (Prompt 4)

Tests in `contracts/test/QyuVault.Precompile.t.sol` run against Arc's real PQ precompile and require:
1. The Arc Foundry binary (`arc-forge`) from https://docs.arc.io/develop/arc-forge
2. A test-vectors JSON file at `test-vectors/precompile.json` with fields `vk`, `digest`, `sig` (hex)

```bash
arc-forge test --match-contract QyuVaultPrecompileTest --rpc-url https://rpc.testnet.arc.io -vv
```
