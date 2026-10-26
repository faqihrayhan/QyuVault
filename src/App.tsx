/**
 * QyuVault — dual-factor USDC vault (ECDSA + post-quantum SLH-DSA)
 * Built with Arc Studio
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { type Address } from 'viem'
import { ConnectKitButton } from 'connectkit'
import Header from './components/Header'
import SetupScreen from './components/SetupScreen'
import VaultDashboard from './components/VaultDashboard'
import VaultActions from './components/VaultActions'

type AppState =
  | { screen: 'setup' }
  | { screen: 'vault'; vaultAddress: Address; pqKey: string }

export default function App() {
  const { isConnected, chainId } = useAccount()
  const [app, setApp] = useState<AppState>({ screen: 'setup' })

  function handleSetup(vaultAddress: string, pqKey: string) {
    setApp({ screen: 'vault', vaultAddress: vaultAddress as Address, pqKey })
  }

  function handleBack() {
    setApp({ screen: 'setup' })
  }

  const activeChainId = chainId ?? 5042002 // default Arc Testnet

  return (
    <div className="min-h-dvh bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap');
      `}</style>

      <Header />

      {!isConnected ? (
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-slate-900 items-center justify-center mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            QyuVault
          </h2>
          <p className="text-sm text-slate-500 mb-8 max-w-xs mx-auto">
            A USDC vault secured by two independent keys: your normal wallet and an offline post-quantum key.
          </p>
          <ConnectKitButton label="Connect wallet to start" />
        </div>
      ) : app.screen === 'setup' ? (
        <SetupScreen onSetup={handleSetup} />
      ) : (
        <>
          <VaultDashboard
            vaultAddress={app.vaultAddress}
            chainId={activeChainId}
            onBack={handleBack}
          />
          <VaultActions
            vaultAddress={app.vaultAddress}
            chainId={activeChainId}
          />
        </>
      )}
    </div>
  )
}
