"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"

export default function HomePage() {
  const [address, setAddress] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  const isValidAddress = (addr: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    
    if (!address.trim()) {
      setError("Please enter an Ethereum address")
      return
    }
    
    if (!isValidAddress(address)) {
      setError("Please enter a valid Ethereum address (0x...)")
      return
    }
    
    router.push(`/activity/${address.toLowerCase()}`)
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Compound Activity Tracker</CardTitle>
          <CardDescription>
            Enter an Ethereum address to view Compound protocol loan and collateral activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="address">Ethereum Address</FieldLabel>
              <Input
                id="address"
                type="text"
                placeholder="0x..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="font-mono"
              />
              {error && <p className="text-sm text-destructive mt-1">{error}</p>}
            </Field>
            <Button type="submit" className="w-full">
              View Activity
            </Button>
          </form>
          
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Try with a sample address:
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs"
              onClick={() => setAddress("0x0d8775f648430679a709e98d2b0cb6250d2887ef")}
            >
              0x0d8775f648430679a709e98d2b0cb6250d2887ef
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
