/**
 * VaultActions — tab panel: Withdraw | Rotate Key | Attack Sim
 */
import { useState } from 'react'
import { type Address } from 'viem'
import { useAccount } from 'wagmi'
import { useReadContract } from 'wagmi'
import { QYUVAULT_ABI } from '../lib/qyuvault'
import WithdrawFlow from './WithdrawFlow'
import RotateKeyFlow from './RotateKeyFlow'
import AttackSimulator from './AttackSimulator'

interface Props {
  vaultAddress: Address
  chainId: number
}

type Tab = 'withdraw' | 'rotate' | 'attack'

export default function VaultActions({ vaultAddress, chainId }: Props) {
  const [tab, setTab] = useState<Tab>('withdraw')
  const { address: walletAddr } = useAccount()

  const { data: vaultOwner } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'owner',
    chainId,
  })

  const isOwner = walletAddr && vaultOwner && walletAddr.toLowerCase() === vaultOwner.toLowerCase()

  const tabs: { id: Tab; label: string }[] = [
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'rotate', label: 'Rotate Key' },
    { id: 'attack', label: 'Simulate Attack' },
  ]

  return (
    <div className="max-w-md mx-auto px-4 pb-10">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isOwner && tab !== 'attack' && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
          Connect as the vault owner to use this function.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {tab === 'withdraw' && <WithdrawFlow vaultAddress={vaultAddress} chainId={chainId} />}
        {tab === 'rotate' && <RotateKeyFlow vaultAddress={vaultAddress} chainId={chainId} />}
        {tab === 'attack' && <AttackSimulator vaultAddress={vaultAddress} chainId={chainId} />}
      </div>
    </div>
  )
}
