"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react"

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

export default function ActivityPage() {
  const params = useParams()
  const router = useRouter()
  const address = params.address as string
  
  const [events, setEvents] = useState<CompoundEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchActivity = async () => {
    setLoading(true)
    setError("")
    
    try {
      const response = await fetch(`/api/compound-activity?address=${address}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch activity")
      }
      
      setEvents(data.events)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (address) {
      fetchActivity()
    }
  }, [address])

  const getEventBadgeVariant = (eventType: string) => {
    switch (eventType) {
      case "Supply":
        return "default"
      case "Withdraw":
        return "secondary"
      case "Borrow":
        return "outline"
      case "Repay":
        return "default"
      case "Liquidation":
        return "destructive"
      default:
        return "secondary"
    }
  }

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Compound Activity</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {formatAddress(address)}
              <a
                href={`https://etherscan.io/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center ml-2 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchActivity} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-destructive mb-6">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" className="mt-4" onClick={fetchActivity}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Supply"
            value={events.filter((e) => e.eventType === "Supply").length.toString()}
            loading={loading}
          />
          <StatCard
            title="Total Withdrawals"
            value={events.filter((e) => e.eventType === "Withdraw").length.toString()}
            loading={loading}
          />
          <StatCard
            title="Total Borrows"
            value={events.filter((e) => e.eventType === "Borrow").length.toString()}
            loading={loading}
          />
          <StatCard
            title="Total Repays"
            value={events.filter((e) => e.eventType === "Repay").length.toString()}
            loading={loading}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              All Compound protocol interactions for this address
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No Compound activity found for this address</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">USD Value</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Tx Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge variant={getEventBadgeVariant(event.eventType)}>
                            {event.eventType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{event.asset}</TableCell>
                        <TableCell className="text-right font-mono">
                          {parseFloat(event.amount).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${parseFloat(event.amountUsd).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(event.timestamp)}
                        </TableCell>
                        <TableCell>
                          <a
                            href={`https://etherscan.io/tx/${event.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {formatAddress(event.transactionHash)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function StatCard({ title, value, loading }: { title: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-1" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}
