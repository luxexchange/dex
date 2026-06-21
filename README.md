# @luxfi/dex

Lux DEX SDK — V4 CLOB precompiles, order book client, and routing.

TypeScript SDK for the Lux DEX stack. The V4 surface is a **central limit order
book (CLOB)**, not an AMM: `swap` is a marketable order, `modifyLiquidity`
places/cancels a resting limit order, and price comes from the book rather than
a bonding curve. Settlement happens on the D-Chain over ZAP.

## Install

```bash
pnpm add @luxfi/dex
```

Peer dependency: `react@19`. Runtime dependencies: `viem`, `wagmi`, `zustand`.

## Exports

| Subpath | Contents |
|---------|----------|
| `@luxfi/dex` | Everything below, re-exported |
| `@luxfi/dex/precompile` | Precompile types, ABIs, and addresses (LXPool, LXOracle, LXRouter, LXHooks, LXFlash, LXBook, LXVault, LXFeed) |
| `@luxfi/dex/client` | `CLOBClient` — WebSocket order book client (book / trades / orders) |
| `@luxfi/dex/router` | Omnichain swap router and symbol resolution |
| `@luxfi/dex/hooks` | React hooks — `useSwap`, `useQuote`, `useLxbook`, `useLxvault`, `useLxfeed` |

## Precompiles

| Contract | Slot | Role |
|----------|------|------|
| LXPool   | `0x9010` | V4 PoolManager facade over a CLOB |
| LXOracle | `0x9011` | Multi-source price aggregation |
| LXRouter | `0x9012` | Internal V2/V3/V4 router (non-ABI wire format) |
| LXHooks  | `0x9013` | Hook contract registry |
| LXFlash  | `0x9014` | Flash loan facility |
| LXBook   | `0x9020` | Standalone CLOB matching engine |
| LXVault  | `0x9030` | Custody and margin engine |
| LXFeed   | `0x9040` | Mark price and funding feeds |

The LXPool facade exposes the standard V4 ABI so existing viem/wagmi tooling
works unchanged; the `PoolKey`/`SwapParams` shapes mirror Uniswap V4 for ABI
compatibility, but the curve scalars (`sqrtPrice`/`tick`) are facade values and
fills come from the resting book. The facade is inert until the venue sets a
`dex-zap-endpoint`, degrading gracefully when unset.

## Develop

```bash
pnpm install
pnpm typecheck    # tsc --noEmit
pnpm build        # tsc -> dist/
pnpm test         # vitest run
```

## License

BSD-3-Clause © 2020-2026 Lux Industries, Inc. See [LICENSE](./LICENSE).
