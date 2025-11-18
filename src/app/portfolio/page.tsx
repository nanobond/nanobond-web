"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ArrowUpRight, LineChart, PieChart, TrendingUp, Wallet } from "lucide-react";

import { auth } from "@/lib/firebase";
import { formatHbar } from "@/lib/format";
import { formatRelativeTime, toDate, useInvestorPortfolio } from "@/lib/hooks/useInvestorPortfolio";
import { useUserRole } from "@/lib/hooks/useUserRole";
import type { BondStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HoldingRow {
  bondId: string;
  amount: number;
  units: number;
  bondName: string;
  sector: string;
  status?: BondStatus;
  maturityDate?: string;
  apy?: number;
}

const getStatusBadgeVariant = (status?: BondStatus) => {
  switch (status) {
    case "active":
    case "published":
      return "success";
    case "draft":
      return "outline";
    case "under_review":
      return "info";
    case "approved":
      return "secondary";
    case "rejected":
    case "defaulted":
      return "destructive";
    case "matured":
      return "secondary";
    default:
      return "outline";
  }
};

export default function PortfolioPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { isIssuer, loading: roleLoading } = useUserRole();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAuthChecked(true);
        router.replace("/auth");
        return;
      }
      setUserId(user.uid);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [router]);

  const {
    investments,
    loading: portfolioLoading,
    error,
    investedBalance,
    activePositions,
    averageYield,
    last24hAmount,
    allocation,
    recentActivity,
  } = useInvestorPortfolio(userId);

  const holdings: HoldingRow[] = useMemo(() => {
    const map = new Map<string, HoldingRow>();
    investments.forEach((investment) => {
      if (!investment.bondId) return;
      const existing =
        map.get(investment.bondId) ??
        {
          bondId: investment.bondId,
          amount: 0,
          units: 0,
          bondName: investment.bond?.name ?? "Untitled Bond",
          sector: investment.bond?.sector ?? "Uncategorized",
          status: investment.bond?.status,
          maturityDate: investment.bond?.maturityDate,
          apy: investment.bond?.interestApyPct,
        };
      existing.amount += investment.amountHbar || 0;
      existing.units += investment.units || 0;
      existing.bondName = investment.bond?.name ?? existing.bondName;
      existing.sector = investment.bond?.sector ?? existing.sector;
      existing.status = investment.bond?.status ?? existing.status;
      existing.maturityDate = investment.bond?.maturityDate ?? existing.maturityDate;
      existing.apy = investment.bond?.interestApyPct ?? existing.apy;
      map.set(investment.bondId, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [investments]);

  const showEmptyState = !portfolioLoading && investments.length === 0;
  const stillInitializing = !authChecked || roleLoading || !userId;

  if (stillInitializing) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Loading portfolio...</div>
      </main>
    );
  }

  if (isIssuer) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Investor access only</CardTitle>
            <CardDescription>Portfolio analytics are only available for investor accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/")}>Back to dashboard</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time view of your holdings and allocations</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      {portfolioLoading && investments.length === 0 && (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Syncing your latest investments…
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invested Balance</CardTitle>
            <Wallet className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHbar(investedBalance)}</div>
            <p className="text-xs text-muted-foreground">Across all active holdings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Yield</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageYield.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">Weighted APY across positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
            <LineChart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePositions}</div>
            <p className="text-xs text-muted-foreground">Unique bonds currently held</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 24h Flow</CardTitle>
            <ArrowUpRight className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHbar(last24hAmount)}</div>
            <p className="text-xs text-muted-foreground">Net additions in the past day</p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
            <CardDescription>Aggregated by bond</CardDescription>
          </CardHeader>
          <CardContent>
            {holdings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {showEmptyState ? "No investments yet." : "No holdings to display."}
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bond</TableHead>
                      <TableHead className="hidden sm:table-cell">Sector</TableHead>
                      <TableHead>Allocation</TableHead>
                      <TableHead className="hidden md:table-cell">Units</TableHead>
                      <TableHead className="hidden md:table-cell">Yield</TableHead>
                      <TableHead className="hidden lg:table-cell">Maturity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((holding) => (
                      <TableRow key={holding.bondId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <Link
                              href={`/marketplace/${holding.bondId}`}
                              className="font-medium hover:underline"
                            >
                              {holding.bondName}
                            </Link>
                            <span className="text-xs text-muted-foreground lg:hidden">
                              {holding.sector}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">{holding.sector}</span>
                        </TableCell>
                        <TableCell className="font-medium">{formatHbar(holding.amount)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {holding.units > 0 ? holding.units.toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {holding.apy !== undefined ? `${holding.apy.toFixed(2)}%` : "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {holding.maturityDate
                            ? new Date(holding.maturityDate).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {holding.status ? (
                            <Badge variant={getStatusBadgeVariant(holding.status)}>
                              {holding.status.replace("_", " ")}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Allocation</CardTitle>
                <CardDescription>Distribution by sector</CardDescription>
              </div>
              <PieChart className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              {allocation.length === 0 ? (
                <p className="text-sm text-muted-foreground">No allocation data yet.</p>
              ) : (
                allocation.slice(0, 6).map((entry) => (
                  <div key={entry.sector}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{entry.sector}</span>
                      <span className="text-muted-foreground">{entry.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={entry.percent} className="mt-1" />
                    <div className="text-xs text-muted-foreground mt-1">{formatHbar(entry.amount)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest investment fills</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {showEmptyState ? "You haven't invested yet." : "No recent fills to display."}
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {recentActivity.map((investment) => {
                    const investedAt = toDate(investment.investedAt);
                    return (
                      <li key={investment.id} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {investment.bond?.name ?? "Bond Investment"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatHbar(investment.amountHbar)} ·{" "}
                            {investment.units ? `${investment.units} units` : "Units pending"}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(investedAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showEmptyState && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              You haven't made any investments yet. Explore the marketplace to get started.
            </p>
            <Button asChild className="mt-4">
              <Link href="/marketplace">Browse marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
