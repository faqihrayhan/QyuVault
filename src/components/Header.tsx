import { ConnectKitButton } from 'connectkit'
import { Shield } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { arcMainnet } from '../config'
import { arcTestnet } from 'viem/chains'

const CHAINS = [
  { id: arcTestnet.id, label: 'Arc Testnet' },
  { id: arcMainnet.id, label: 'Arc Mainnet' },
]

export default function Header() {
  const { chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-semibold text-slate-900 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            QyuVault
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Network switcher */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                onClick={() => switchChain({ chainId: c.id })}
                disabled={isPending}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chainId === c.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <ConnectKitButton />
        </div>
      </div>
    </header>
  )
}
