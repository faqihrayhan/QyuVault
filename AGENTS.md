# QyuVault

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

QyuVault is a dual-factor USDC vault where every withdrawal requires two independent approvals:
1. The vault **owner's ECDSA key** (the Ethereum transaction itself)
2. An **offline post-quantum SLH-DSA-SHA2-128s signature** verified via Arc's precompile

## Contracts

### QyuVault.sol
- Source: `contracts/QyuVault.sol`
- Not yet deployed (deploy with `bun run deploy:self` or `deploy_contract`)
- Constructor: `(address owner, address usdc, bytes32 pqPublicKey, address verifier)`
- USDC on Arc: `0x3600000000000000000000000000000000000000`
- Arc mainnet PQ verifier: `0x1800000000000000000000000000000000000004`

### MockPQVerifier.sol
- Source: `contracts/MockPQVerifier.sol`
- Test-only mock with configurable return value

## Audit Findings (resolved)
All four findings from balanced review were applied:
- `owner`, `usdc`, `verifier` marked `immutable`
- Constructor validates all three addresses are non-zero
- `rotatePQKey` rejects `bytes32(0)` new key
- `recoverExcess(address to)` added for stranded tokens

## Test Coverage
- 43 unit tests, 0 failures (`contracts/test/`)
- Precompile integration test scaffold: `contracts/test/QyuVault.Precompile.t.sol` (requires arc-forge + test vectors JSON)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
