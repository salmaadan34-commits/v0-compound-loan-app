export async function kryptosFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const RAW_KRYPTOS_API_BASE = process.env.KRYPTOS_API_BASE
  const KRYPTOS_API_KEY = process.env.KRYPTOS_API_KEY

  if (!RAW_KRYPTOS_API_BASE) throw new Error("Missing KRYPTOS_API_BASE")
  if (!KRYPTOS_API_KEY) throw new Error("Missing KRYPTOS_API_KEY")

  const KRYPTOS_API_BASE = RAW_KRYPTOS_API_BASE.replace(/\/+$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = `${KRYPTOS_API_BASE}${normalizedPath}`

  console.log("[v0] Kryptos request URL:", url)

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KRYPTOS_API_KEY}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kryptos API ${res.status} at ${url}: ${text}`)
  }

  return res.json() as Promise<T>
}
