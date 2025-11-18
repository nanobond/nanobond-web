"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useWallet } from "@/lib/hooks/useWallet";
import {
  TrendingUp,
  DollarSign,
  Users,
  FileText,
  Plus,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Wallet,
} from "lucide-react";
import type { Bond } from "@/lib/types";
import { formatHbar } from "@/lib/format";
import { bondSchema } from "@/lib/schemas";

export function IssuerDashboard({ userId }: { userId: string }) {
  const { profileComplete, kycStatus, kycApproved } = useUserRole();
  const { isConnected, accountId } = useWallet();
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalBonds: 0,
    activeBonds: 0,
    totalRaised: 0,
    totalInvestors: 0,
    pendingReviews: 0,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch user's bonds (simplified query without orderBy to avoid index requirement)
        const bondsQuery = query(
          collection(db, "bonds"),
          where("issuerId", "==", userId)
        );
        const bondsSnap = await getDocs(bondsQuery);
        let bondsData = bondsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Bond[];

        // Validate to avoid malformed entries
        bondsData = bondsData.filter((b) => bondSchema.safeParse(b).success);

        // Sort client-side to avoid Firestore composite index requirement
        bondsData = bondsData.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        }).slice(0, 5);

        setBonds(bondsData);

        // Calculate metrics
        const totalBonds = bondsData.length;
        const activeBonds = bondsData.filter(
          (b) => b.status === "active" || b.status === "published"
        ).length;
        const totalRaised = bondsData.reduce((sum, b) => sum + b.fundedHbar, 0);
        const pendingReviews = bondsData.filter(
          (b) => b.status === "under_review"
        ).length;

        setMetrics({
          totalBonds,
          activeBonds,
          totalRaised,
          totalInvestors: 0, // Would need to query investments collection
          pendingReviews,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        // Set empty data on error so dashboard still shows
        setBonds([]);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "draft":
        return "outline";
      case "under_review":
        return "info";
      case "approved":
        return "success";
      case "rejected":
        return "destructive";
      case "published":
      case "active":
        return "success";
      case "matured":
        return "secondary";
      default:
        return "outline";
    }
  };

  const needsAttention = !profileComplete || !kycApproved || !isConnected;

  return (
    <div className="space-y-6">
      {/* Status Alerts */}
      {needsAttention && (
        <div className="space-y-3">
          {!isConnected && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20 p-4">
              <div className="flex items-start gap-3">
                <Wallet className="size-5 text-purple-600 dark:text-purple-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                    Connect Your Wallet
                  </h3>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                    Connect your Hedera wallet before issuing bonds. Your wallet will be used for bond token management.
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                    Use the "Connect Wallet" button in the navigation bar to connect your HashPack wallet.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!profileComplete && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                    Complete Your Company Profile
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    You need to complete your company profile before you can create bonds.
                  </p>
                  <Link href="/profile">
                    <Button size="sm" variant="default" className="mt-3">
                      Complete Profile
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {profileComplete && kycStatus === "none" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    KYC Verification Required
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Complete KYC verification to start issuing bonds on the platform.
                  </p>
                  <Link href="/kyc">
                    <Button size="sm" variant="default" className="mt-3">
                      Start KYC
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {kycStatus === "pending" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-4">
              <div className="flex items-start gap-3">
                <Clock className="size-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                    KYC Under Review
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Your KYC documents are being reviewed. This usually takes 1-2 business days.
                  </p>
                </div>
              </div>
            </div>
          )}

          {kycStatus === "rejected" && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">
                    KYC Rejected
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Your KYC verification was rejected. Please contact support for more information.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wallet Status</CardTitle>
            <Wallet className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-600">Connected</span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-5 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-600">Not Connected</span>
                </>
              )}
            </div>
            {isConnected && accountId && (
              <p className="text-xs text-muted-foreground font-mono truncate mt-1">
                {accountId}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bonds</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalBonds}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.activeBonds} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Raised</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHbar(metrics.totalRaised)}</div>
            <p className="text-xs text-muted-foreground">
              Across all bonds
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investors</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalInvestors}</div>
            <p className="text-xs text-muted-foreground">
              Total investors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pendingReviews}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/bonds/create">
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex-col gap-2"
                disabled={!profileComplete || !kycApproved || !isConnected}
              >
                <Plus className="size-5" />
                <span className="text-sm">Create New Bond</span>
              </Button>
            </Link>
            <Link href="/bonds/my-bonds">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <FileText className="size-5" />
                <span className="text-sm">View My Bonds</span>
              </Button>
            </Link>
            <Link href="/analytics">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <TrendingUp className="size-5" />
                <span className="text-sm">Analytics</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Bonds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Bonds</CardTitle>
              <CardDescription>Your latest bond offerings</CardDescription>
            </div>
            <Link href="/bonds/my-bonds">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : bonds.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="mx-auto size-12 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">No bonds yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first bond offering to get started
              </p>
              {profileComplete && kycApproved && isConnected && (
                <Link href="/bonds/create">
                  <Button>
                    <Plus className="size-4 mr-1" />
                    Create Bond
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {bonds.map((bond) => {
                const fundingProgress = (bond.fundedHbar / bond.targetHbar) * 100;
                return (
                  <Link
                    key={bond.id}
                    href={`/bonds/${bond.id}`}
                    className="block rounded-lg border p-4 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{bond.name}</h4>
                        <p className="text-sm text-muted-foreground">{bond.sector}</p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(bond.status)}>
                        {bond.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-medium">{formatHbar(bond.targetHbar)}</span>
                      </div>
                      <div>
                        <Progress value={fundingProgress} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>{fundingProgress.toFixed(1)}% funded</span>
                          <span>{formatHbar(bond.fundedHbar)} raised</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

