import { describe, it, expect, beforeEach } from 'vitest'
import { OmnichainRouter, DexUnavailableError } from './router'
import { registerTokenSymbols, resolveMarketSymbol, tokenSymbol } from './symbols'
import { NATIVE_LUX } from '../precompile/types'
import type { ICLOBClient, OrderBook } from '../client/types'

const LUSD = '0x00000000000000000000000000000000000000aa' as const
const LETH = '0x00000000000000000000000000000000000000bb' as const

/** Minimal in-memory CLOB client stub serving a fixed book. */
function makeClient(opts: {
  connected?: boolean
  book?: Partial<OrderBook>
}): ICLOBClient {
  const connected = opts.connected ?? true
  const book: OrderBook = {
    symbol: 'X',
    bids: [],
    asks: [],
    timestamp: 0,
    ...opts.book,
  }
  return {
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => connected,
    authenticate: async () => {},
    placeOrder: async (o) => ({
      orderId: 'abc',
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      price: o.price ?? 0,
      size: o.size,
      filledSize: o.size,
      remainingSize: 0,
      status: 'filled',
      timeInForce: 'IOC',
      createdAt: 0,
      updatedAt: 0,
    }),
    cancelOrder: async () => {},
    getOrder: async () => {
      throw new Error('unused')
    },
    getOrders: async () => [],
    getOrderBook: async () => book,
    getTrades: async () => [],
    getPositions: async () => [],
    getBalances: async () => [],
    subscribeOrderBook: () => () => {},
    subscribeTrades: () => () => {},
    subscribeOrders: () => () => {},
  }
}

describe('symbol registry', () => {
  beforeEach(() => {
    registerTokenSymbols([
      [LUSD, 'LUSD'],
      [LETH, 'LETH'],
    ])
  })

  it('pre-registers native LUX as LUX', () => {
    expect(tokenSymbol(NATIVE_LUX)).toBe('LUX')
  })

  it('resolves a market symbol in canonical (sorted) currency order', () => {
    // address order: NATIVE_LUX(0x00..00) < LUSD(0x..aa) < LETH(0x..bb)
    expect(resolveMarketSymbol(NATIVE_LUX, LUSD)).toBe('LUX-LUSD')
    // direction-independent
    expect(resolveMarketSymbol(LUSD, NATIVE_LUX)).toBe('LUX-LUSD')
    expect(resolveMarketSymbol(LETH, LUSD)).toBe('LUSD-LETH')
  })

  it('returns null when a token is unregistered', () => {
    const unknown = '0x00000000000000000000000000000000000000cc' as const
    expect(resolveMarketSymbol(NATIVE_LUX, unknown)).toBeNull()
  })
})

describe('OmnichainRouter graceful degradation', () => {
  it('is unavailable with no client and throws DexUnavailableError on quote', async () => {
    const router = new OmnichainRouter()
    expect(router.isAvailable()).toBe(false)
    await expect(
      router.getQuote({ tokenIn: NATIVE_LUX, tokenOut: LUSD, amountIn: 10n ** 18n })
    ).rejects.toBeInstanceOf(DexUnavailableError)
  })

  it('is unavailable when the client is disconnected', () => {
    const router = new OmnichainRouter()
    router.setCLOBClient(makeClient({ connected: false }))
    expect(router.isAvailable()).toBe(false)
  })
})

describe('OmnichainRouter quotes from the book (not a curve)', () => {
  beforeEach(() => {
    registerTokenSymbols([[LUSD, 'LUSD']])
  })

  it('walks asks selling native LUX (token0) for LUSD (token1)', async () => {
    const router = new OmnichainRouter()
    // asks: best 2.0 LUSD/LUX for 5 LUX, then 2.1 for more.
    router.setCLOBClient(
      makeClient({
        book: {
          asks: [
            { price: 2.0, size: 5, count: 1 },
            { price: 2.1, size: 100, count: 1 },
          ],
        },
      })
    )

    // Sell 1 LUX -> expect 1 * 2.0 = 2.0 LUSD from the top level.
    const quote = await router.getQuote({
      tokenIn: NATIVE_LUX,
      tokenOut: LUSD,
      amountIn: 10n ** 18n,
    })
    expect(quote.amountOut).toBe(2n * 10n ** 18n)
    expect(quote.route[0].source).toBe('clob')
    expect(quote.route[0].symbol).toBe('LUX-LUSD')
    // minimumAmountOut applies slippage (default 0.5%).
    expect(quote.minimumAmountOut).toBeLessThan(quote.amountOut)
  })

  it('crosses multiple ask levels and reports price impact', async () => {
    const router = new OmnichainRouter()
    router.setCLOBClient(
      makeClient({
        book: {
          asks: [
            { price: 2.0, size: 1, count: 1 }, // 1 LUX @ 2.0
            { price: 4.0, size: 10, count: 1 }, // next LUX @ 4.0
          ],
        },
      })
    )
    // Sell 2 LUX: 1@2.0 + 1@4.0 = 6 LUSD; avg 3.0 vs best 2.0 -> +5000 bps impact.
    const quote = await router.getQuote({
      tokenIn: NATIVE_LUX,
      tokenOut: LUSD,
      amountIn: 2n * 10n ** 18n,
    })
    expect(quote.amountOut).toBe(6n * 10n ** 18n)
    expect(quote.priceImpact).toBe(5000)
  })

  it('throws "no liquidity" when the relevant side is empty', async () => {
    const router = new OmnichainRouter()
    router.setCLOBClient(makeClient({ book: { asks: [] } }))
    await expect(
      router.getQuote({ tokenIn: NATIVE_LUX, tokenOut: LUSD, amountIn: 10n ** 18n })
    ).rejects.toThrow(/no liquidity/i)
  })
})
