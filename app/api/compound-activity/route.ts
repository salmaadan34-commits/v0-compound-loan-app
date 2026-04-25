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
    WETH: 3200, WBTC: 65000, USDC: 1, USDT: 1, COMP: 85,
  }

  // Deterministic PRNG seeded from address
  const seed = parseInt(address.slice(2, 10), 16) || 1
  let rng = seed >>> 0
  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
    return rng / 0xffffffff
  }

  // ── Risk scenario: determined by address seed ─────────────────────────────
  // 0 = HEALTHY  (~35–45% LTV)
  // 1 = MONITOR  (~52–60% LTV)
  // 2 = AT-RISK  (~68–75% LTV)
  // 3 = CRITICAL (~82–90% LTV)
  const scenario = seed % 4

  // Target debt-to-collateral ratios by scenario
  const targetLtv = [0.40, 0.56, 0.71, 0.86][scenario]

  const events: CompoundEvent[] = []
  const baseDate = new Date("2021-01-15")
  let day = 0
  let eventIdx = 0

  // Running balances (prevent negatives)
  const collateralBalance: Record<string, number> = {}
  const debtBalance: Record<string, number> = {}

  const advance = (minDays: number, maxDays: number) => {
    day += minDays + Math.floor(rand() * (maxDays - minDays + 1))
  }

  const makeEvent = (
    accountType: AccountType,
    activity: ActivityType,
    eventName: EventName,
    asset: string,
    amountUsd: number,
  ): CompoundEvent => {
    const price = assetPrices[asset]
    const amount = (amountUsd / price).toFixed(6)
    const timestamp = new Date(baseDate.getTime() + day * 86400000).toISOString()
    const blockNumber = (12500000 + day * 45 + eventIdx).toString()
    const h = ((seed ^ (eventIdx * 2654435761)) >>> 0).toString(16).padStart(64, "0")
    eventIdx++
    return {
      id: `0x${h.slice(0, 64)}-${eventIdx}`,
      blockNumber, timestamp,
      transactionHash: `0x${h.slice(0, 64)}`,
      accountType, activity, eventName, asset,
      amount, amountUsd: amountUsd.toFixed(2),
    }
  }

  // ── PHASE 1 (Month 1): Initial collateral deposits ────────────────────────
  // Three collateral assets — amounts depend on scenario
  const baseCollateral = 300000 + Math.floor(rand() * 100000)  // $300k–$400k

  advance(0, 5)
  const usdc1 = Math.floor(baseCollateral * 0.5)
  collateralBalance.USDC = usdc1
  events.push(makeEvent("collateral", "deposit", "Mint", "USDC", usdc1))

  advance(3, 10)
  const usdt1 = Math.floor(baseCollateral * 0.3)
  collateralBalance.USDT = usdt1
  events.push(makeEvent("collateral", "deposit", "Mint", "USDT", usdt1))

  advance(5, 15)
  const comp1 = Math.floor(baseCollateral * 0.2)
  collateralBalance.COMP = comp1
  events.push(makeEvent("collateral", "deposit", "Mint", "COMP", comp1))

  const totalCollateral0 = usdc1 + usdt1 + comp1

  // ── PHASE 2 (Month 2): First loan — WETH ─────────────────────────────────
  advance(10, 20)
  const wethDebt = Math.floor(totalCollateral0 * targetLtv * 0.55)
  debtBalance.WETH = wethDebt
  events.push(makeEvent("debt", "borrowing", "Borrow", "WETH", wethDebt))

  // ── PHASE 3 (Month 2–3): Second loan — WBTC ──────────────────────────────
  advance(15, 30)
  const wbtcDebt = Math.floor(totalCollateral0 * targetLtv * 0.45)
  debtBalance.WBTC = wbtcDebt
  events.push(makeEvent("debt", "borrowing", "Borrow", "WBTC", wbtcDebt))

  // ── PHASE 4 (Month 3): Top up collateral (healthy/monitor scenarios only) ─
  if (scenario <= 1) {
    advance(20, 35)
    const topUp = Math.floor(30000 + rand() * 50000)
    collateralBalance.USDC += topUp
    events.push(makeEvent("collateral", "deposit", "Mint", "USDC", topUp))
  }

  // ── PHASE 5 (Month 4): Partial WETH repayment ────────────────────────────
  advance(20, 40)
  const wethRepay = Math.floor(debtBalance.WETH * (0.15 + rand() * 0.20))
  debtBalance.WETH -= wethRepay
  events.push(makeEvent("debt", "repayment", "RepayBorrow", "WETH", wethRepay))

  // ── PHASE 6 (Month 4–5): Additional USDT collateral deposit ─────────────
  advance(15, 25)
  const usdt2 = Math.floor(20000 + rand() * 40000)
  collateralBalance.USDT += usdt2
  events.push(makeEvent("collateral", "deposit", "Mint", "USDT", usdt2))

  // ── PHASE 7 (Month 5): Top-up WETH borrow ────────────────────────────────
  advance(20, 35)
  const wethTopUp = Math.floor(wethDebt * (0.10 + rand() * 0.15))
  debtBalance.WETH += wethTopUp
  events.push(makeEvent("debt", "borrowing", "Borrow", "WETH", wethTopUp))

  // ── PHASE 8 (Month 6): Collateral withdrawal ─────────────────────────────
  // At-risk and critical scenarios withdraw more collateral → raises LTV
  const withdrawPct = scenario === 3 ? 0.30 + rand() * 0.15
    : scenario === 2 ? 0.15 + rand() * 0.10
    : 0.05 + rand() * 0.08

  advance(25, 40)
  const usdcWithdraw = Math.floor(collateralBalance.USDC * withdrawPct)
  if (usdcWithdraw > 0) {
    collateralBalance.USDC -= usdcWithdraw
    events.push(makeEvent("collateral", "redemption", "Redeem", "USDC", usdcWithdraw))
  }

  // ── PHASE 9 (Month 7): Partial WBTC repayment (healthy only) ─────────────
  if (scenario === 0) {
    advance(20, 35)
    const wbtcRepay = Math.floor(debtBalance.WBTC * (0.20 + rand() * 0.20))
    debtBalance.WBTC -= wbtcRepay
    events.push(makeEvent("debt", "repayment", "RepayBorrow", "WBTC", wbtcRepay))
  }

  // ── PHASE 10 (Month 7–8): Additional COMP deposit (monitor scenario) ──────
  if (scenario === 1) {
    advance(15, 30)
    const compTop = Math.floor(15000 + rand() * 25000)
    collateralBalance.COMP += compTop
    events.push(makeEvent("collateral", "deposit", "Mint", "COMP", compTop))
  }

  // ── PHASE 11 (Month 8): Critical scenario — borrow even more ─────────────
  if (scenario === 3) {
    advance(20, 35)
    const extraWeth = Math.floor(debtBalance.WETH * (0.20 + rand() * 0.15))
    debtBalance.WETH += extraWeth
    events.push(makeEvent("debt", "borrowing", "Borrow", "WETH", extraWeth))
  }

  // ── PHASE 12 (Month 9): Final USDT collateral withdrawal ─────────────────
  if (scenario >= 2) {
    advance(25, 45)
    const udtWithdraw = Math.floor(collateralBalance.USDT * (0.10 + rand() * 0.15))
    if (udtWithdraw > 0) {
      collateralBalance.USDT -= udtWithdraw
      events.push(makeEvent("collateral", "redemption", "Redeem", "USDT", udtWithdraw))
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
