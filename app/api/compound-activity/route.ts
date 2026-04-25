import { NextRequest, NextResponse } from "next/server"
import { kryptosFetch } from "@/lib/kryptos"

type AccountType = "collateral" | "debt"
type ActivityType = "deposit" | "redemption" | "borrowing" | "repayment" | "liquidation" | "interest"
type EventName = "Mint" | "Redeem" | "Borrow" | "RepayBorrow" | "LiquidateBorrow"

type CompoundEvent = {
  id: string
  blockNumber: string
  timestamp: string
  transactionHash: string
  accountType: AccountType
  activity: ActivityType
  eventName: EventName
  asset: string
  amount: string
  amountUsd: string
}

const USE_KRYPTOS = process.env.KRYPTOS_ENABLED === "true"

type EventMapping = {
  accountType: AccountType
  activity: ActivityType
  eventName: EventName
}

const EVENT_MAP: Record<string, EventMapping> = {
  mint: { accountType: "collateral", activity: "deposit", eventName: "Mint" },
  supply: { accountType: "collateral", activity: "deposit", eventName: "Mint" },
  deposit: { accountType: "collateral", activity: "deposit", eventName: "Mint" },
  redeem: { accountType: "collateral", activity: "redemption", eventName: "Redeem" },
  withdraw: { accountType: "collateral", activity: "redemption", eventName: "Redeem" },
  redemption: { accountType: "collateral", activity: "redemption", eventName: "Redeem" },
  borrow: { accountType: "debt", activity: "borrowing", eventName: "Borrow" },
  borrowing: { accountType: "debt", activity: "borrowing", eventName: "Borrow" },
  repay: { accountType: "debt", activity: "repayment", eventName: "RepayBorrow" },
  repayment: { accountType: "debt", activity: "repayment", eventName: "RepayBorrow" },
  liquidate: { accountType: "collateral", activity: "liquidation", eventName: "LiquidateBorrow" },
  liquidation: { accountType: "collateral", activity: "liquidation", eventName: "LiquidateBorrow" },
}

function mapEventType(raw: string): EventMapping | null {
  const value = raw.toLowerCase()
  for (const [key, mapped] of Object.entries(EVENT_MAP)) {
    if (value.includes(key)) return mapped
  }
  return null
}

function toCompoundEvent(tx: any): CompoundEvent | null {
  const protocol = String(
    tx.protocol ?? tx.protocol_name ?? tx.protocolMarket ?? tx.platform ?? ""
  ).toLowerCase()

  if (!protocol.includes("compound")) return null

  const rawType = String(
    tx.activity_type ?? tx.type ?? tx.category ?? tx.event_name ?? ""
  )

  const mapping = mapEventType(rawType)
  if (!mapping) return null

  return {
    id: String(tx.id ?? `${tx.tx_hash ?? tx.transaction_hash}-${tx.event_index ?? 0}`),
    blockNumber: String(tx.block_number ?? ""),
    timestamp: String(tx.block_timestamp ?? tx.timestamp ?? ""),
    transactionHash: String(tx.tx_hash ?? tx.transaction_hash ?? ""),
    accountType: mapping.accountType,
    activity: mapping.activity,
    eventName: mapping.eventName,
    asset: String(tx.token_symbol ?? tx.asset_symbol ?? tx.symbol ?? "UNKNOWN"),
    amount: String(tx.amount ?? 0),
    amountUsd: String(tx.amount_usd ?? tx.usd_value ?? 0),
  }
}

