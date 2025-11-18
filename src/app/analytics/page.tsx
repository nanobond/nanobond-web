"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/db";
import { IssuerGuard } from "@/components/guards/IssuerGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, DollarSign, Users, FileDown, CalendarClock } from "lucide-react";
import type { Bond } from "@/lib/types";
import { formatHbar } from "@/lib/format";

function AnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bondIdParam = searchParams.get("bondId");
  
  const [userId, setUserId] = useState<string | null>(null);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [selectedBondId, setSelectedBondId] = useState<string | null>(bondIdParam);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.uid);

      // Fetch user's bonds
      try {
        const bondsQuery = query(
          collection(db, "bonds"),
          where("issuerId", "==", user.uid)
        );
        const bondsSnap = await getDocs(bondsQuery);
        let bondsData = bondsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Bond[];

        // Sort client-side to avoid Firestore composite index requirement
        bondsData = bondsData.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setBonds(bondsData);
        
        // Set first bond as selected if no bond ID in params
        if (!bondIdParam && bondsData.length > 0) {
          setSelectedBondId(bondsData[0].id);
        }
      } catch (error) {
        console.error("Error fetching bonds:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, bondIdParam]);

  const selectedBond = bonds.find((b) => b.id === selectedBondId);

  // Calculate summary metrics
  const totalRaised = bonds.reduce((sum, b) => sum + b.fundedHbar, 0);
  const activeBonds = bonds.filter((b) => b.status === "active" || b.status === "published").length;
  const averageFundingRate = bonds.length > 0
    ? bonds.reduce((sum, b) => sum + (b.fundedHbar / b.targetHbar) * 100, 0) / bonds.length
    : 0;

  // Generate mock upcoming payments for demo
  const upcomingPayments = selectedBond ? [
    {
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      amount: selectedBond.targetHbar * (selectedBond.couponRate / 100) / 12,
      type: "Interest Payment",
    },
    {
      date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      amount: selectedBond.targetHbar * (selectedBond.couponRate / 100) / 12,
      type: "Interest Payment",
    },
    {
      date: new Date(selectedBond.maturityDate),
      amount: selectedBond.targetHbar,
      type: "Principal Repayment",
    },
  ] : [];

  const exportToCSV = () => {
    if (!selectedBond) return;

    const data = [
      ["Bond Analytics Report"],
      ["Generated", new Date().toLocaleDateString()],
      [""],
      ["Bond Name", selectedBond.name],
      ["Status", selectedBond.status],
      ["Target Amount", selectedBond.targetHbar],
      ["Funded Amount", selectedBond.fundedHbar],
      ["Funding Progress", `${((selectedBond.fundedHbar / selectedBond.targetHbar) * 100).toFixed(2)}%`],
      ["Interest Rate", `${selectedBond.interestApyPct}%`],
      ["Duration", `${selectedBond.durationMonths} months`],
      [""],
      ["Upcoming Payments"],
      ["Date", "Type", "Amount"],
      ...upcomingPayments.map((p) => [
        p.date.toLocaleDateString(),
        p.type,
        p.amount.toFixed(2),
      ]),
    ];

    const csvContent = data.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedBond.name.replace(/\s+/g, "-")}-analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <IssuerGuard>
        <main className="mx-auto w-full max-w-7xl px-4 py-8">
          <div className="text-sm text-muted-foreground">Loading analytics...</div>
        </main>
      </IssuerGuard>
    );
  }

  if (bonds.length === 0) {
    return (
      <IssuerGuard>
        <main className="mx-auto w-full max-w-7xl px-4 py-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-6">Analytics</h1>
          <div className="text-center py-12">
            <TrendingUp className="mx-auto size-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-2">No bonds to analyze</h3>
            <p className="text-sm text-muted-foreground">
              Create your first bond to see analytics and performance metrics
            </p>
          </div>
        </main>
      </IssuerGuard>
    );
  }

  return (
    <IssuerGuard>
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track performance and metrics for your bond offerings
            </p>
          </div>
          {selectedBond && (
            <Button variant="outline" onClick={exportToCSV}>
              <FileDown className="size-4 mr-1" />
              Export CSV
            </Button>
          )}
        </div>

        {/* Summary Metrics */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Raised</CardTitle>
              <DollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatHbar(totalRaised)}</div>
              <p className="text-xs text-muted-foreground">Across {bonds.length} bond{bonds.length > 1 ? "s" : ""}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Bonds</CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeBonds}</div>
              <p className="text-xs text-muted-foreground">Currently accepting investments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Funding Rate</CardTitle>
              <Users className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageFundingRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Across all bonds</p>
            </CardContent>
          </Card>
        </div>

        {/* Bond Selector */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Bond</CardTitle>
            <CardDescription>Choose a bond to view detailed analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {bonds.map((bond) => (
                <Button
                  key={bond.id}
                  variant={selectedBondId === bond.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBondId(bond.id)}
                >
                  {bond.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selectedBond && (
          <>
            {/* Bond Overview */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedBond.name}</CardTitle>
                    <CardDescription>{selectedBond.sector}</CardDescription>
                  </div>
                  <Badge variant={selectedBond.status === "active" ? "success" : "outline"}>
                    {selectedBond.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Target Amount</div>
                    <div className="text-2xl font-semibold">{formatHbar(selectedBond.targetHbar)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Raised</div>
                    <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatHbar(selectedBond.fundedHbar)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Interest Rate</div>
                    <div className="text-2xl font-semibold">{selectedBond.interestApyPct}% APY</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Duration</div>
                    <div className="text-2xl font-semibold">{selectedBond.durationMonths} months</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Funding Progress */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Funding Progress</CardTitle>
                <CardDescription>Track investment progress towards target</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Overall Progress</span>
                      <span className="text-sm text-muted-foreground">
                        {((selectedBond.fundedHbar / selectedBond.targetHbar) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={(selectedBond.fundedHbar / selectedBond.targetHbar) * 100} />
                  </div>
                  
                  {/* Visual bar chart representation */}
                  <div className="mt-6">
                    <div className="text-sm font-medium mb-3">Funding by Month (Mock Data)</div>
                    <div className="space-y-2">
                      {[
                        { month: "Month 1", amount: selectedBond.fundedHbar * 0.3, percent: 30 },
                        { month: "Month 2", amount: selectedBond.fundedHbar * 0.4, percent: 40 },
                        { month: "Month 3", amount: selectedBond.fundedHbar * 0.2, percent: 20 },
                        { month: "Current", amount: selectedBond.fundedHbar * 0.1, percent: 10 },
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-20 text-xs text-muted-foreground">{item.month}</div>
                          <div className="flex-1">
                            <div className="h-8 bg-secondary rounded" style={{ width: "100%" }}>
                              <div
                                className="h-full bg-primary rounded flex items-center justify-end pr-2"
                                style={{ width: `${item.percent}%` }}
                              >
                                {item.percent > 15 && (
                                  <span className="text-xs text-primary-foreground font-medium">
                                    {formatHbar(item.amount)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bond Performance */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Bond Performance</CardTitle>
                <CardDescription>Key metrics and statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground mb-1">Total Investors</div>
                    <div className="text-xl font-semibold">0</div>
                    <div className="text-xs text-muted-foreground mt-1">Unique investors</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground mb-1">Avg. Investment</div>
                    <div className="text-xl font-semibold">$0</div>
                    <div className="text-xs text-muted-foreground mt-1">Per investor</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground mb-1">Days Active</div>
                    <div className="text-xl font-semibold">
                      {Math.floor((Date.now() - new Date(selectedBond.createdAt).getTime()) / (1000 * 60 * 60 * 24))}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Since creation</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Payments */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Upcoming Payment Schedule</CardTitle>
                    <CardDescription>Scheduled payments to investors</CardDescription>
                  </div>
                  <CalendarClock className="size-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {upcomingPayments.map((payment, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <div className="font-medium">{payment.type}</div>
                        <div className="text-sm text-muted-foreground">
                          {payment.date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatHbar(payment.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          {Math.ceil((payment.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </IssuerGuard>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <IssuerGuard>
        <main className="mx-auto w-full max-w-7xl px-4 py-8">
          <div className="text-sm text-muted-foreground">Loading analytics...</div>
        </main>
      </IssuerGuard>
    }>
      <AnalyticsContent />
    </Suspense>
  );
}

