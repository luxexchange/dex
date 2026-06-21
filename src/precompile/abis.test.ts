import { describe, it, expect } from 'vitest'
import { toFunctionSelector, toFunctionSignature } from 'viem'
import { POOL_MANAGER_ABI } from './abis'

/**
 * The precompile at 0x9010 dispatches on keccak256(canonicalSig)[:4]
 * (see lux/precompile/dex/module.go). These selectors are the on-chain
 * contract; any drift means a call reverts "unknown method selector".
 */
const ON_CHAIN_SELECTORS: Record<string, `0x${string}`> = {
  initialize: '0x6276cbbe',
  swap: '0xf3cd914c',
  modifyLiquidity: '0x5a6bcfda',
  settle: '0x11da60b4',
  settleFor: '0x3dd45adb',
  take: '0x0b0d9c09',
}

describe('POOL_MANAGER_ABI selectors match the on-chain precompile (0x9010)', () => {
  for (const [name, expected] of Object.entries(ON_CHAIN_SELECTORS)) {
    it(`${name} → ${expected}`, () => {
      const fn = POOL_MANAGER_ABI.find((x) => x.type === 'function' && x.name === name)
      expect(fn, `${name} missing from ABI`).toBeTruthy()
      expect(toFunctionSelector(fn as never)).toBe(expected)
    })
  }

  it('settle takes no args (regression: the old settle(address) hashed to 0x6a256b29 and reverted)', () => {
    const settle = POOL_MANAGER_ABI.find((x) => x.type === 'function' && x.name === 'settle')
    expect(toFunctionSignature(settle as never)).toBe('settle()')
    expect(toFunctionSelector(settle as never)).not.toBe('0x6a256b29')
  })

  it('settleFor is the single-address settle variant', () => {
    const settleFor = POOL_MANAGER_ABI.find((x) => x.type === 'function' && x.name === 'settleFor')
    expect(toFunctionSignature(settleFor as never)).toBe('settleFor(address)')
  })
})
