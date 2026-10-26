/**
 * VaultDashboard — shows vault balance, nonce, and deposit form
 */
import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits, type Address } from 'viem'
import { ArrowDownToLine, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { QYUVAULT_ABI, ARC_USDC, shortBytes32, parseVaultError } from '../lib/qyuvault'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Props {
  vaultAddress: Address
  chainId: number
  onBack: () => void
}

export default function VaultDashboard({ vaultAddress, chainId, onBack }: Props) {
  const { address: walletAddr } = useAccount()
  const [depositAmount, setDepositAmount] = useState('')
  const [approving, setApproving] = useState(false)

  // Read vault state
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
    chainId,
  })

  const { data: nonce, refetch: refetchNonce } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'nonce',
    chainId,
  })

  const { data: pqKey } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'pqPublicKey',
    chainId,
  })

  const { data: vaultOwner } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'owner',
    chainId,
  })

  // Wallet USDC balance
  const { data: walletUsdc } = useReadContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: walletAddr ? [walletAddr] : undefined,
    chainId,
    query: { enabled: !!walletAddr },
  })

  // Approve + deposit
  const { writeContract: approve, data: approveHash } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: deposit, data: depositHash } = useWriteContract()
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash })

  const isDepositing = approving || approveConfirming || depositConfirming

  function handleDeposit(e: React.FormEvent) {
    e.preventDefault()
    if (!depositAmount || isNaN(Number(depositAmount))) return
    const raw = parseUnits(depositAmount, 6)
    setApproving(true)
    try {
      approve({
        address: ARC_USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [vaultAddress, raw],
        chainId,
      })
    } catch (err) {
      toast.error(parseVaultError(err))
      setApproving(false)
    }
  }

  // After approve confirmed, do the deposit
  if (approveSuccess && !depositConfirming && !depositSuccess && approving) {
    const raw = parseUnits(depositAmount, 6)
    setApproving(false)
    deposit({
      address: vaultAddress,
      abi: QYUVAULT_ABI,
      functionName: 'deposit',
      args: [raw],
      chainId,
    })
  }

  if (depositSuccess) {
    toast.success('Deposited successfully!')
    setDepositAmount('')
    void refetchBalance()
    void refetchNonce()
  }

  const formatted = usdcBalance !== undefined ? formatUnits(usdcBalance, 6) : '—'
  const walletFormatted = walletUsdc !== undefined ? formatUnits(walletUsdc, 6) : '—'
  const isOwner = walletAddr && vaultOwner && walletAddr.toLowerCase() === vaultOwner.toLowerCase()

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      {/* Back */}
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
        ← Change vault
      </button>

      {/* Balance card */}
      <div className="rounded-2xl bg-slate-900 text-white p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Vault Balance</div>
        <div className="text-4xl font-bold tabular-nums tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {formatted} <span className="text-xl text-slate-400">USDC</span>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
          <span>Nonce: <span className="text-white font-mono">{nonce?.toString() ?? '—'}</span></span>
          <span className="truncate">PQ Key: <span className="text-white font-mono">{pqKey ? shortBytes32(pqKey) : '—'}</span></span>
        </div>
        <button
          onClick={() => { void refetchBalance(); void refetchNonce() }}
          className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Vault address */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 mb-0.5">Vault address</div>
          <div className="text-xs font-mono text-slate-700 break-all">{vaultAddress}</div>
        </div>
        <a
          href={`https://explorer${chainId === 5042 ? '' : '.testnet'}.arc.io/address/${vaultAddress}`}
          target="_blank" rel="noopener noreferrer"
          className="ml-2 text-slate-400 hover:text-slate-700 flex-shrink-0"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Not owner warning */}
      {walletAddr && !isOwner && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
          Your connected wallet is not the vault owner. Withdraw and rotate functions will revert.
        </div>
      )}

      {/* Deposit form — anyone can deposit */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownToLine size={16} className="text-slate-500" />
          <span className="font-semibold text-slate-900 text-sm">Deposit USDC</span>
        </div>
        <form onSubmit={handleDeposit} className="space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-slate-500">Amount (USDC)</label>
              <button
                type="button"
                onClick={() => walletUsdc && setDepositAmount(formatUnits(walletUsdc, 6))}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Max: {walletFormatted}
              </button>
            </div>
            <input
              type="number"
              min="0"
              step="0.000001"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={isDepositing || !depositAmount}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {approving || approveConfirming ? 'Approving...' : depositConfirming ? 'Depositing...' : 'Deposit'}
          </button>
          {depositHash && (
            <a
              href={buildTxExplorerUrl(chainId, depositHash)}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <ExternalLink size={11} /> View transaction
            </a>
          )}
        </form>
      </div>
    </div>
  )
}
