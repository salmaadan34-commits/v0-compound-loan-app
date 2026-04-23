import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const error = request.nextUrl.searchParams.get("error")

  if (error) {
    return NextResponse.redirect(new URL("/?kryptos_error=1", request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?kryptos_error=missing_code", request.url))
  }

  // Exchange `code` with Kryptos here using their OAuth docs.
  // Persist the Kryptos user / connection id in your database.
  // Then redirect back into the app.
  return NextResponse.redirect(new URL("/?kryptos_connected=1", request.url))
}
