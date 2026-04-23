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
  const eventMappings: EventMapping[] = [
    { accountType: "collateral", activity: "deposit", eventName: "Mint" },
    { accountType: "collateral", activity: "redemption", eventName: "Redeem" },
    { accountType: "debt", activity: "borrowing", eventName: "Borrow" },
    { accountType: "debt", activity: "repayment", eventName: "RepayBorrow" },
    { accountType: "collateral", activity: "liquidation", eventName: "LiquidateBorrow" },
  ]
  const collateralAssets = ["USDC", "USDT", "COMP"]
  const debtAssets = ["WETH", "WBTC"]
  const assetPrices: Record<string, number> = {
    WETH: 3200,
    USDC: 1,
    COMP: 85,
    WBTC: 65000,
    USDT: 1,
  }

  const seed = parseInt(address.slice(2, 10), 16)
  const numEvents = 12 + (seed % 10)
  const events: CompoundEvent[] = []
  const baseDate = new Date("2021-02-19")

  for (let i = 0; i < numEvents; i++) {
    const mapping = eventMappings[(seed + i) % eventMappings.length]
    const assets = mapping.accountType === "collateral" ? collateralAssets : debtAssets
    const asset = assets[(seed + i * 3) % assets.length]
    const amount = (((seed + i * 7) % 100000) + 1000).toFixed(2)
    const price = assetPrices[asset]
    const amountUsd = (parseFloat(amount) * price).toFixed(2)
    const timestamp = new Date(baseDate.getTime() + i * 86400000 * ((seed % 10) + 1)).toISOString()
    const blockNumber = (12000000 + i * 1000 + (seed % 500)).toString()
    const txHashSeed = (seed + i * 13).toString(16).padStart(64, "0")
    const transactionHash = `0x${txHashSeed.slice(0, 64)}`

    events.push({
      id: `${transactionHash}-${i}`,
      blockNumber,
      timestamp,
      transactionHash,
      accountType: mapping.accountType,
      activity: mapping.activity,
      eventName: mapping.eventName,
      asset,
      amount,
      amountUsd,
    })
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
