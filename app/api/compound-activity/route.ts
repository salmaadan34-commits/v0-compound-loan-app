import { NextRequest, NextResponse } from "next/server"
import { kryptosFetch } from "@/lib/kryptos"

type CompoundEvent = {
  id: string
  blockNumber: string
  timestamp: string
  transactionHash: string
  eventType: "Supply" | "Withdraw" | "Borrow" | "Repay" | "Liquidation"
  asset: string
  amount: string
  amountUsd: string
}

const USE_KRYPTOS = process.env.KRYPTOS_ENABLED === "true"

const EVENT_MAP: Record<string, CompoundEvent["eventType"]> = {
  supply: "Supply",
  deposit: "Supply",
  mint: "Supply",
  withdraw: "Withdraw",
  redemption: "Withdraw",
  redeem: "Withdraw",
  borrow: "Borrow",
  borrowing: "Borrow",
  repay: "Repay",
  repayment: "Repay",
  liquidation: "Liquidation",
}

function mapEventType(raw: string): CompoundEvent["eventType"] | null {
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

  const eventType = mapEventType(rawType)
  if (!eventType) return null

  return {
    id: String(tx.id ?? `${tx.tx_hash ?? tx.transaction_hash}-${tx.event_index ?? 0}`),
    blockNumber: String(tx.block_number ?? ""),
    timestamp: String(tx.block_timestamp ?? tx.timestamp ?? ""),
    transactionHash: String(tx.tx_hash ?? tx.transaction_hash ?? ""),
    eventType,
    asset: String(tx.token_symbol ?? tx.asset_symbol ?? tx.symbol ?? "UNKNOWN"),
    amount: String(tx.amount ?? 0),
    amountUsd: String(tx.amount_usd ?? tx.usd_value ?? 0),
  }
}

function generateMockCompoundEvents(address: string): CompoundEvent[] {
  const eventTypes: CompoundEvent["eventType"][] = ["Supply", "Withdraw", "Borrow", "Repay"]
  const assets = ["ETH", "USDC", "DAI", "WBTC", "USDT"]
  const assetPrices: Record<string, number> = {
    ETH: 3200,
    USDC: 1,
    DAI: 1,
    WBTC: 65000,
    USDT: 1,
  }

  const seed = parseInt(address.slice(2, 10), 16)
  const numEvents = 5 + (seed % 20)
  const events: CompoundEvent[] = []
  const now = Date.now()

  for (let i = 0; i < numEvents; i++) {
    const eventType = eventTypes[(seed + i) % eventTypes.length]
    const asset = assets[(seed + i * 3) % assets.length]
    const amount = (((seed + i * 7) % 1000) / 100 + 0.1).toFixed(4)
    const price = assetPrices[asset]
    const amountUsd = (parseFloat(amount) * price).toFixed(2)
    const timestamp = new Date(now - i * 86400000 * ((seed % 5) + 1)).toISOString()
    const blockNumber = (19000000 - i * 1000 - (seed % 500)).toString()
    const txHashSeed = (seed + i * 13).toString(16).padStart(64, "0")
    const transactionHash = `0x${txHashSeed.slice(0, 64)}`

    events.push({
      id: `${transactionHash}-${i}`,
      blockNumber,
      timestamp,
      transactionHash,
      eventType,
      asset,
      amount,
      amountUsd,
    })
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
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
