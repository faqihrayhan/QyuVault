/**
 * AttackSimulator — sends a withdraw with a random 7856-byte signature and shows the vault rejects it
 */
import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, type Address, erc20Abi } from 'viem'
import { Zap, ShieldCheck, AlertTriangle } from 'lucide-react'
import { QYUVAULT_ABI, ARC_USDC, PQ_SIG_BYTES, parseVaultError } from '../lib/qyuvault'

interface Props {
  vaultAddress: Address
  chainId: number
}

export default function AttackSimulator({ vaultAddress, chainId }: Props) {
  const [result, setResult] = useState<'idle' | 'pending' | 'rejected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [balanceBefore, setBalanceBefore] = useState<bigint | undefined>()
  const [txHash, _setTxHash] = useState<`0x${string}` | undefined>()

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
    chainId,
  })

  const { writeContract, error: txError } = useWriteContract()
  const { isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })

  function generateRandomSig(): `0x${string}` {
    const bytes = new Uint8Array(PQ_SIG_BYTES)
    crypto.getRandomValues(bytes)
    return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
  }

  function simulate() {
    setResult('pending')
    setErrorMsg('')
    setBalanceBefore(usdcBalance)
    const fakeSig = generateRandomSig()
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
    try {
      writeContract({
        address: vaultAddress,
        abi: QYUVAULT_ABI,
        functionName: 'withdraw',
        args: [vaultAddress, 1_000_000n, deadline, fakeSig],
        chainId,
      })
    } catch (err) {
      setResult('rejected')
      setErrorMsg(parseVaultError(err))
      void refetchBalance()
    }
  }

  // If the tx somehow succeeded — unexpected
  if (isSuccess && result === 'pending') {
    setResult('error')
    setErrorMsg('Unexpected: transaction succeeded! Check your verifier configuration.')
  }

  // Expected: wallet rejection or revert
  if ((txError ?? receiptError) && result === 'pending') {
    setResult('rejected')
    setErrorMsg(parseVaultError(txError ?? receiptError))
    void refetchBalance()
  }

  const balanceAfter = usdcBalance
  const unchanged = balanceBefore !== undefined && balanceAfter !== undefined && balanceBefore === balanceAfter

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-amber-500" />
        <span className="font-semibold text-slate-900 text-sm">Simulate Attacker</span>
      </div>
      <p className="text-xs text-slate-500">
        Sends a withdraw transaction with a <strong>random {PQ_SIG_BYTES}-byte</strong> PQ signature. The vault must reject it and funds must stay put.
      </p>

      <button
        onClick={simulate}
        disabled={result === 'pending'}
        className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        <Zap size={14} /> {result === 'pending' ? 'Sending attack...' : 'Launch Attack'}
      </button>

      {result === 'rejected' && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-green-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-green-800">Attack rejected!</span>
          </div>
          <p className="text-xs text-green-700">The vault correctly rejected the random signature. No funds moved.</p>
          {errorMsg && <p className="text-xs font-mono text-green-600 bg-green-100 rounded px-2 py-1">{errorMsg}</p>}
          {unchanged && (
            <p className="text-xs text-green-700">
              Balance confirmed unchanged:{' '}
              <span className="font-mono">
                {balanceAfter !== undefined ? formatUnits(balanceAfter, 6) : '—'} USDC
              </span>
            </p>
          )}
        </div>
      )}

      {result === 'error' && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{errorMsg}</p>
        </div>
      )}
    </div>
  )
}
