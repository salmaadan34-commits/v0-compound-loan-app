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

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 })
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 })
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

    return NextResponse.json({ events })
  } catch (error) {
    console.error("Kryptos compound activity error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch activity" },
      { status: 500 }
    )
  }
}
