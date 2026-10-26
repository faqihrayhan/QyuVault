/**
 * QyuVault ABI and constants
 */

export const QYUVAULT_ABI = [
  // constructor(address owner, address usdc, bytes32 pqPublicKey, address verifier)
  {
    type: 'constructor',
    inputs: [
      { name: 'owner_', type: 'address' },
      { name: 'usdc_', type: 'address' },
      { name: 'pqPublicKey_', type: 'bytes32' },
      { name: 'verifier_', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  // View
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'usdc', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pqPublicKey', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'verifier', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'nonce', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'withdrawDigest',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'rotateDigest',
    inputs: [{ name: 'newKey', type: 'bytes32' }],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  // State-changing
  {
    type: 'function',
    name: 'deposit',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'pqSignature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'rotatePQKey',
    inputs: [
      { name: 'newKey', type: 'bytes32' },
      { name: 'pqSignature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recoverExcess',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    type: 'event',
    name: 'Deposit',
    inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [{ name: 'to', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'PQKeyRotated',
    inputs: [{ name: 'newKey', type: 'bytes32', indexed: true }],
  },
  // Errors
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'DeadlineExpired', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'InsufficientBalance', inputs: [] },
  { type: 'error', name: 'InvalidSignatureLength', inputs: [] },
  { type: 'error', name: 'InvalidPQSignature', inputs: [] },
  { type: 'error', name: 'VerifierCallFailed', inputs: [] },
] as const

/** Arc mainnet PQ precompile address */
export const ARC_PQ_VERIFIER = '0x1800000000000000000000000000000000000004' as const

/** USDC contract on Arc (both mainnet and testnet) */
export const ARC_USDC = '0x3600000000000000000000000000000000000000' as const

/** Expected PQ signature length in bytes (SLH-DSA-SHA2-128s) */
export const PQ_SIG_BYTES = 7856

/** Validate a hex string is exactly N bytes */
export function validateHexBytes(hex: string, expectedBytes: number): boolean {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return /^[0-9a-fA-F]*$/.test(clean) && clean.length === expectedBytes * 2
}

/** Parse a hex string to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Format a bytes32 hex for display */
export function shortBytes32(hex: string): string {
  const clean = hex.startsWith('0x') ? hex : `0x${hex}`
  return `${clean.slice(0, 10)}...${clean.slice(-8)}`
}

/** Format an address for display */
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Parse onchain error name from a wagmi error */
export function parseVaultError(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? ''
  if (msg.includes('NotOwner')) return 'Only the vault owner can call this.'
  if (msg.includes('DeadlineExpired')) return 'The deadline has passed.'
  if (msg.includes('ZeroAddress')) return 'Address cannot be zero.'
  if (msg.includes('InsufficientBalance')) return 'Amount exceeds vault balance.'
  if (msg.includes('InvalidSignatureLength')) return 'Signature must be exactly 7856 bytes.'
  if (msg.includes('InvalidPQSignature')) return 'Post-quantum signature is invalid.'
  if (msg.includes('VerifierCallFailed')) return 'Verifier call failed (wrong vk/sig length or unavailable).'
  if (msg.toLowerCase().includes('user rejected')) return 'Transaction cancelled.'
  if (msg.toLowerCase().includes('insufficient funds')) return 'Insufficient USDC for gas.'
  return msg.slice(0, 120) || 'Transaction failed.'
}
