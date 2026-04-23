const KRYPTOS_API_BASE = process.env.KRYPTOS_API_BASE!
const KRYPTOS_API_KEY = process.env.KRYPTOS_API_KEY!

export async function kryptosFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${KRYPTOS_API_BASE}${path}`, {
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
    throw new Error(`Kryptos API ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}
