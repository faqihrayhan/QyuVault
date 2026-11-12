/**
 * SetupScreen — paste PQ public key + vault address to get started
 */
import { useState } from 'react'
import { isAddress } from 'viem'
import { Key, Vault, HelpCircle } from 'lucide-react'
import { validateHexBytes } from '../lib/qyuvault'

interface Props {
  onSetup: (vaultAddress: string, pqKey: string) => void
}

export default function SetupScreen({ onSetup }: Props) {
  // Alamat contract QyuVault yang telah dideploy di Arc Testnet
  const [vaultAddr, setVaultAddr] = useState('0x3bdb3c8646e60390b3e3aafdb238b2538f5a771c')
  // Placeholder SLH-DSA public key 32-byte untuk verifikasi awal
  const [pqKey, setPqKey] = useState('0x0000000000000000000000000000000000000000000000000000000000000001')
  const [errors, setErrors] = useState<{ vault?: string; key?: string }>({})

  function validate(): boolean {
    const e: { vault?: string; key?: string } = {}
    if (!isAddress(vaultAddr)) e.vault = 'Enter a valid 0x address.'
    const keyHex = pqKey.startsWith('0x') ? pqKey.slice(2) : pqKey
    if (!validateHexBytes(pqKey, 32) && keyHex.length !== 64) {
      e.key = 'Must be exactly 32 bytes (64 hex chars), with or without 0x prefix.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const normalized = pqKey.startsWith('0x') ? pqKey : `0x${pqKey}`
    onSetup(vaultAddr.trim(), normalized)
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      {/* Hero */}
      <div className="text-center mb-8">
        {/* Logo QyuVault */}
        <div className="inline-flex items-center justify-center mb-4">
          <img
            src="/qyuvault-logo-512.png"
            alt="QyuVault Logo"
            className="w-16 h-16 rounded-2xl shadow-sm object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Connect to your vault
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter an existing QyuVault address and its SLH-DSA public key.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Vault address */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
            Vault contract address
          </label>
          <input
            type="text"
            value={vaultAddr}
            onChange={(e) => setVaultAddr(e.target.value)}
            placeholder="0x..."
            className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 ${
              errors.vault ? 'border-red-400' : 'border-slate-200'
            }`}
          />
          {errors.vault && <p className="mt-1 text-xs text-red-500">{errors.vault}</p>}
        </div>

        {/* PQ public key */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Key size={12} /> SLH-DSA Public Key (32 bytes / 64 hex chars)
          </label>
          <input
            type="text"
            value={pqKey}
            onChange={(e) => setPqKey(e.target.value)}
            placeholder="0x or bare hex, 64 chars"
            className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 ${
              errors.key ? 'border-red-400' : 'border-slate-200'
            }`}
          />
          {errors.key && <p className="mt-1 text-xs text-red-500">{errors.key}</p>}
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-colors"
        >
          Open Vault
        </button>
      </form>

      {/* How it works */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">How it works</span>
        </div>
        <ul className="text-xs text-slate-500 space-y-1.5 list-disc list-inside">
          <li>Every withdrawal requires <strong>two approvals</strong>: your normal wallet (ECDSA) and an offline post-quantum key (SLH-DSA).</li>
          <li>The normal wallet signs the Ethereum transaction — that is the first factor.</li>
          <li>The offline PQ key signs a 32-byte digest computed from the withdrawal parameters — that is the second factor.</li>
          <li>Both must match for funds to move. Compromising either key alone is not enough.</li>
        </ul>
      </div>
    </div>
  )
}
