"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react"

type AccountType = "collateral" | "debt"
type ActivityType = "deposit" | "redemption" | "borrowing" | "repayment" | "liquidation" | "interest"
type EventName = "Mint" | "Redeem" | "Borrow" | "RepayBorrow" | "LiquidateBorrow"

interface CompoundEvent {
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

type SummaryData = Record<string, Record<string, number>>

export default function ActivityPage() {
  const params = useParams()
  const address = params.address as string
  
  const [events, setEvents] = useState<CompoundEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [source, setSource] = useState("")

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
      setSource(data.source || "unknown")
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

  // Item label mapping for ledger display
  const getItemLabel = (activity: ActivityType, accountType: AccountType): string => {
    const labels: Record<string, Record<string, string>> = {
      collateral: {
        deposit: "Deposit",
        redemption: "Redeem",
        liquidation: "Liquidate",
        interest: "Interest",
      },
      debt: {
        borrowing: "Borrowed crypto",
        repayment: "Paid by borrower",
        liquidation: "Paid by liquidator",
        interest: "Interest",
      },
    }
    return labels[accountType]?.[activity] || activity
  }

  const { collateralSummary, debtSummary, collateralTokens, debtTokens, loanLedger, collateralLedger } = useMemo(() => {
    const collateral: SummaryData = {
      deposited: {},
      redeemed: {},
      seized: {},
      "interest income": {},
    }
    const debt: SummaryData = {
      Borrow: {},
      RepayBorrow: {},
      "interest expense": {},
    }

    const collTokens = new Set<string>()
    const dbtTokens = new Set<string>()

    // Ledger entries by token
    type LedgerEntry = {
      token: string
      item: string
      date: string
      start: number
      proceeds: number
      accruals: number
      liquidated: number
      payments: number
      end: number
    }
    type CollateralLedgerEntry = {
      token: string
      item: string
      date: string
      start: number
      provided: number
      accruals: number
      liquidated: number
      reclaimed: number
      end: number
    }

    const loanEntries: LedgerEntry[] = []
    const collateralEntries: CollateralLedgerEntry[] = []
    
    // Running balances by token
    const loanBalances: Record<string, number> = {}
    const collateralBalances: Record<string, number> = {}

    // Sort events by timestamp for running balance calculation
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    sortedEvents.forEach((e) => {
      const amt = parseFloat(e.amount)
      const amtUsd = parseFloat(e.amountUsd)
      const date = new Date(e.timestamp).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
      
      if (e.accountType === "collateral") {
        collTokens.add(e.asset)
        const start = collateralBalances[e.asset] || 0
        let provided = 0, accruals = 0, liquidated = 0, reclaimed = 0
        
        if (e.activity === "deposit") {
          collateral.deposited[e.asset] = (collateral.deposited[e.asset] || 0) + amtUsd
          provided = amt
        } else if (e.activity === "redemption") {
          collateral.redeemed[e.asset] = (collateral.redeemed[e.asset] || 0) + amtUsd
          reclaimed = amt
        } else if (e.activity === "liquidation") {
          collateral.seized[e.asset] = (collateral.seized[e.asset] || 0) + amtUsd
          liquidated = amt
        } else if (e.activity === "interest") {
          collateral["interest income"][e.asset] = (collateral["interest income"][e.asset] || 0) + amtUsd
          accruals = amt
        }
        
        const end = start + provided + accruals - liquidated - reclaimed
        collateralBalances[e.asset] = end
        
        collateralEntries.push({
          token: e.asset,
          item: getItemLabel(e.activity, e.accountType),
          date,
          start,
          provided,
          accruals,
          liquidated,
          reclaimed,
          end,
        })
      } else {
        dbtTokens.add(e.asset)
        const start = loanBalances[e.asset] || 0
        let proceeds = 0, accruals = 0, liquidated = 0, payments = 0
        
        if (e.activity === "borrowing") {
          debt.Borrow[e.asset] = (debt.Borrow[e.asset] || 0) + amtUsd
          proceeds = amt
        } else if (e.activity === "repayment") {
          debt.RepayBorrow[e.asset] = (debt.RepayBorrow[e.asset] || 0) + amtUsd
          payments = amt
        } else if (e.activity === "liquidation") {
          liquidated = amt
        } else if (e.activity === "interest") {
          debt["interest expense"][e.asset] = (debt["interest expense"][e.asset] || 0) + amtUsd
          accruals = amt
        }
        
        const end = start + proceeds + accruals - liquidated - payments
        loanBalances[e.asset] = end
        
        loanEntries.push({
          token: e.asset,
          item: getItemLabel(e.activity, e.accountType),
          date,
          start,
          proceeds,
          accruals,
          liquidated,
          payments,
          end,
        })
      }
    })

    return {
      collateralSummary: collateral,
      debtSummary: debt,
      collateralTokens: Array.from(collTokens).sort(),
      debtTokens: Array.from(dbtTokens).sort(),
      loanLedger: loanEntries,
      collateralLedger: collateralEntries,
    }
  }, [events])

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatUsd = (value: number, negative = false) => {
    if (value === 0) return "-"
    const formatted = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return negative ? `(${formatted})` : formatted
  }

  const formatLedgerValue = (value: number, isDebit = false) => {
    if (value === 0) return "-"
    const formatted = value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return isDebit ? `(${formatted})` : formatted
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Compound Protocol</h1>
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

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full max-w-md" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid w-full max-w-lg grid-cols-4 mb-6">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="loan">Loan</TabsTrigger>
              <TabsTrigger value="collateral">Collateral</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Collateral Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg border-b pb-2">COLLATERAL</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2">
                          <TableHead className="font-bold">ACTIVITY</TableHead>
                          {collateralTokens.map((token) => (
                            <TableHead key={token} className="text-right font-bold">{token}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(collateralSummary).map(([activity, tokens]) => (
                          <TableRow key={activity}>
                            <TableCell className="font-medium">{activity}</TableCell>
                            {collateralTokens.map((token) => (
                              <TableCell key={token} className="text-right font-mono">
                                {formatUsd(tokens[token] || 0, activity === "deposited")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Debt Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-center text-lg border-b pb-2">DEBT</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2">
                          <TableHead className="font-bold">ACTIVITY</TableHead>
                          {debtTokens.map((token) => (
                            <TableHead key={token} className="text-right font-bold">{token}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(debtSummary).map(([activity, tokens]) => (
                          <TableRow key={activity}>
                            <TableCell className="font-medium">{activity}</TableCell>
                            {debtTokens.map((token) => (
                              <TableCell key={token} className="text-right font-mono">
                                {formatUsd(tokens[token] || 0, activity === "Borrow")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Loan Ledger Tab */}
            <TabsContent value="loan">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-center text-lg border-b pb-2">LOAN</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loanLedger.length === 0 ? (
                    <p className="text-center py-12 text-muted-foreground">No loan activity found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead className="font-bold">Token</TableHead>
                            <TableHead className="font-bold">Item</TableHead>
                            <TableHead className="font-bold">Date</TableHead>
                            <TableHead className="text-right font-bold italic">Start</TableHead>
                            <TableHead className="text-right font-bold">Proceeds</TableHead>
                            <TableHead className="text-right font-bold">Accruals</TableHead>
                            <TableHead className="text-right font-bold">Liquidated</TableHead>
                            <TableHead className="text-right font-bold">Payments</TableHead>
                            <TableHead className="text-right font-bold italic">End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loanLedger.map((entry, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{entry.token}</TableCell>
                              <TableCell>{entry.item}</TableCell>
                              <TableCell>{entry.date}</TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.start, entry.start < 0)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.proceeds, true)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.accruals, true)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.liquidated)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.payments)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.end, entry.end < 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Collateral Ledger Tab */}
            <TabsContent value="collateral">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-center text-lg border-b pb-2">COLLATERAL</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {collateralLedger.length === 0 ? (
                    <p className="text-center py-12 text-muted-foreground">No collateral activity found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2">
                            <TableHead className="font-bold">Token</TableHead>
                            <TableHead className="font-bold">Item</TableHead>
                            <TableHead className="font-bold">Date</TableHead>
                            <TableHead className="text-right font-bold italic">Start</TableHead>
                            <TableHead className="text-right font-bold">Provided</TableHead>
                            <TableHead className="text-right font-bold">Accruals</TableHead>
                            <TableHead className="text-right font-bold">Liquidated</TableHead>
                            <TableHead className="text-right font-bold">Reclaimed</TableHead>
                            <TableHead className="text-right font-bold italic">End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {collateralLedger.map((entry, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{entry.token}</TableCell>
                              <TableCell>{entry.item}</TableCell>
                              <TableCell>{entry.date}</TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.start)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.provided)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.accruals, true)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.liquidated, true)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.reclaimed, true)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatLedgerValue(entry.end)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2">
                        <TableHead className="font-bold">TX HASH</TableHead>
                        <TableHead className="font-bold">ACCOUNT</TableHead>
                        <TableHead className="font-bold">ACTIVITY</TableHead>
                        <TableHead className="font-bold">TIMESTAMP</TableHead>
                        <TableHead className="font-bold">EVENT NAME</TableHead>
                        <TableHead className="font-bold">TOKEN SYMBOL</TableHead>
                        <TableHead className="text-right font-bold">AMOUNT</TableHead>
                        <TableHead className="text-right font-bold">AMOUNT USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                            No Compound activity found for this address
                          </TableCell>
                        </TableRow>
                      ) : (
                        events.map((event, idx) => (
                          <TableRow key={event.id}>
                            <TableCell className="font-mono text-sm">
                              <a
                                href={`https://etherscan.io/tx/${event.transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {formatAddress(event.transactionHash)}
                              </a>
                            </TableCell>
                            <TableCell>
                              <span className={event.accountType === "collateral" ? "text-green-600" : "text-amber-600"}>
                                {event.accountType}
                              </span>
                            </TableCell>
                            <TableCell>{event.activity}</TableCell>
                            <TableCell>{formatDate(event.timestamp)}</TableCell>
                            <TableCell className="text-blue-600">{event.eventName}</TableCell>
                            <TableCell className="text-red-600 font-medium">{event.asset}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">
                              {parseFloat(event.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {parseFloat(event.amountUsd).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  )
}