function generateMockCompoundEvents(address: string): CompoundEvent[] {
  const assetPrices: Record<string, number> = {
    WETH: 3200,
    WBTC: 65000,
    USDC: 1,
    USDT: 1,
    COMP: 85,
  }

  // Deterministic pseudo-random from seed
  const seed = parseInt(address.slice(2, 10), 16)
  let rng = seed
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff
    return Math.abs(rng) / 0xffffffff
  }

  const events: CompoundEvent[] = []
  const baseDate = new Date("2021-02-19")
  let day = 0

  // Running balances to prevent negative positions
  const collateralBalance: Record<string, number> = {}
  const debtBalance: Record<string, number> = {}

  const makeEvent = (
    i: number,
    accountType: AccountType,
    activity: ActivityType,
    eventName: EventName,
    asset: string,
    amountUsd: number,
  ): CompoundEvent => {
    const price = assetPrices[asset]
    const amount = (amountUsd / price).toFixed(6)
    day += Math.floor(rand() * 12) + 3          // 3–14 days between events
    const timestamp = new Date(baseDate.getTime() + day * 86400000).toISOString()
    const blockNumber = (12000000 + day * 50 + i).toString()
    const txHashSeed = ((seed ^ (i * 2654435761)) >>> 0).toString(16).padStart(64, "0")
    return {
      id: `0x${txHashSeed.slice(0, 64)}-${i}`,
      blockNumber,
      timestamp,
      transactionHash: `0x${txHashSeed.slice(0, 64)}`,
      accountType,
      activity,
      eventName,
      asset,
      amount,
      amountUsd: amountUsd.toFixed(2),
    }
  }

  let i = 0

  // ── Phase 1: deposit collateral (2–3 deposits, $50k–$200k each) ──────────
  const collateralAssets = ["USDC", "USDT", "COMP"]
  const numDeposits = 2 + (seed % 2)
  for (let d = 0; d < numDeposits; d++) {
    const asset = collateralAssets[d % collateralAssets.length]
    const usd = 50000 + Math.floor(rand() * 150000)
    collateralBalance[asset] = (collateralBalance[asset] || 0) + usd
    events.push(makeEvent(i++, "collateral", "deposit", "Mint", asset, usd))
  }

  // ── Phase 2: borrow (1–2 loans, at most 60% of collateral value each) ────
  const totalCollateral = Object.values(collateralBalance).reduce((s, v) => s + v, 0)
  const debtAssets = ["WETH", "WBTC"]
  const numBorrows = 1 + (seed % 2)
  for (let b = 0; b < numBorrows; b++) {
    const asset = debtAssets[b % debtAssets.length]
    const maxBorrow = totalCollateral * 0.55 / numBorrows
    const usd = Math.floor(rand() * maxBorrow * 0.6) + maxBorrow * 0.3
    debtBalance[asset] = (debtBalance[asset] || 0) + usd
    events.push(makeEvent(i++, "debt", "borrowing", "Borrow", asset, usd))
  }

  // ── Phase 3: add more collateral (optional, 50% chance) ──────────────────
  if (rand() > 0.5) {
    const asset = collateralAssets[Math.floor(rand() * collateralAssets.length)]
    const usd = 20000 + Math.floor(rand() * 60000)
    collateralBalance[asset] = (collateralBalance[asset] || 0) + usd
    events.push(makeEvent(i++, "collateral", "deposit", "Mint", asset, usd))
  }

  // ── Phase 4: partial repayments (never exceed outstanding debt) ───────────
  for (const [asset, balance] of Object.entries(debtBalance)) {
    if (balance > 0 && rand() > 0.4) {
      const usd = Math.floor(balance * (0.1 + rand() * 0.3))   // repay 10–40%
      debtBalance[asset] -= usd
      events.push(makeEvent(i++, "debt", "repayment", "RepayBorrow", asset, usd))
    }
  }

  // ── Phase 5: partial collateral withdrawal (never exceed balance) ─────────
  for (const [asset, balance] of Object.entries(collateralBalance)) {
    if (balance > 0 && rand() > 0.6) {
      const usd = Math.floor(balance * (0.05 + rand() * 0.2))  // withdraw 5–25%
      collateralBalance[asset] -= usd
      events.push(makeEvent(i++, "collateral", "redemption", "Redeem", asset, usd))
    }
  }

  // ── Phase 6: second borrow top-up (optional) ─────────────────────────────
  if (rand() > 0.6) {
    const asset = debtAssets[Math.floor(rand() * debtAssets.length)]
    const remainingDebt = Object.values(debtBalance).reduce((s, v) => s + v, 0)
    const remainingCollateral = Object.values(collateralBalance).reduce((s, v) => s + v, 0)
    const headroom = remainingCollateral * 0.75 - remainingDebt
    if (headroom > 5000) {
      const usd = Math.floor(headroom * 0.3)
      debtBalance[asset] = (debtBalance[asset] || 0) + usd
      events.push(makeEvent(i++, "debt", "borrowing", "Borrow", asset, usd))
    }
  }

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 })
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 })
  }

  if (!USE_KRYPTOS) {
    return NextResponse.json({
      events: generateMockCompoundEvents(address),
      source: "mock",
    })
  }

  try {
    const txResponse = await kryptosFetch<any>("/transactions", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: address,
      }),
    })

    const rawTxs = Array.isArray(txResponse?.data)
      ? txResponse.data
      : Array.isArray(txResponse?.transactions)
        ? txResponse.transactions
        : Array.isArray(txResponse)
          ? txResponse
          : []

    const events = rawTxs
      .map(toCompoundEvent)
      .filter(Boolean)
      .sort(
        (a: CompoundEvent | null, b: CompoundEvent | null) =>
          new Date(b!.timestamp).getTime() - new Date(a!.timestamp).getTime()
      )

    return NextResponse.json({
      events,
      source: "kryptos",
    })
  } catch (error) {
    console.error("[v0] Kryptos compound activity error:", error)

    return NextResponse.json({
      events: generateMockCompoundEvents(address),
      source: "mock-fallback",
      upstreamError: error instanceof Error ? error.message : "Unknown Kryptos error",
    })
  }
}
