/**
 * Router Types
 * Types for CLOB routing. The Lux V4 venue is a central limit order book, so
 * liquidity is resting orders and the only route source is the book.
 */
import type { Address } from 'viem'

/**
 * Route source — liquidity is the V4 CLOB (resting orders on the D-Chain book).
 */
export type RouteSource = 'clob'

/**
 * Quote request
 */
export interface QuoteRequest {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  slippageTolerance?: number // basis points (default 50 = 0.5%)
  preferredSource?: RouteSource
}

/**
 * Route step
 */
export interface RouteStep {
  source: RouteSource
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  amountOut: bigint
  symbol?: string // CLOB market symbol (e.g. "LUX-LUSD")
  fee: bigint
  priceImpact: number // basis points
}

/**
 * Quote response
 */
export interface Quote {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  amountOut: bigint
  minimumAmountOut: bigint
  route: RouteStep[]
  priceImpact: number // total price impact in basis points
  estimatedGas: bigint
  validUntil: number // timestamp
}

/**
 * Swap request
 */
export interface SwapRequest {
  quote: Quote
  recipient: Address
  deadline?: number
}

/**
 * Swap result
 */
export interface SwapResult {
  txHash: `0x${string}`
  amountIn: bigint
  amountOut: bigint
  route: RouteStep[]
}

/**
 * Router configuration
 */
export interface RouterConfig {
  // CLOB connection
  clobUrl?: string
  clobEnabled?: boolean

  // Routing preferences
  maxHops?: number // reserved for multi-hop book routing (currently single-hop)
  preferCLOB?: boolean // retained for API stability; the only source is the book
}
