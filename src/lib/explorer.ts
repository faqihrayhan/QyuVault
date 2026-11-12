import { arcTestnet } from 'viem/chains'
import { arcMainnet } from '../config'

const EXPLORERS: Record<number, string> = {
  [arcTestnet.id]: 'https://explorer.testnet.arc.io',
  [arcMainnet.id]: 'https://explorer.arc.io',
}

export function buildTxExplorerUrl(chainId: number, txHash: string): string {
  const base = EXPLORERS[chainId] ?? EXPLORERS[arcTestnet.id]
  return `${base}/tx/${txHash}`
}
