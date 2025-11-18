"use client";

import Link from "next/link";
import { ArrowUpRight, LineChart, TrendingUp, Wallet } from "lucide-react";

import { formatHbar } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, toDate, useInvestorPortfolio } from "@/lib/hooks/useInvestorPortfolio";

export function InvestorDashboard({ userId }: { userId: string }) {
  const {
    investments,
    loading,
    error,
    investedBalance,
    last24hAmount,
    last24hCount,
    activePositions,
    activeInvestmentCount,
    allocation,
    averageYield,
    upcomingMaturity,
    topHoldings,
    recentActivity,
  } = useInvestorPortfolio(userId);

  const allocationSummary = allocation.slice(0, 3);
  const showEmptyState = !loading && investments.length === 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && investments.length === 0 && (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Loading your portfolio…
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Invested Balance</span>
            <Wallet className="size-5 text-muted-foreground" />
          </div>
          <div className="mt-3 text-2xl font-semibold">
            {loading && investments.length === 0 ? "—" : formatHbar(investedBalance)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {activeInvestmentCount} active investment{activeInvestmentCount === 1 ? "" : "s"}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last 24h Flow</span>
            <TrendingUp className="size-5 text-muted-foreground" />
          </div>
          <div className="mt-3 text-2xl font-semibold">
            {loading && investments.length === 0 ? "—" : formatHbar(last24hAmount)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {last24hCount > 0 ? `${last24hCount} fills in the last day` : "No fills in the last day"}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active Positions</span>
            <LineChart className="size-5 text-muted-foreground" />
          </div>
          <div className="mt-3 text-2xl font-semibold">{activePositions}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Avg. yield {averageYield.toFixed(2)}% APY
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Next Maturity</span>
            <ArrowUpRight className="size-5 text-muted-foreground" />
          </div>
          <div className="mt-3 text-2xl font-semibold">
            {upcomingMaturity ? upcomingMaturity.date.toLocaleDateString() : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {upcomingMaturity ? upcomingMaturity.bondName : "No upcoming maturities"}
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">Top Holdings</h2>
              <p className="text-xs text-muted-foreground">
                Based on the total amount allocated to each bond
              </p>
            </div>
            <Link
              href="/portfolio"
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              View portfolio
            </Link>
          </div>

          {loading && investments.length === 0 ? (
            <div className="mt-6 text-sm text-muted-foreground">Loading holdings…</div>
          ) : topHoldings.length === 0 ? (
            <div className="mt-6 text-sm text-muted-foreground">
              {showEmptyState ? "No investments yet." : "No holdings to display."}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {topHoldings.map((holding) => (
                <div key={holding.bondId} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">
                      {holding.bond?.name ?? "Unnamed Bond"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {holding.bond?.sector ?? "Uncategorized"} •{" "}
                      {(holding.bond?.interestApyPct ?? 0).toFixed(2)}% APY
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{formatHbar(holding.total)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Allocation
            </div>
            {allocationSummary.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No allocation data yet.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {allocationSummary.map((entry) => (
                  <span
                    key={entry.sector}
                    className="rounded-full bg-background px-2.5 py-1 font-medium shadow-sm"
                  >
                    {entry.sector} · {entry.percent.toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent Activity</h2>
            <span className="text-xs text-muted-foreground">
              {recentActivity.length > 0 ? "Latest fills" : ""}
            </span>
          </div>

          {loading && investments.length === 0 ? (
            <div className="mt-6 text-sm text-muted-foreground">Loading activity…</div>
          ) : recentActivity.length === 0 ? (
            <div className="mt-6 text-sm text-muted-foreground">
              {showEmptyState
                ? "You haven't invested yet."
                : "No recent activity to display."}
            </div>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
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
        </div>
      </section>

      {showEmptyState && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            You haven't made any investments yet. Explore the marketplace to get started.
          </p>
          <Link href="/marketplace" className="inline-flex">
            <Button className="mt-4">Browse marketplace</Button>
          </Link>
        </div>
      )}
    </div>
  );
}


