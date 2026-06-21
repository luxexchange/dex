/**
 * CLOB Router
 *
 * The Lux V4 venue (precompile 0x9010) is a CENTRAL LIMIT ORDER BOOK behind a
 * V4 PoolManager facade — NOT a constant-product/concentrated-liquidity AMM.
 * So a quote is the marketable price obtained by walking the resting book, and
 * a swap is a marketable order against that book (on-chain via 0x9010 `swap`,
 * or off-chain via the venue's order endpoint). Price comes from the book; there
 * is no bonding curve.
 *
 * The book itself is served by the venue's D-Chain DEX gateway over the
 * `ICLOBClient` (WebSocket). When no gateway is configured the venue precompile
 * is inert (it reverts `dex: backend not configured`), so this router has no
 * book to quote against and returns null — callers MUST degrade gracefully.
 *
 * @see ~/work/lux/precompile/dex/engine_zap.go — the 0x9010 → D-Chain CLOB adapter
 * @see dex-architecture-canonical — V4 = CLOB, native LUX = address(0)
 */
import type { Address } from 'viem'
import { resolveMarketSymbol } from './symbols'
import type { ICLOBClient } from '../client/types'
import type {
  RouterConfig,
  QuoteRequest,
  Quote,
  RouteStep,
  SwapRequest,
  SwapResult,
} from './types'

const DEFAULT_CONFIG: RouterConfig = {
  clobEnabled: true,
  maxHops: 1,
  preferCLOB: true,
}

/**
 * Error thrown when a swap/quote is requested but the venue DEX (the D-Chain
 * CLOB gateway) is not configured/connected. Callers should catch this and show
 * a "trading unavailable" state rather than surfacing a raw revert.
 */
export class DexUnavailableError extends Error {
  constructor(message = 'DEX backend not configured: no order book available') {
    super(message)
    this.name = 'DexUnavailableError'
  }
}

/**
 * CLOB Router — quotes and routes marketable orders against the resting book.
 */
export class OmnichainRouter {
  private config: RouterConfig
  private clobClient: ICLOBClient | null = null

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Attach the CLOB client (the venue D-Chain gateway). Pass null to detach,
   * which puts the router into the gracefully-degraded "DEX unavailable" state.
   */
  setCLOBClient(client: ICLOBClient | null) {
    this.clobClient = client
  }

  /**
   * True when the venue book is reachable. The UI uses this to decide whether
   * to enable trading or show a "DEX unavailable" state.
   */
  isAvailable(): boolean {
    return (
      (this.config.clobEnabled ?? true) &&
      this.clobClient !== null &&
      this.clobClient.isConnected()
    )
  }

  /**
   * Get a quote for a marketable swap by walking the resting order book.
   *
   * @throws {DexUnavailableError} when no book is reachable (degraded venue).
   */
  async getQuote(request: QuoteRequest): Promise<Quote> {
    const { tokenIn, tokenOut, amountIn, slippageTolerance = 50 } = request

    if (!this.isAvailable()) {
      throw new DexUnavailableError()
    }

    const quote = await this.getCLOBQuote(tokenIn, tokenOut, amountIn)
    if (!quote) {
      throw new Error('No liquidity in book for this market')
    }

    const minimumAmountOut =
      quote.amountOut - (quote.amountOut * BigInt(slippageTolerance)) / 10000n

    return {
      ...quote,
      minimumAmountOut,
      validUntil: Date.now() + 10000, // book moves fast — short quote life
    }
  }

  /**
   * Quote by walking the book. Price comes from resting depth, not a curve.
   */
  private async getCLOBQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint
  ): Promise<Quote | null> {
    if (!this.clobClient || !this.clobClient.isConnected()) return null

    const symbol = resolveMarketSymbol(tokenIn, tokenOut)
    if (!symbol) return null

    const orderBook = await this.clobClient.getOrderBook(symbol, 50)

    // currency0 = lower address (V4 sort). Selling token0 lifts asks; selling
    // token1 hits bids.
    const zeroForOne = tokenIn.toLowerCase() < tokenOut.toLowerCase()
    const levels = zeroForOne ? orderBook.asks : orderBook.bids
    if (levels.length === 0) return null

    let remainingIn = amountIn
    let totalOut = 0n
    for (const level of levels) {
      if (remainingIn <= 0n) break
      const levelSize = BigInt(Math.floor(level.size * 1e18))
      const levelPrice = BigInt(Math.floor(level.price * 1e18))
      if (levelPrice === 0n) continue

      const fillSize = remainingIn < levelSize ? remainingIn : levelSize
      // price is quote-per-base (token1 per token0).
      const fillOut = zeroForOne
        ? (fillSize * levelPrice) / 10n ** 18n // sell base -> receive quote
        : (fillSize * 10n ** 18n) / levelPrice // sell quote -> receive base
      totalOut += fillOut
      remainingIn -= fillSize
    }

    if (totalOut === 0n) return null

    // Price impact = how far the realized execution rate moved away from the
    // top-of-book rate, in bps, always positive (adverse). Rates are expressed
    // in consistent quote-per-base terms (the level price is quote-per-base).
    //   zeroForOne (sell base): realized = out/in; worse fills => lower rate.
    //   !zeroForOne (buy base):  realized = in/out; worse fills => higher rate.
    const bestPrice = BigInt(Math.floor((levels[0]?.price ?? 0) * 1e18))
    const realizedRate = zeroForOne
      ? (totalOut * 10n ** 18n) / amountIn
      : (amountIn * 10n ** 18n) / totalOut
    const deviation = realizedRate >= bestPrice ? realizedRate - bestPrice : bestPrice - realizedRate
    const priceImpact = bestPrice > 0n ? Number((deviation * 10000n) / bestPrice) : 0

    const step: RouteStep = {
      source: 'clob',
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: totalOut,
      symbol,
      fee: (amountIn * 30n) / 10000n, // indicative 0.3% taker fee
      priceImpact,
    }

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: totalOut,
      minimumAmountOut: totalOut,
      route: [step],
      priceImpact,
      estimatedGas: 0n, // CLOB matching is off-chain; on-chain settle gas added by the swap hook
      validUntil: Date.now() + 10000,
    }
  }

  /**
   * Execute a swap off-chain against the book (marketable order). The on-chain
   * path (0x9010 `swap`) is driven by the wallet via the `useSwap` hook; this
   * method covers the off-chain venue-relay path used when the caller holds a
   * venue session rather than signing an EVM tx.
   *
   * @throws {DexUnavailableError} when no book is reachable.
   */
  async executeSwap(request: SwapRequest): Promise<SwapResult> {
    const { quote } = request

    if (Date.now() > quote.validUntil) {
      throw new Error('Quote expired')
    }
    if (!this.clobClient) {
      throw new DexUnavailableError('CLOB client not configured')
    }

    const step = quote.route[0]
    if (!step?.symbol) {
      throw new Error('Invalid CLOB route')
    }

    const order = await this.clobClient.placeOrder({
      symbol: step.symbol,
      side: step.tokenIn.toLowerCase() < step.tokenOut.toLowerCase() ? 'buy' : 'sell',
      type: 'market',
      size: Number(quote.amountIn) / 1e18,
    })

    return {
      txHash: `0x${order.orderId}` as `0x${string}`,
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      route: quote.route,
    }
  }
}

/**
 * Create a CLOB router instance.
 */
export function createRouter(config?: Partial<RouterConfig>): OmnichainRouter {
  return new OmnichainRouter(config)
}
