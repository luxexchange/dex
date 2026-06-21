/**
 * Market symbol resolution for CLOB lookups.
 *
 * The CLOB gateway keys order books and trades by a market symbol (e.g.
 * "LUX-LUSD"), while the EVM/V4 surface keys by token address (native LUX =
 * address(0)). This module maps token addresses to their ticker so the router
 * can ask the book for the right market.
 *
 * The token universe is owned by the app (its token list), not by this package,
 * so the app registers its address→symbol map once at startup via
 * `registerTokenSymbols`. Native LUX is pre-registered. There is exactly one
 * registry — callers must not maintain their own parallel map.
 */
import type { Address } from 'viem'
import { NATIVE_LUX } from '../precompile/types'

const NATIVE_SYMBOL = 'LUX'

const symbolByAddress = new Map<string, string>([
  [NATIVE_LUX.toLowerCase(), NATIVE_SYMBOL],
])

/**
 * Register (or override) token ticker symbols by address. Idempotent; call once
 * with the app's token list. Addresses are matched case-insensitively.
 */
export function registerTokenSymbols(entries: Record<Address, string> | Array<[Address, string]>): void {
  const pairs = Array.isArray(entries) ? entries : (Object.entries(entries) as Array<[Address, string]>)
  for (const [address, symbol] of pairs) {
    if (symbol) symbolByAddress.set(address.toLowerCase(), symbol)
  }
}

/**
 * Look up a single token's ticker. Returns undefined when the token has not
 * been registered (the caller cannot form a market symbol for it).
 */
export function tokenSymbol(address: Address): string | undefined {
  return symbolByAddress.get(address.toLowerCase())
}

/**
 * Resolve the CLOB market symbol for a swap. The market is named base-quote in
 * canonical V4 currency order (currency0 = lower address = base), so the symbol
 * is stable regardless of swap direction. Returns null when either side is
 * unregistered.
 */
export function resolveMarketSymbol(tokenIn: Address, tokenOut: Address): string | null {
  const [base, quote] =
    tokenIn.toLowerCase() < tokenOut.toLowerCase() ? [tokenIn, tokenOut] : [tokenOut, tokenIn]
  const baseSym = tokenSymbol(base)
  const quoteSym = tokenSymbol(quote)
  if (!baseSym || !quoteSym) return null
  return `${baseSym}-${quoteSym}`
}
