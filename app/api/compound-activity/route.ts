import { NextRequest, NextResponse } from "next/server"

// Compound v2 cToken addresses on Ethereum mainnet
const COMPOUND_CTOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643": { symbol: "DAI", decimals: 8 },
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5": { symbol: "ETH", decimals: 8 },
  "0x39aa39c021dfbae8fac545936693ac917d5e7563": { symbol: "USDC", decimals: 8 },
  "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9": { symbol: "USDT", decimals: 8 },
  "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4": { symbol: "WBTC", decimals: 8 },
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e": { symbol: "BAT", decimals: 8 },
  "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407": { symbol: "ZRX", decimals: 8 },
  "0x158079ee67fce2f58472a96584a73c7ab9ac95c1": { symbol: "REP", decimals: 8 },
}

// Compound event signatures
const EVENT_SIGNATURES = {
  // Mint (Supply) - Mint(address minter, uint256 mintAmount, uint256 mintTokens)
  Mint: "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f",
  // Redeem (Withdraw) - Redeem(address redeemer, uint256 redeemAmount, uint256 redeemTokens)
  Redeem: "0xe5b754fb1abb7f01b499791d0b820ae3b6af3424ac1c59768edb53f4ec31a929",
  // Borrow - Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)
  Borrow: "0x13ed6866d4e1ee6da46f845c46d7e54120883d75c5ea9a2dacc1c4ca8984ab80",
  // RepayBorrow - RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)
  RepayBorrow: "0x1a2a22cb034d26d1854bdc6666a5b91fe25efbbb5dcad3b0355478d6f5c362a1",
  // LiquidateBorrow
  LiquidateBorrow: "0x298637f684da70674f26509b10f07ec2fbc77a335ab1e7d6215a4b2484d8bb52",
}

interface CompoundEvent {
  id: string
  blockNumber: string
  timestamp: string
  transactionHash: string
  eventType: "Supply" | "Withdraw" | "Borrow" | "Repay" | "Liquidation"
  asset: string
  amount: string
  amountUsd: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const address = searchParams.get("address")

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 })
  }

  // Validate Ethereum address
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 })
  }

  try {
    // For demo purposes, we'll generate mock data that simulates Compound activity
    // In production, you would use The Graph API or Alchemy/Infura to query real data
    const events = generateMockCompoundEvents(address)
    
    return NextResponse.json({ events })
  } catch (error) {
    console.error("Error fetching Compound activity:", error)
    return NextResponse.json(
      { error: "Failed to fetch Compound activity" },
      { status: 500 }
    )
  }
}

// Generate realistic mock data for demonstration
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
  
  // Generate a deterministic but varied set of events based on the address
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
    
    // Generate timestamps going back in time
    const timestamp = new Date(now - (i * 86400000 * ((seed % 5) + 1))).toISOString()
    const blockNumber = (19000000 - i * 1000 - (seed % 500)).toString()
    
    // Generate deterministic but realistic-looking transaction hash
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
  
  // Sort by timestamp descending (most recent first)
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
