import { describe, it, expect } from 'vitest'
import { unpackBalanceDelta, createPoolKey, buildSwapCall, NATIVE_LUX } from './types'

describe('unpackBalanceDelta', () => {
  // The precompile packs two signed int128 halves into one 256-bit word:
  // amount0 in the high 128 bits, amount1 in the low 128 bits.
  const pack = (a0: bigint, a1: bigint): bigint => {
    const mask = (1n << 128n) - 1n
    const lo = a1 < 0n ? a1 + (1n << 128n) : a1
    const hi = a0 < 0n ? a0 + (1n << 128n) : a0
    return ((hi & mask) << 128n) | (lo & mask)
  }

  it('round-trips a positive/negative pair (caller owes token0, pool owes token1)', () => {
    const packed = pack(1000n, -995n)
    expect(unpackBalanceDelta(packed)).toEqual({ amount0: 1000n, amount1: -995n })
  })

  it('round-trips negative/positive (pool owes token0, caller owes token1)', () => {
    const packed = pack(-500n, 480n)
    expect(unpackBalanceDelta(packed)).toEqual({ amount0: -500n, amount1: 480n })
  })

  it('handles zero', () => {
    expect(unpackBalanceDelta(0n)).toEqual({ amount0: 0n, amount1: 0n })
  })

  it('handles int128 extremes', () => {
    const maxI128 = (1n << 127n) - 1n
    const minI128 = -(1n << 127n)
    expect(unpackBalanceDelta(pack(maxI128, minI128))).toEqual({
      amount0: maxI128,
      amount1: minI128,
    })
  })

  it('does NOT equal a naive single-int256 read (regression guard)', () => {
    // If decoded as one int256, pack(1000, -995) is a huge number — proving the
    // old `int256` decode produced garbage.
    const packed = pack(1000n, -995n)
    const naiveI256 = packed // viem would hand back this bigint for an int256 output
    expect(naiveI256).not.toBe(-995n)
    expect(unpackBalanceDelta(packed).amount1).toBe(-995n)
  })
})

describe('createPoolKey', () => {
  it('sorts currencies so currency0 < currency1', () => {
    const hi = '0x0000000000000000000000000000000000000002' as const
    const lo = '0x0000000000000000000000000000000000000001' as const
    const key = createPoolKey(hi, lo)
    expect(key.currency0).toBe(lo)
    expect(key.currency1).toBe(hi)
  })

  it('keeps native LUX (address(0)) as currency0', () => {
    const token = '0x00000000000000000000000000000000000000ff' as const
    const key = createPoolKey(token, NATIVE_LUX)
    expect(key.currency0).toBe(NATIVE_LUX)
    expect(key.currency1).toBe(token)
  })
})

describe('buildSwapCall', () => {
  const low = '0x0000000000000000000000000000000000000001' as const
  const high = '0x0000000000000000000000000000000000000002' as const

  it('encodes exact-input with a positive amountSpecified and empty hookData', () => {
    const { params, hookData } = buildSwapCall(low, high, 1_000n)
    expect(params.amountSpecified).toBe(1_000n)
    expect(params.sqrtPriceLimitX96).toBe(0n)
    expect(hookData).toBe('0x')
  })

  it('sets zeroForOne when selling the lower-address token (currency0)', () => {
    const { key, params } = buildSwapCall(low, high, 1n)
    expect(key.currency0).toBe(low)
    expect(params.zeroForOne).toBe(true)
  })

  it('clears zeroForOne when selling the higher-address token (currency1)', () => {
    const { key, params } = buildSwapCall(high, low, 1n)
    expect(key.currency0).toBe(low)
    expect(params.zeroForOne).toBe(false)
  })

  it('treats native LUX (address(0)) as currency0 / zeroForOne when input', () => {
    const { key, params } = buildSwapCall(NATIVE_LUX, high, 5n)
    expect(key.currency0).toBe(NATIVE_LUX)
    expect(params.zeroForOne).toBe(true)
  })
})
