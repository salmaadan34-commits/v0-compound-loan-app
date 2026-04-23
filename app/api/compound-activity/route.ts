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
    WETH: 3200, USDC: 1, COMP: 85, WBTC: 65000, USDT: 1,
  }

  const seed = parseInt(address.slice(2, 10), 16)
  // Deterministic RNG from seed
  const rng = (salt: number, min: number, max: number): number => {
    const h = ((seed ^ (salt * 2654435761)) >>> 0)
    return min + (h % (max - min + 1))
  }

  const events: CompoundEvent[] = []
  let dayOffset = 0
  let idx = 0

  const push = (mapping: EventMapping, asset: string, amount: number) => {
    dayOffset += rng(idx * 7, 5, 20)
    const price = assetPrices[asset] ?? 1
    const amountUsd = (amount * price).toFixed(2)
    const ts = new Date(new Date("2023-01-10").getTime() + dayOffset * 86400000).toISOString()
    const txHash = ((seed ^ (idx * 997)) >>> 0).toString(16).padStart(64, "0")
    events.push({
      id: `${txHash}-${idx}`,
      blockNumber: (16000000 + dayOffset * 50).toString(),
      timestamp: ts,
      transactionHash: `0x${txHash}`,
      accountType: mapping.accountType,
      activity: mapping.activity,
      eventName: mapping.eventName,
      asset,
      amount: amount.toFixed(6),
      amountUsd,
    })
    idx++
  }

  // Running balances — enforce realistic constraints
  const collBal: Record<string, number> = {}
  const debtBal: Record<string, number> = {}

  const collateralUsd = () =>
    Object.entries(collBal).reduce((s, [a, v]) => s + v * (assetPrices[a] ?? 1), 0)
  const debtUsd = () =>
    Object.entries(debtBal).reduce((s, [a, v]) => s + v * (assetPrices[a] ?? 1), 0)

  const collAsset = rng(1, 0, 1) === 0 ? "USDC" : "USDT"
  const debtAsset = rng(2, 0, 1) === 0 ? "WETH" : "WBTC"

  // 1. First deposit
  const dep1 = rng(3, 20000, 80000)
  collBal[collAsset] = dep1
  push({ accountType: "collateral", activity: "deposit", eventName: "Mint" }, collAsset, dep1)

  // 2. Optional second deposit
  if (rng(4, 0, 2) > 0) {
    const dep2 = rng(5, 10000, 40000)
    collBal[collAsset] = (collBal[collAsset] ?? 0) + dep2
    push({ accountType: "collateral", activity: "deposit", eventName: "Mint" }, collAsset, dep2)
  }

  // 3. First borrow — max 65% LTV
  const maxBorrowUsd = collateralUsd() * 0.65
  const borrow1Usd = rng(6, Math.floor(maxBorrowUsd * 0.3), Math.floor(maxBorrowUsd * 0.65))
  const borrow1Amt = borrow1Usd / (assetPrices[debtAsset] ?? 1)
  debtBal[debtAsset] = borrow1Amt
  push({ accountType: "debt", activity: "borrowing", eventName: "Borrow" }, debtAsset, borrow1Amt)

  // 4. Partial repayment (20–50% of debt)
  if (rng(7, 0, 2) > 0) {
    const repayFrac = rng(8, 20, 50) / 100
    const repayAmt = (debtBal[debtAsset] ?? 0) * repayFrac
    debtBal[debtAsset] = (debtBal[debtAsset] ?? 0) - repayAmt
    push({ accountType: "debt", activity: "repayment", eventName: "RepayBorrow" }, debtAsset, repayAmt)
  }

  // 5. Optional collateral redemption — only redeem what keeps LTV under 60%
  const safeCollUsd = debtUsd() / 0.6
  const redeemableUsd = collateralUsd() - safeCollUsd
  if (redeemableUsd > 1000 && rng(9, 0, 2) === 0) {
    const redeemUsd = Math.min(redeemableUsd * rng(10, 20, 50) / 100, (collBal[collAsset] ?? 0))
    if (redeemUsd > 0) {
      collBal[collAsset] = (collBal[collAsset] ?? 0) - redeemUsd
      push({ accountType: "collateral", activity: "redemption", eventName: "Redeem" }, collAsset, redeemUsd)
    }
  }

  // 6. Optional second borrow
  const headroom = collateralUsd() * 0.65 - debtUsd()
  if (headroom > 1000 && rng(11, 0, 3) === 0) {
    const borrow2Usd = rng(12, 500, Math.floor(headroom * 0.5))
    const borrow2Amt = borrow2Usd / (assetPrices[debtAsset] ?? 1)
    debtBal[debtAsset] = (debtBal[debtAsset] ?? 0) + borrow2Amt
    push({ accountType: "debt", activity: "borrowing", eventName: "Borrow" }, debtAsset, borrow2Amt)
  }

  // 7. Final repayment — clear remaining debt
  if (rng(13, 0, 2) === 0 && (debtBal[debtAsset] ?? 0) > 0) {
    const finalRepay = debtBal[debtAsset] ?? 0
    debtBal[debtAsset] = 0
    push({ accountType: "debt", activity: "repayment", eventName: "RepayBorrow" }, debtAsset, finalRepay)
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
