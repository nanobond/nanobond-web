"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/db";
import { IssuerGuard } from "@/components/guards/IssuerGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, FileText, TrendingUp, Edit, Copy, MoreHorizontal } from "lucide-react";
import type { Bond, BondStatus } from "@/lib/types";
import { formatHbar } from "@/lib/format";

export default function MyBondsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<BondStatus | "all">("all");

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
      } catch (error) {
        console.error("Error fetching bonds:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const filteredBonds = useMemo(() => {
    if (statusFilter === "all") return bonds;
    return bonds.filter((b) => b.status === statusFilter);
  }, [bonds, statusFilter]);

  const getStatusBadgeVariant = (status: BondStatus) => {
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
      case "defaulted":
        return "destructive";
      default:
        return "outline";
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<BondStatus | "all", number> = {
      all: bonds.length,
      draft: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      published: 0,
      active: 0,
      matured: 0,
      defaulted: 0,
    };

    bonds.forEach((bond) => {
      counts[bond.status]++;
    });

    return counts;
  }, [bonds]);

  return (
    <IssuerGuard>
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">My Bonds</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your bond offerings and track their performance
            </p>
          </div>
          <Link href="/bonds/create">
            <Button>
              <Plus className="size-4 mr-1" />
              Create Bond
            </Button>
          </Link>
        </div>

        {/* Status Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button
            variant={statusFilter === "all" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All ({statusCounts.all})
          </Button>
          <Button
            variant={statusFilter === "draft" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("draft")}
          >
            Drafts ({statusCounts.draft})
          </Button>
          <Button
            variant={statusFilter === "under_review" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("under_review")}
          >
            Under Review ({statusCounts.under_review})
          </Button>
          <Button
            variant={statusFilter === "active" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("active")}
          >
            Active ({statusCounts.active})
          </Button>
          <Button
            variant={statusFilter === "matured" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("matured")}
          >
            Matured ({statusCounts.matured})
          </Button>
        </div>

        {/* Bonds Table */}
        <div className="rounded-xl border bg-card shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading your bonds...
            </div>
          ) : filteredBonds.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto size-12 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">No bonds found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {statusFilter === "all"
                  ? "You haven't created any bonds yet"
                  : `No bonds with status: ${statusFilter.replace("_", " ")}`}
              </p>
              {statusFilter === "all" && (
                <Link href="/bonds/create">
                  <Button>
                    <Plus className="size-4 mr-1" />
                    Create Your First Bond
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bond Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Funded</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBonds.map((bond) => {
                    const fundingProgress = (bond.fundedHbar / bond.targetHbar) * 100;
                    return (
                      <TableRow key={bond.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{bond.name}</div>
                            <div className="text-xs text-muted-foreground">{bond.sector}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(bond.status)}>
                            {bond.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatHbar(bond.targetHbar)}</TableCell>
                        <TableCell>{formatHbar(bond.fundedHbar)}</TableCell>
                        <TableCell>
                          <div className="w-32">
                            <Progress value={fundingProgress} />
                            <div className="text-xs text-muted-foreground mt-1">
                              {fundingProgress.toFixed(1)}%
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {bond.interestApyPct}% APY
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link href={`/bonds/${bond.id}`}>
                              <Button variant="ghost" size="sm">
                                <FileText className="size-4" />
                              </Button>
                            </Link>
                            {bond.status === "draft" && (
                              <Link href={`/bonds/edit/${bond.id}`}>
                                <Button variant="ghost" size="sm">
                                  <Edit className="size-4" />
                                </Button>
                              </Link>
                            )}
                            {(bond.status === "active" || bond.status === "published") && (
                              <Link href={`/analytics?bondId=${bond.id}`}>
                                <Button variant="ghost" size="sm">
                                  <TrendingUp className="size-4" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {!loading && bonds.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total Raised</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatHbar(bonds.reduce((sum, b) => sum + b.fundedHbar, 0))}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total Target</div>
              <div className="mt-1 text-2xl font-semibold">
                {formatHbar(bonds.reduce((sum, b) => sum + b.targetHbar, 0))}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Active Bonds</div>
              <div className="mt-1 text-2xl font-semibold">{statusCounts.active}</div>
            </div>
          </div>
        )}
      </main>
    </IssuerGuard>
  );
}

