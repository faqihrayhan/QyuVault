/**
 * WithdrawFlow — 3-step PQ-verified withdrawal
 * Step 1: enter params  →  Step 2: show digest  →  Step 3: paste sig + send tx
 */
import { useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress, parseUnits, type Address } from 'viem'
import { ArrowRight, ClipboardCopy, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { QYUVAULT_ABI, PQ_SIG_BYTES, validateHexBytes, parseVaultError } from '../lib/qyuvault'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface Props {
  vaultAddress: Address
  chainId: number
}

type Step = 1 | 2 | 3

export default function WithdrawFlow({ vaultAddress, chainId }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [deadlineMins, setDeadlineMins] = useState('60')
  const [pqSig, setPqSig] = useState('')
  const [sigError, setSigError] = useState('')
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({})
  const [deadline, setDeadline] = useState<bigint>(0n)

  // Read digest from contract
  const { data: digest, isLoading: digestLoading, refetch: refetchDigest } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'withdrawDigest',
    args: isAddress(recipient) && amount && deadline > 0n
      ? [recipient, parseUnits(amount, 6), deadline]
      : undefined,
    chainId,
    query: { enabled: step === 2 && isAddress(recipient) && !!amount && deadline > 0n },
  })

  const { data: nonce } = useReadContract({
    address: vaultAddress,
    abi: QYUVAULT_ABI,
    functionName: 'nonce',
    chainId,
  })

  const { writeContract, data: txHash, isPending, error: txError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  function validateStep1(): boolean {
    const e: Record<string, string> = {}
    if (!isAddress(recipient)) e.recipient = 'Invalid address.'
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Enter a positive amount.'
    if (!deadlineMins || isNaN(Number(deadlineMins)) || Number(deadlineMins) <= 0) e.deadline = 'Enter minutes > 0.'
    setParamErrors(e)
    return Object.keys(e).length === 0
  }

  function goToStep2(e: React.FormEvent) {
    e.preventDefault()
    if (!validateStep1()) return
    const dl = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineMins) * 60)
    setDeadline(dl)
    void refetchDigest()
    setStep(2)
  }

  function goToStep3() {
    setStep(3)
  }

  function validateSig(): boolean {
    if (!validateHexBytes(pqSig, PQ_SIG_BYTES)) {
      setSigError(`Signature must be exactly ${PQ_SIG_BYTES} bytes (${PQ_SIG_BYTES * 2} hex chars).`)
      return false
    }
    setSigError('')
    return true
  }

  function handleWithdraw(e: React.FormEvent) {
    e.preventDefault()
    if (!validateSig()) return
    const sigHex = (pqSig.startsWith('0x') ? pqSig : `0x${pqSig}`) as `0x${string}`
    writeContract({
      address: vaultAddress,
      abi: QYUVAULT_ABI,
      functionName: 'withdraw',
      args: [recipient as Address, parseUnits(amount, 6), deadline, sigHex],
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
    setRecipient('')
    setAmount('')
    setDeadlineMins('60')
    setPqSig('')
    setSigError('')
    setDeadline(0n)
  }

  return (
    <div className="space-y-4">
      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {(['1. Params', '2. Digest', '3. Send'] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-slate-200" />}
            <span className={step === i + 1 ? 'text-slate-900 font-semibold' : 'text-slate-400'}>{label}</span>
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <form onSubmit={goToStep2} className="space-y-3">
          <Field label="Recipient address" error={paramErrors.recipient}>
            <input value={recipient} onChange={e => setRecipient(e.target.value)}
              placeholder="0x..." className={inputCls(paramErrors.recipient)} />
          </Field>
          <Field label="Amount (USDC)" error={paramErrors.amount}>
            <input type="number" min="0" step="0.000001" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" className={inputCls(paramErrors.amount)} />
          </Field>
          <Field label="Deadline (minutes from now)" error={paramErrors.deadline}>
            <input type="number" min="1" value={deadlineMins} onChange={e => setDeadlineMins(e.target.value)}
              className={inputCls(paramErrors.deadline)} />
          </Field>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2">
            Compute digest <ArrowRight size={14} />
          </button>
        </form>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <p className="text-xs text-slate-500">Sign this 32-byte digest offline with your SLH-DSA private key, then paste the signature in the next step.</p>
            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Digest</div>
              {digestLoading ? (
                <div className="text-xs text-slate-400 animate-pulse">Computing...</div>
              ) : (
                <div className="font-mono text-xs text-slate-800 break-all bg-white rounded-lg border border-slate-200 p-2">{digest ?? '—'}</div>
              )}
              <button onClick={copyDigest} className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700">
                <ClipboardCopy size={11} /> Copy digest
              </button>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Current Nonce</div>
              <div className="font-mono text-xs text-slate-800">{nonce?.toString() ?? '—'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div><span className="text-slate-400">To:</span> <span className="font-mono">{recipient.slice(0, 10)}…</span></div>
              <div><span className="text-slate-400">Amount:</span> {amount} USDC</div>
              <div><span className="text-slate-400">Deadline:</span> +{deadlineMins} min</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm">Back</button>
            <button onClick={goToStep3} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2">
              Paste signature <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <form onSubmit={handleWithdraw} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              SLH-DSA Signature ({PQ_SIG_BYTES * 2} hex chars)
            </label>
            <textarea
              value={pqSig}
              onChange={e => { setPqSig(e.target.value); setSigError('') }}
              placeholder={`Paste ${PQ_SIG_BYTES}-byte signature as hex (with or without 0x)...`}
              rows={4}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 ${sigError ? 'border-red-400' : 'border-slate-200'}`}
            />
            {sigError && <p className="mt-1 text-xs text-red-500">{sigError}</p>}
            {pqSig && !sigError && (
              <p className="mt-1 text-xs text-slate-400">
                {((pqSig.startsWith('0x') ? pqSig.slice(2) : pqSig).length / 2).toFixed(0)} / {PQ_SIG_BYTES} bytes
              </p>
            )}
          </div>

          {isSuccess && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              <div className="text-xs text-green-700">
                Withdrawal confirmed!{' '}
                {txHash && <a href={buildTxExplorerUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">View tx <ExternalLink size={10} /></a>}
              </div>
            </div>
          )}

          {(txError) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600">{parseVaultError(txError)}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm">Back</button>
            <button
              type="submit"
              disabled={isPending || isConfirming}
              className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
            >
              {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Send Withdrawal'}
            </button>
          </div>
          {isSuccess && <button type="button" onClick={reset} className="w-full text-xs text-slate-400 hover:text-slate-600">New withdrawal</button>}
        </form>
      )}
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function inputCls(err?: string) {
  return `w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 ${err ? 'border-red-400' : 'border-slate-200'}`
}
