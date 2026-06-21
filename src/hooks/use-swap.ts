'use client'

import { useState, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { LX } from '../precompile/addresses'
import { POOL_MANAGER_ABI } from '../precompile/abis'
import { buildSwapCall } from '../precompile/types'
import type { Quote } from '../router'

interface UseSwapResult {
  swap: (quote: Quote) => Promise<void>
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
  txHash: `0x${string}` | undefined
  reset: () => void
}

/**
 * Hook to execute a swap on-chain against the V4 CLOB facade (0x9010).
 *
 * This calls the V4 PoolManager `swap` directly — a marketable order against
 * the resting book — which the precompile translates into a `clob_submit` on
 * the D-Chain. The standard V4 ABI (keccak selectors, ABI-encoded PoolKey) is
 * the contract; do NOT route through the internal LXRouter (0x9012), which uses
 * a non-ABI wire format meant for the precompile's own dispatch.
 *
 * Native LUX is `address(0)` (NEVER WLUX). The precompile's flash-accounting
 * settles native LUX by debiting the caller's account balance directly during
 * autoSettle (currency.IsNative()), so `swap` is nonpayable — no msg.value is
 * attached and no per-swap ERC-20 approval is needed for native.
 *
 * @see ~/work/lux/precompile/dex/engine_zap.go (swap -> clob_submit)
 * @see ~/work/lux/precompile/dex/pool_manager.go (autoSettle / transferToken)
 */
export function useSwap(): UseSwapResult {
  const [error, setError] = useState<Error | null>(null)

  const {
    data: txHash,
    writeContractAsync,
    isPending,
    reset: resetWrite,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const swap = useCallback(
    async (quote: Quote) => {
      setError(null)

      if (!quote || quote.route.length === 0) {
        const e = new Error('Invalid quote')
        setError(e)
        throw e
      }

      try {
        const { key, params, hookData } = buildSwapCall(quote.tokenIn, quote.tokenOut, quote.amountIn)

        await writeContractAsync({
          address: LX.LX_POOL,
          abi: POOL_MANAGER_ABI,
          functionName: 'swap',
          args: [key, params, hookData],
        })
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Swap failed')
        setError(e)
        throw e
      }
    },
    [writeContractAsync]
  )

  const reset = useCallback(() => {
    setError(null)
    resetWrite()
  }, [resetWrite])

  return { swap, isPending, isConfirming, isSuccess, error, txHash, reset }
}
