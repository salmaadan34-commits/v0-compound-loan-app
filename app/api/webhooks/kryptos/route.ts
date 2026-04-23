import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Verify webhook signature exactly as Kryptos specifies.
  // Then update sync status, linked account state, or cached portfolio data.

  console.log("Kryptos webhook:", rawBody)

  return NextResponse.json({ ok: true })
}
