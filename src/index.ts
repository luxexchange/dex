/**
 * @luxfi/dex
 *
 * LX Integration Package
 *
 * Native precompile integration for Lux DEX stack:
 * - LXPool (LP-9010): V4 PoolManager facade over a CENTRAL LIMIT ORDER BOOK
 *   (NOT an AMM). swap = marketable order, modifyLiquidity = place/cancel a
 *   resting limit order, initialize = create the market. Inert until the venue
 *   sets dex-zap-endpoint; price comes from the book, not a bonding curve.
 * - LXOracle (LP-9011): Multi-source price aggregation
 * - LXRouter (LP-9012): internal V2/V3/V4 router (non-ABI wire format; not for
 *   direct viem calls — swap on 0x9010 instead)
 * - LXHooks (LP-9013): Hook contract registry
 * - LXFlash (LP-9014): Flash loan facility
 * - LXBook (LP-9020): standalone CLOB matching engine (Hyperliquid-style execute)
 * - LXVault (LP-9030): Custody and margin engine
 * - LXFeed (LP-9040): Mark price and funding feeds
 *
 * Architecture (V4 = CLOB; settlement is on the D-Chain over ZAP):
 * ```
 *   Wallet (viem/wagmi)                 CLOBClient (WebSocket)
 *         │ swap / modifyLiquidity            │ book / trades / orders
 *         ▼ (standard V4 ABI)                 ▼
 *   ┌──────────────┐                   ┌──────────────────┐
 *   │   LXPool     │  0x9010           │  D-Chain DEX      │
 *   │  V4 facade   │ ───── ZAP ──────▶ │  gateway (book)   │
 *   │  over a CLOB │   clob_submit/    │  source of truth  │
 *   └──────────────┘   place/cancel    └──────────────────┘
 *         ▲ inert unless dex-zap-endpoint is set (degrade gracefully)
 *
 *   Standalone (separate addresses, Hyperliquid-style):
 *     LXBook 0x9020  · LXVault 0x9030  · LXFeed 0x9040  · LXOracle 0x9011
 * ```
 */

// =============================================================================
// Precompile Types, ABIs, and Addresses
// =============================================================================

export {
  // V4 PoolManager Types (LP-9010, CLOB facade)
  type Currency,
  type PoolKey,
  type BalanceDelta,
  type SwapParams,
  type ModifyLiquidityParams,
  type PoolState,
  type Position as AMMPosition,
  NATIVE_LUX,
  sortCurrencies,
  createPoolKey,
  buildSwapCall,
  unpackBalanceDelta,

  // LXBook Types (LP-9020)
  TIF,
  OrderKind,
  GroupType,
  ActionType,
  type LXOrder,
  type LXAction,
  type LXPlaceResult,
  type LXL1,

  // LXVault Types (LP-9030)
  MarginMode,
  PositionSide,
  type LXAccount,
  type LXPosition,
  type LXMarginInfo,
  type LXSettlement,
  type LXLiquidationResult,

  // LXFeed Types (LP-9040)
  type LXMarkPrice,
  type LXFundingRate,

  // AMM ABIs
  POOL_MANAGER_ABI,
  SWAP_ROUTER_ABI,
  HOOKS_REGISTRY_ABI,
  FLASH_LOAN_ABI,

  // LX* ABIs
  LX_BOOK_ABI,
  LX_VAULT_ABI,
  LX_FEED_ABI,
  LX_ORACLE_ABI,

  // Addresses
  LX,
  DEX_PRECOMPILES,
  type LxdexPrecompile,
  type DexPrecompile,
  fromLP,
  toLP,
  isLXPrecompile,
  isBridgePrecompile,
} from './precompile'

// =============================================================================
// CLOB Client (External ~/work/lux/dex integration)
// =============================================================================

export {
  type OrderSide,
  type OrderType,
  type OrderStatus,
  type TimeInForce,
  type OrderRequest,
  type Order,
  type OrderBookEntry,
  type OrderBook,
  type Trade,
  type Position as CLOBPosition,
  type Balance,
  type ICLOBClient,
  CLOBClient,
  createCLOBClient,
} from './client'

// =============================================================================
// Omnichain Router
// =============================================================================

export * from './router'

// =============================================================================
// React Hooks
// =============================================================================

export * from './hooks'
