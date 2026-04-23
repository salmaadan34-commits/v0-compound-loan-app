"use client"

import { useEffect, useState, useMemo, Fragment } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  const [loanPeriod, setLoanPeriod] = useState<"monthly" | "quarterly" | "annual">("monthly")
  const [collateralPeriod, setCollateralPeriod] = useState<"monthly" | "quarterly" | "annual">("monthly")

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
      timestamp: string
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
      timestamp: string
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
          timestamp: e.timestamp,
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
          timestamp: e.timestamp,
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

  type LedgerEntry = {
    token: string; item: string; date: string; timestamp: string
    start: number; proceeds: number; accruals: number; liquidated: number; payments: number; end: number
  }
  type CollateralLedgerEntry = {
    token: string; item: string; date: string; timestamp: string
    start: number; provided: number; accruals: number; liquidated: number; reclaimed: number; end: number
  }
  type PeriodGroup<T> = { periodLabel: string; rows: T[]; subtotals: Record<string, number> }

  function getPeriodKey(timestamp: string, period: "monthly" | "quarterly" | "annual"): string {
    const d = new Date(timestamp)
    const y = d.getFullYear()
    const m = d.getMonth()
    if (period === "annual") return `${y}`
    if (period === "quarterly") return `${y} Q${Math.floor(m / 3) + 1}`
    return `${y}/${String(m + 1).padStart(2, "0")}`
  }

  function getPeriodLabel(key: string, period: "monthly" | "quarterly" | "annual"): string {
    if (period === "annual") return key
    if (period === "quarterly") return key
    const [y, m] = key.split("/")
    const monthName = new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "long" })
    return `${monthName} ${y}`
  }

  const groupedLoanLedger = useMemo((): PeriodGroup<LedgerEntry>[] => {
    const groups: Map<string, LedgerEntry[]> = new Map()
    loanLedger.forEach((row) => {
      const key = getPeriodKey(row.timestamp, loanPeriod)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    })
    return Array.from(groups.entries()).map(([key, rows]) => ({
      periodLabel: getPeriodLabel(key, loanPeriod),
      rows,
      subtotals: {
        proceeds: rows.reduce((s, r) => s + r.proceeds, 0),
        accruals: rows.reduce((s, r) => s + r.accruals, 0),
        liquidated: rows.reduce((s, r) => s + r.liquidated, 0),
        payments: rows.reduce((s, r) => s + r.payments, 0),
      },
    }))
  }, [loanLedger, loanPeriod])

  const groupedCollateralLedger = useMemo((): PeriodGroup<CollateralLedgerEntry>[] => {
    const groups: Map<string, CollateralLedgerEntry[]> = new Map()
    collateralLedger.forEach((row) => {
      const key = getPeriodKey(row.timestamp, collateralPeriod)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    })
    return Array.from(groups.entries()).map(([key, rows]) => ({
      periodLabel: getPeriodLabel(key, collateralPeriod),
      rows,
      subtotals: {
        provided: rows.reduce((s, r) => s + r.provided, 0),
        accruals: rows.reduce((s, r) => s + r.accruals, 0),
        liquidated: rows.reduce((s, r) => s + r.liquidated, 0),
        reclaimed: rows.reduce((s, r) => s + r.reclaimed, 0),
      },
    }))
  }, [collateralLedger, collateralPeriod])

  const borrowerRecon = useMemo(() => {
    type JournalEntry = {
      date: string
      timestamp: string
      description: string
      debitAccount: string
      creditAccount: string
      usdAmount: number
      asset: string
      computed?: boolean
    }
    type MonthlyGroup = {
      period: string
      periodLabel: string
      entries: JournalEntry[]
      openingDebt: number
      openingCollateral: number
      closingDebt: number
      closingCollateral: number
      totalBorrowed: number
      totalRepaid: number
      totalInterest: number
      totalLiquidated: number
      embeddedDerivative: number
      liquidationRisk: "low" | "medium" | "high" | "liquidated"
    }

    const BORROW_RATES: Record<string, number> = {
      WETH: 0.03, WBTC: 0.02, USDC: 0.05, USDT: 0.04, COMP: 0.04,
    }
    const DEFAULT_RATE = 0.03

    const sortedEvents = [...events].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    if (sortedEvents.length === 0) {
      return { monthlyGroups: [], currentDebt: 0, currentCollateral: 0, currentLtv: 0 }
    }

    // Build month range
    const firstDate = new Date(sortedEvents[0].timestamp)
    const lastDate = new Date(sortedEvents[sortedEvents.length - 1].timestamp)
    const allMonths: string[] = []
    let cur = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
    const endMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)
    while (cur <= endMonth) {
      allMonths.push(`${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, "0")}`)
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }

    // Index events by month
    const eventsByMonth = new Map<string, typeof sortedEvents>()
    sortedEvents.forEach((e) => {
      const d = new Date(e.timestamp)
      const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`
      if (!eventsByMonth.has(key)) eventsByMonth.set(key, [])
      eventsByMonth.get(key)!.push(e)
    })

    // Running state
    let runningDebt = 0
    let runningCollateral = 0
    const debtUnits: Record<string, number> = {}
    const debtCostBasis: Record<string, number> = {}
    const currentPrices: Record<string, number> = {}

    const monthlyGroups: MonthlyGroup[] = []

    allMonths.forEach((monthKey) => {
      const [y, m] = monthKey.split("/")
      const monthName = new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "long" })
      const daysInMonth = new Date(Number(y), Number(m), 0).getDate()
      const lastDay = new Date(Number(y), Number(m) - 1, daysInMonth)
        .toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
      const lastDayIso = new Date(Number(y), Number(m) - 1, daysInMonth).toISOString()

      const openingDebt = runningDebt
      const openingCollateral = runningCollateral
      const openingPrices = { ...currentPrices }

      const entries: JournalEntry[] = []
      let totalBorrowed = 0, totalRepaid = 0, totalInterest = 0, totalLiquidated = 0
      let collateralIn = 0, collateralOut = 0

      // Real transaction events
      const monthEvents = eventsByMonth.get(monthKey) || []
      monthEvents.forEach((e) => {
        const amt = parseFloat(e.amount)
        const amtUsd = parseFloat(e.amountUsd)
        const date = new Date(e.timestamp).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
        if (amt > 0) currentPrices[e.asset] = amtUsd / amt

        if (e.accountType === "debt") {
          if (e.activity === "borrowing") {
            const prevUnits = debtUnits[e.asset] || 0
            const prevCostUsd = (debtCostBasis[e.asset] || 0) * prevUnits
            debtUnits[e.asset] = prevUnits + amt
            debtCostBasis[e.asset] = (prevCostUsd + amtUsd) / debtUnits[e.asset]
            runningDebt += amtUsd
            totalBorrowed += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Borrowed ${e.asset}`, debitAccount: `Crypto (${e.asset})`, creditAccount: "Crypto Borrowings", usdAmount: amtUsd, asset: e.asset })
          } else if (e.activity === "repayment") {
            debtUnits[e.asset] = Math.max(0, (debtUnits[e.asset] || 0) - amt)
            runningDebt -= amtUsd
            totalRepaid += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Repaid ${e.asset}`, debitAccount: "Crypto Borrowings", creditAccount: `Crypto (${e.asset})`, usdAmount: amtUsd, asset: e.asset })
          } else if (e.activity === "interest") {
            runningDebt += amtUsd
            totalInterest += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Interest on ${e.asset}`, debitAccount: "Interest Expense", creditAccount: "Crypto Borrowings – Interest Payable", usdAmount: amtUsd, asset: e.asset })
          } else if (e.activity === "liquidation") {
            debtUnits[e.asset] = Math.max(0, (debtUnits[e.asset] || 0) - amt)
            runningDebt -= amtUsd
            totalLiquidated += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Debt liquidated (${e.asset})`, debitAccount: "Crypto Borrowings", creditAccount: `Collateral Crypto (${e.asset})`, usdAmount: amtUsd, asset: e.asset })
          }
        } else if (e.accountType === "collateral") {
          if (e.activity === "deposit") {
            runningCollateral += amtUsd
            collateralIn += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Deposited ${e.asset} collateral`, debitAccount: `Collateral Crypto (${e.asset})`, creditAccount: `Crypto (${e.asset})`, usdAmount: amtUsd, asset: e.asset })
          } else if (e.activity === "redemption") {
            runningCollateral -= amtUsd
            collateralOut += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Withdrew ${e.asset} collateral`, debitAccount: `Crypto (${e.asset})`, creditAccount: `Collateral Crypto (${e.asset})`, usdAmount: amtUsd, asset: e.asset })
          } else if (e.activity === "liquidation") {
            runningCollateral -= amtUsd
            collateralOut += amtUsd
            entries.push({ date, timestamp: e.timestamp, description: `Collateral seized (${e.asset})`, debitAccount: "Crypto Borrowings", creditAccount: `Collateral Crypto (${e.asset})`, usdAmount: amtUsd, asset: e.asset })
          }
        }
      })

      // Computed: monthly interest accrual on outstanding debt
      Object.entries(debtUnits).forEach(([asset, units]) => {
        if (units <= 0) return
        const price = currentPrices[asset] || debtCostBasis[asset] || 0
        const balanceUsd = units * price
        const rate = BORROW_RATES[asset] ?? DEFAULT_RATE
        const interestUsd = balanceUsd * rate * (daysInMonth / 365)
        if (interestUsd < 0.01) return
        totalInterest += interestUsd
        runningDebt += interestUsd
        entries.push({
          date: lastDay,
          timestamp: lastDayIso,
          description: `Interest accrual – ${asset} (${(rate * 100).toFixed(1)}% APY)`,
          debitAccount: "Interest Expense",
          creditAccount: "Crypto Borrowings – Interest Payable",
          usdAmount: interestUsd,
          asset,
          computed: true,
        })
      })

      // Computed: embedded derivative – fair value change on open debt positions
      let embeddedDerivative = 0
      Object.entries(debtUnits).forEach(([asset, units]) => {
        if (units <= 0 || !debtCostBasis[asset]) return
        const openPrice = openingPrices[asset] || debtCostBasis[asset]
        const closePrice = currentPrices[asset] || debtCostBasis[asset]
        const priceChange = closePrice - openPrice
        embeddedDerivative += units * priceChange
      })

      if (Math.abs(embeddedDerivative) >= 0.01) {
        const isLoss = embeddedDerivative > 0
        entries.push({
          date: lastDay,
          timestamp: lastDayIso,
          description: `Embedded Derivative – Fair Value ${isLoss ? "Loss" : "Gain"} (price change on open positions)`,
          debitAccount: isLoss ? "Fair Value Loss on Derivative" : "Crypto Borrowings",
          creditAccount: isLoss ? "Crypto Borrowings" : "Fair Value Gain on Derivative",
          usdAmount: Math.abs(embeddedDerivative),
          asset: "FV",
          computed: true,
        })
        if (isLoss) runningDebt += Math.abs(embeddedDerivative)
        else runningDebt -= Math.abs(embeddedDerivative)
      }

      if (entries.length > 0 || openingDebt > 0) {
        const ltv = runningCollateral > 0 ? runningDebt / runningCollateral : 0
        const liquidationRisk: MonthlyGroup["liquidationRisk"] =
          totalLiquidated > 0 ? "liquidated" : ltv > 0.75 ? "high" : ltv > 0.5 ? "medium" : "low"
        monthlyGroups.push({
          period: monthKey,
          periodLabel: `${monthName} ${y}`,
          entries,
          openingDebt,
          openingCollateral,
          closingDebt: runningDebt,
          closingCollateral: runningCollateral,
          totalBorrowed,
          totalRepaid,
          totalInterest,
          totalLiquidated,
          embeddedDerivative,
          liquidationRisk,
        })
      }
    })

    const ltv = runningCollateral > 0 ? runningDebt / runningCollateral : 0
    return { monthlyGroups, currentDebt: runningDebt, currentCollateral: runningCollateral, currentLtv: ltv }
  }, [events])

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    })
  }

  const ACTIVITY_LABELS: Record<string, string> = {
    deposited: "Deposited",
    redeemed: "Redeemed",
    seized: "Seized",
    "interest income": "Interest Income",
    Borrow: "Borrow",
    RepayBorrow: "Repay Borrow",
    "interest expense": "Interest Expense",
  }

  const formatUsd = (value: number, negative = false) => {
    if (value === 0) return ""
    const formatted = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return negative ? `($${formatted})` : `$${formatted}`
  }

  const formatLedgerValue = (value: number, isDebit = false) => {
    if (value === 0) return ""
    // Format with 1-2 decimals, remove trailing zeros, then remove trailing period if needed
    const formatted = value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).replace(/0+$/, "").replace(/\.$/, "")
    return isDebit ? `(${formatted})` : formatted
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8 p-4 rounded-xl border border-zinc-800 bg-zinc-900">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">Compound Protocol</h1>
              {source && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  source === "kryptos" ? "bg-green-900 text-green-300" : "bg-amber-900 text-amber-300"
                }`}>
                  {source === "kryptos" ? "Live Data" : "Mock Data"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-sm text-muted-foreground font-mono truncate">{address}</p>
              <a
                href={`https://etherscan.io/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-primary hover:underline flex-shrink-0"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
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
            <TabsList className="grid w-full max-w-2xl grid-cols-5 mb-6 bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="loan">Loan</TabsTrigger>
              <TabsTrigger value="collateral">Collateral</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="borrower">Borrower</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Collateral Summary */}
                <Card className="overflow-hidden bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-3 bg-green-700 border-b border-green-800">
                    <CardTitle className="text-center text-sm font-semibold tracking-widest text-white">COLLATERAL</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-zinc-700 bg-zinc-800">
                          <TableHead className="font-semibold text-xs uppercase text-zinc-300">Activity</TableHead>
                          {collateralTokens.map((token) => (
                            <TableHead key={token} className="text-right font-semibold text-xs uppercase text-zinc-300">{token}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(collateralSummary)
                          .filter(([, tokens]) => collateralTokens.some((t) => (tokens[t] || 0) !== 0))
                          .map(([activity, tokens]) => (
                          <TableRow key={activity} className="border-zinc-800 hover:bg-zinc-800/50">
                            <TableCell className="font-medium text-sm text-zinc-200">{ACTIVITY_LABELS[activity] ?? activity}</TableCell>
                            {collateralTokens.map((token) => (
                              <TableCell key={token} className="text-right font-mono text-sm text-green-400">
                                {formatUsd(tokens[token] || 0)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Debt Summary */}
                <Card className="overflow-hidden bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-3 bg-red-700 border-b border-red-800">
                    <CardTitle className="text-center text-sm font-semibold tracking-widest text-white">DEBT</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-zinc-700 bg-zinc-800">
                          <TableHead className="font-semibold text-xs uppercase text-zinc-300">Activity</TableHead>
                          {debtTokens.map((token) => (
                            <TableHead key={token} className="text-right font-semibold text-xs uppercase text-zinc-300">{token}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(debtSummary)
                          .filter(([, tokens]) => debtTokens.some((t) => (tokens[t] || 0) !== 0))
                          .map(([activity, tokens]) => (
                          <TableRow key={activity} className="border-zinc-800 hover:bg-zinc-800/50">
                            <TableCell className="font-medium text-sm text-zinc-200">{ACTIVITY_LABELS[activity] ?? activity}</TableCell>
                            {debtTokens.map((token) => (
                              <TableCell key={token} className={`text-right font-mono text-sm ${activity === "Borrow" ? "text-red-400" : "text-green-400"}`}>
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
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-zinc-800">
                  <CardTitle className="text-lg text-white">LOAN</CardTitle>
                  <Select value={loanPeriod} onValueChange={(v) => setLoanPeriod(v as typeof loanPeriod)}>
                    <SelectTrigger className="w-36 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-0">
                  {loanLedger.length === 0 ? (
                    <p className="text-center py-12 text-zinc-500">No loan activity found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-zinc-700 bg-zinc-800">
                            <TableHead className="font-bold text-zinc-300">Token</TableHead>
                            <TableHead className="font-bold text-zinc-300">Item</TableHead>
                            <TableHead className="font-bold text-zinc-300">Date</TableHead>
                            <TableHead className="text-right font-bold italic text-zinc-300">Start</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Proceeds</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Accruals</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Liquidated</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Payments</TableHead>
                            <TableHead className="text-right font-bold italic text-zinc-300">End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupedLoanLedger.map((group) => (
                            <Fragment key={group.periodLabel}>
                              <TableRow className="bg-zinc-800 border-zinc-700">
                                <TableCell colSpan={9} className="font-semibold text-sm py-1 px-4 text-zinc-300">
                                  {group.periodLabel}
                                </TableCell>
                              </TableRow>
                              {group.rows.map((entry, idx) => (
                                <TableRow key={`${group.periodLabel}-${idx}`} className="border-zinc-800 hover:bg-zinc-800/50">
                                  <TableCell className="font-medium pl-6 text-white">{entry.token}</TableCell>
                                  <TableCell className="text-zinc-300">{entry.item}</TableCell>
                                  <TableCell className="text-zinc-400">{entry.date}</TableCell>
                                  <TableCell className="text-right font-mono text-zinc-300">
                                    {formatLedgerValue(entry.start, entry.start < 0)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-red-400">
                                    {formatLedgerValue(entry.proceeds, true)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-red-400">
                                    {formatLedgerValue(entry.accruals, true)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-green-400">
                                    {formatLedgerValue(entry.liquidated)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-green-400">
                                    {formatLedgerValue(entry.payments)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-zinc-300">
                                    {formatLedgerValue(entry.end, entry.end < 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="border-t border-zinc-700 font-semibold bg-zinc-800/50">
                                <TableCell colSpan={3} className="pl-6 text-sm text-zinc-400">Subtotal</TableCell>
                                <TableCell className="text-right font-mono">—</TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.proceeds, true)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.accruals, true)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.liquidated)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.payments)}
                                </TableCell>
                                <TableCell className="text-right font-mono">—</TableCell>
                              </TableRow>
                            </Fragment>
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
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-zinc-800">
                  <CardTitle className="text-lg text-white">COLLATERAL</CardTitle>
                  <Select value={collateralPeriod} onValueChange={(v) => setCollateralPeriod(v as typeof collateralPeriod)}>
                    <SelectTrigger className="w-36 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-0">
                  {collateralLedger.length === 0 ? (
                    <p className="text-center py-12 text-zinc-500">No collateral activity found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-zinc-700 bg-zinc-800">
                            <TableHead className="font-bold text-zinc-300">Token</TableHead>
                            <TableHead className="font-bold text-zinc-300">Item</TableHead>
                            <TableHead className="font-bold text-zinc-300">Date</TableHead>
                            <TableHead className="text-right font-bold italic text-zinc-300">Start</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Provided</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Accruals</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Liquidated</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">Reclaimed</TableHead>
                            <TableHead className="text-right font-bold italic text-zinc-300">End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupedCollateralLedger.map((group) => (
                            <Fragment key={group.periodLabel}>
                              <TableRow className="bg-zinc-800 border-zinc-700">
                                <TableCell colSpan={9} className="font-semibold text-sm py-1 px-4 text-zinc-300">
                                  {group.periodLabel}
                                </TableCell>
                              </TableRow>
                              {group.rows.map((entry, idx) => (
                                <TableRow key={`${group.periodLabel}-${idx}`} className="border-zinc-800 hover:bg-zinc-800/50">
                                  <TableCell className="font-medium pl-6 text-white">{entry.token}</TableCell>
                                  <TableCell className="text-zinc-300">{entry.item}</TableCell>
                                  <TableCell className="text-zinc-400">{entry.date}</TableCell>
                                  <TableCell className="text-right font-mono text-zinc-300">
                                    {formatLedgerValue(entry.start)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-green-400">
                                    {formatLedgerValue(entry.provided)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-red-400">
                                    {formatLedgerValue(entry.accruals, true)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-red-400">
                                    {formatLedgerValue(entry.liquidated, true)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-green-400">
                                    {formatLedgerValue(entry.reclaimed, true)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-zinc-300">
                                    {formatLedgerValue(entry.end)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="border-t border-zinc-700 font-semibold bg-zinc-800/50">
                                <TableCell colSpan={3} className="pl-6 text-sm text-zinc-400">Subtotal</TableCell>
                                <TableCell className="text-right font-mono">—</TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.provided)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.accruals, true)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.liquidated, true)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatLedgerValue(group.subtotals.reclaimed, true)}
                                </TableCell>
                                <TableCell className="text-right font-mono">—</TableCell>
                              </TableRow>
                            </Fragment>
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
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="border-b border-zinc-800">
                <CardTitle className="text-white">Transaction History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-zinc-700 bg-zinc-800">
                        <TableHead className="font-bold text-zinc-300">TX HASH</TableHead>
                        <TableHead className="font-bold text-zinc-300">ACCOUNT</TableHead>
                        <TableHead className="font-bold text-zinc-300">ACTIVITY</TableHead>
                        <TableHead className="font-bold text-zinc-300">TIMESTAMP</TableHead>
                        <TableHead className="font-bold text-zinc-300">EVENT NAME</TableHead>
                        <TableHead className="font-bold text-zinc-300">TOKEN</TableHead>
                        <TableHead className="text-right font-bold text-zinc-300">AMOUNT</TableHead>
                        <TableHead className="text-right font-bold text-zinc-300">AMOUNT USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12 text-zinc-500">
                            No Compound activity found for this address
                          </TableCell>
                        </TableRow>
                      ) : (
                        events.map((event) => (
                          <TableRow key={event.id} className="border-zinc-800 hover:bg-zinc-800/50">
                            <TableCell className="font-mono text-sm">
                              <a
                                href={`https://etherscan.io/tx/${event.transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline inline-flex items-center gap-1"
                              >
                                {formatAddress(event.transactionHash)}
                              </a>
                            </TableCell>
                            <TableCell>
                              <span className={event.accountType === "collateral" ? "text-green-400" : "text-amber-400"}>
                                {event.accountType}
                              </span>
                            </TableCell>
                            <TableCell className="text-zinc-300">{event.activity}</TableCell>
                            <TableCell className="text-zinc-400">{formatDate(event.timestamp)}</TableCell>
                            <TableCell className="text-blue-400">{event.eventName}</TableCell>
                            <TableCell className="text-white font-medium">{event.asset}</TableCell>
                            <TableCell className="text-right font-mono text-green-400">
                              {parseFloat(event.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-mono text-zinc-200">
                              ${parseFloat(event.amountUsd).toLocaleString("en-US", { minimumFractionDigits: 2 })}
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

            {/* Borrower Reconciliation Tab */}
            <TabsContent value="borrower" className="space-y-6">
              {/* Current Position Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Owed</p>
                    <p className="text-lg font-bold font-mono text-red-400">
                      ${borrowerRecon.currentDebt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-zinc-500">Crypto Borrowings</p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Collateral</p>
                    <p className="text-lg font-bold font-mono text-green-400">
                      ${borrowerRecon.currentCollateral.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-zinc-500">Collateral Crypto</p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">LTV Ratio</p>
                    <p className={`text-lg font-bold font-mono ${borrowerRecon.currentLtv > 0.75 ? "text-red-400" : borrowerRecon.currentLtv > 0.5 ? "text-amber-400" : "text-green-400"}`}>
                      {(borrowerRecon.currentLtv * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-zinc-500">Debt / Collateral</p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Liquidation Risk</p>
                    <p className={`text-lg font-bold ${
                      borrowerRecon.currentLtv > 0.75 ? "text-red-400" :
                      borrowerRecon.currentLtv > 0.5 ? "text-amber-400" : "text-green-400"
                    }`}>
                      {borrowerRecon.currentLtv > 0.75 ? "HIGH" : borrowerRecon.currentLtv > 0.5 ? "MEDIUM" : "LOW"}
                    </p>
                    <p className="text-xs text-zinc-500">Based on LTV</p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Reconciliation */}
              {borrowerRecon.monthlyGroups.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">No borrower activity found</p>
              ) : (
                borrowerRecon.monthlyGroups.map((group) => (
                  <Card key={group.period} className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2 border-b border-zinc-800">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-white">{group.periodLabel}</CardTitle>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          group.liquidationRisk === "liquidated" ? "bg-red-900 text-red-300" :
                          group.liquidationRisk === "high" ? "bg-red-900 text-red-300" :
                          group.liquidationRisk === "medium" ? "bg-amber-900 text-amber-300" :
                          "bg-green-900 text-green-300"
                        }`}>
                          {group.liquidationRisk === "liquidated" ? "LIQUIDATED" :
                           group.liquidationRisk === "high" ? "HIGH RISK" :
                           group.liquidationRisk === "medium" ? "MEDIUM RISK" : "LOW RISK"}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-zinc-700 bg-zinc-800">
                            <TableHead className="font-bold text-zinc-300">Date</TableHead>
                            <TableHead className="font-bold text-zinc-300">Description</TableHead>
                            <TableHead className="font-bold text-zinc-300">Debit Account</TableHead>
                            <TableHead className="font-bold text-zinc-300">Credit Account</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">DR (USD)</TableHead>
                            <TableHead className="text-right font-bold text-zinc-300">CR (USD)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Opening balance row */}
                          <TableRow className="bg-zinc-800/60 text-sm text-zinc-400 border-zinc-700">
                            <TableCell colSpan={4} className="pl-4 italic">Opening Balance</TableCell>
                            <TableCell className="text-right font-mono">{group.openingDebt > 0 ? `$${group.openingDebt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</TableCell>
                            <TableCell className="text-right font-mono">{group.openingCollateral > 0 ? `$${group.openingCollateral.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</TableCell>
                          </TableRow>

                          {/* Journal entries */}
                          {group.entries.map((entry, idx) => (
                            <TableRow key={idx} className={`border-zinc-800 ${entry.computed ? "bg-zinc-800/30 italic" : "hover:bg-zinc-800/50"}`}>
                              <TableCell className="text-sm text-zinc-400">{entry.date}</TableCell>
                              <TableCell className="text-sm text-zinc-200">{entry.description}</TableCell>
                              <TableCell className="text-sm text-blue-400">{entry.debitAccount}</TableCell>
                              <TableCell className="text-sm text-amber-400 pl-6">{entry.creditAccount}</TableCell>
                              <TableCell className="text-right font-mono text-sm text-red-400">
                                ${entry.usdAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-green-400">
                                ${entry.usdAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))}

                          {/* Closing balance row */}
                          <TableRow className="border-t border-zinc-700 bg-zinc-800/60 font-semibold">
                            <TableCell colSpan={4} className="pl-4 text-white">Closing Balance</TableCell>
                            <TableCell className="text-right font-mono">
                              {group.closingDebt > 0 ? `$${group.closingDebt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {group.closingCollateral > 0 ? `$${group.closingCollateral.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </TableCell>
                          </TableRow>

                          {/* Period summary */}
                          <TableRow className="bg-zinc-950 text-xs text-zinc-500 border-zinc-800">
                            <TableCell colSpan={6} className="pl-4 py-2">
                              <span className="mr-4">Borrowed: <span className="font-mono font-medium text-red-400">${group.totalBorrowed.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></span>
                              <span className="mr-4">Repaid: <span className="font-mono font-medium text-green-400">${group.totalRepaid.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></span>
                              <span className="mr-4">Interest: <span className="font-mono font-medium text-red-400">${group.totalInterest.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></span>
                              {Math.abs(group.embeddedDerivative) >= 0.01 && (
                                <span className={`mr-4 ${group.embeddedDerivative > 0 ? "text-red-600" : "text-green-600"}`}>
                                  FV Adj: <span className="font-mono font-medium">{group.embeddedDerivative > 0 ? "+" : "-"}${Math.abs(group.embeddedDerivative).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                                </span>
                              )}
                              {group.totalLiquidated > 0 && <span className="text-red-600">Liquidated: <span className="font-mono font-medium">${group.totalLiquidated.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></span>}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  )
}
