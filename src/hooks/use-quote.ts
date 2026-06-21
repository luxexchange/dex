'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Address } from 'viem'
import { OmnichainRouter, DexUnavailableError, type Quote, type QuoteRequest } from '../router'
import type { ICLOBClient } from '../client/types'

interface UseQuoteOptions {
  refreshInterval?: number // ms
  enabled?: boolean
}

interface UseQuoteResult {
  quote: Quote | null
  isLoading: boolean
  error: Error | null
  /** True when the venue DEX backend is not configured/connected. The UI should
   *  show a "trading unavailable" state instead of a quote. */
  unavailable: boolean
  refetch: () => Promise<void>
}

/**
 * Hook to get a swap quote from the V4 CLOB by walking the resting book.
 *
 * The order book is served by the venue's D-Chain gateway via `clobClient`.
 * When no client is supplied (or it is disconnected) the venue DEX is inert, so
 * this hook reports `unavailable: true` and returns no quote rather than
 * throwing — the swap UI degrades gracefully.
 */
export function useQuote(
  clobClient: ICLOBClient | null,
  tokenIn: Address | undefined,
  tokenOut: Address | undefined,
  amountIn: bigint | undefined,
  options: UseQuoteOptions = {}
): UseQuoteResult {
  const { refreshInterval = 10000, enabled = true } = options
  const routerRef = useRef<OmnichainRouter | null>(null)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  // Initialize router and keep its CLOB client in sync.
  useEffect(() => {
    if (!routerRef.current) {
      routerRef.current = new OmnichainRouter()
    }
    routerRef.current.setCLOBClient(clobClient)
  }, [clobClient])

  const fetchQuote = useCallback(async () => {
    if (!tokenIn || !tokenOut || !amountIn || amountIn === 0n || !enabled) {
      setQuote(null)
      setError(null)
      return
    }

    const router = routerRef.current
    if (!router || !router.isAvailable()) {
      setQuote(null)
      setUnavailable(true)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setUnavailable(false)

    try {
      const request: QuoteRequest = { tokenIn, tokenOut, amountIn }
      const newQuote = await router.getQuote(request)
      setQuote(newQuote)
    } catch (err) {
      if (err instanceof DexUnavailableError) {
        setUnavailable(true)
        setQuote(null)
      } else {
        setError(err instanceof Error ? err : new Error('Failed to get quote'))
        setQuote(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [tokenIn, tokenOut, amountIn, enabled])

  // Fetch on mount and when inputs change.
  useEffect(() => {
    fetchQuote()
  }, [fetchQuote])

  // Auto-refresh.
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return
    const interval = setInterval(fetchQuote, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchQuote, enabled, refreshInterval])

  return { quote, isLoading, error, unavailable, refetch: fetchQuote }
}
