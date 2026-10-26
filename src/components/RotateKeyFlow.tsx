/**
 * RotateKeyFlow — PQ-signed key rotation, same 3-step pattern as WithdrawFlow
 */
import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Address } from 'viem'
import { ArrowRight, ClipboardCopy, ExternalLink, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { QYUVAULT_ABI, PQ_SIG_BYTES, validateHexBytes, parseVaultError } from '../lib/qyuvault'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Props {
  vaultAddress: Address
  chainId: number
}

type Step = 1 | 2 | 3

export default function RotateKeyFlow({ vaultAddress, chainId }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [newKeyHex, setNewKeyHex] = useState('')
  const [keyError, setKeyError] = useState('')
  const [pqSig, setPqSig] = useState('')
  const [sigError, setSigError] = useState('')

  const newKeyBytes32: `0x${string}` | undefined =
    validateHexBytes(newKeyHex, 32)
      ? ((newKeyHex.startsWith('0x') ? newKeyHex : `0x${newKeyHex}`) as `0x${string}`)
      : undefined

  const { data: digest, isLoading: digestLoading, refetch: refetchDigest } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'rotateDigest',
    args: newKeyBytes32 ? [newKeyBytes32] : undefined,
    chainId,
    query: { enabled: step === 2 && !!newKeyBytes32 },
  })

  const { data: nonce } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'nonce',
    chainId,
  })

  const { writeContract, data: txHash, isPending, error: txError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  function goToStep2(e: React.FormEvent) {
    e.preventDefault()
    if (!validateHexBytes(newKeyHex, 32)) {
      setKeyError('Must be exactly 32 bytes (64 hex chars).')
      return
    }
    setKeyError('')
    void refetchDigest()
    setStep(2)
  }

  function handleRotate(e: React.FormEvent) {
    e.preventDefault()
    if (!validateHexBytes(pqSig, PQ_SIG_BYTES)) {
      setSigError(`Signature must be exactly ${PQ_SIG_BYTES} bytes.`)
      return
    }
    setSigError('')
    const sigHex = (pqSig.startsWith('0x') ? pqSig : `0x${pqSig}`) as `0x${string}`
    writeContract({
      address: vaultAddress,
      abi: QYUVAULT_ABI,
      functionName: 'rotatePQKey',
      args: [newKeyBytes32!, sigHex],
      chainId,
    })
  }

  function copyDigest() {
    if (digest) {
      void navigator.clipboard.writeText(digest).then(() => toast.success('Digest copied!'))
    }
  }

  function reset() {
    setStep(1)
    setNewKeyHex('')
    setKeyError('')
    setPqSig('')
    setSigError('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <RotateCcw size={16} className="text-slate-500" />
        <span className="font-semibold text-slate-900 text-sm">Rotate PQ Key</span>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {(['1. New key', '2. Digest', '3. Send'] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-slate-200" />}
            <span className={step === i + 1 ? 'text-slate-900 font-semibold' : 'text-slate-400'}>{label}</span>
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <form onSubmit={goToStep2} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              New SLH-DSA Public Key (32 bytes)
            </label>
            <input
              value={newKeyHex}
              onChange={e => setNewKeyHex(e.target.value)}
              placeholder="0x or bare hex, 64 chars"
              className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 ${keyError ? 'border-red-400' : 'border-slate-200'}`}
            />
            {keyError && <p className="mt-1 text-xs text-red-500">{keyError}</p>}
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
            Warning: rotating to a key you don't control will permanently lock withdrawals.
          </div>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2">
            Compute digest <ArrowRight size={14} />
          </button>
        </form>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <p className="text-xs text-slate-500">Sign this digest with the <strong>current</strong> PQ private key, then paste the signature below.</p>
            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Rotate Digest</div>
              {digestLoading ? (
                <div className="text-xs text-slate-400 animate-pulse">Computing...</div>
              ) : (
                <div className="font-mono text-xs text-slate-800 break-all bg-white rounded-lg border border-slate-200 p-2">{digest ?? '—'}</div>
              )}
              <button onClick={copyDigest} className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700">
                <ClipboardCopy size={11} /> Copy digest
              </button>
            </div>
            <div className="text-xs text-slate-500">
              <span className="text-slate-400">Nonce:</span> <span className="font-mono text-slate-800">{nonce?.toString() ?? '—'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm">Back</button>
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2">
              Paste signature <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <form onSubmit={handleRotate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              SLH-DSA Signature ({PQ_SIG_BYTES * 2} hex chars, from CURRENT key)
            </label>
            <textarea
              value={pqSig}
              onChange={e => { setPqSig(e.target.value); setSigError('') }}
              placeholder="Paste signature..."
              rows={4}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 ${sigError ? 'border-red-400' : 'border-slate-200'}`}
            />
            {sigError && <p className="mt-1 text-xs text-red-500">{sigError}</p>}
          </div>

          {isSuccess && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              <div className="text-xs text-green-700">
                Key rotated!{' '}
                {txHash && <a href={buildTxExplorerUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">View tx <ExternalLink size={10} /></a>}
              </div>
            </div>
          )}

          {txError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600">{parseVaultError(txError)}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm">Back</button>
            <button type="submit" disabled={isPending || isConfirming}
              className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
              {isPending ? 'Confirm...' : isConfirming ? 'Confirming...' : 'Rotate Key'}
            </button>
          </div>
          {isSuccess && <button type="button" onClick={reset} className="w-full text-xs text-slate-400 hover:text-slate-600">Done</button>}
        </form>
      )}
    </div>
  )
}
