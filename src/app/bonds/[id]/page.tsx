"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/db";
import { IssuerGuard } from "@/components/guards/IssuerGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Edit,
  FileText,
  Shield,
  TrendingUp,
  Users,
  Download,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { Bond, BondStatus } from "@/lib/types";
import { formatHbar } from "@/lib/format";
import { toast } from "sonner";

interface Investment {
  id: string;
  investorId: string;
  investorName: string;
  amountHbar: number;
  timestamp: any;
  status: string;
}

export default function BondDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const bondId = params.id as string;
  const [userId, setUserId] = useState<string | null>(null);
  const [bond, setBond] = useState<Bond | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.uid);

      try {
        // Fetch bond data
        const bondRef = doc(db, "bonds", bondId);
        const bondSnap = await getDoc(bondRef);

        if (!bondSnap.exists()) {
          toast.error("Bond not found");
          router.push("/bonds/my-bonds");
          return;
        }

        const bondData = { id: bondSnap.id, ...bondSnap.data() } as Bond;

        // Check if user owns this bond
        if (bondData.issuerId !== user.uid) {
          toast.error("You don't have permission to view this bond");
          router.push("/bonds/my-bonds");
          return;
        }

        setBond(bondData);

        // Fetch investments for this bond
        const investmentsQuery = query(
          collection(db, "investments"),
          where("bondId", "==", bondId)
        );
        const investmentsSnap = await getDocs(investmentsQuery);
        const investmentsData = investmentsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Investment[];

        setInvestments(investmentsData);
      } catch (error) {
        console.error("Error fetching bond:", error);
        toast.error("Failed to load bond details");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [bondId, router]);

  if (loading) {
    return (
      <IssuerGuard>
        <main className="min-h-screen bg-background">
          <div className="mx-auto w-full max-w-7xl px-4 py-8">
            <div className="text-center">
              <p className="text-muted-foreground">Loading bond details...</p>
            </div>
          </div>
        </main>
      </IssuerGuard>
    );
  }

  if (!bond) {
    return null;
  }

  const getStatusBadgeVariant = (status: BondStatus) => {
    switch (status) {
      case "draft":
        return "outline";
      case "under_review":
        return "secondary";
      case "approved":
      case "published":
      case "active":
        return "default";
      case "rejected":
      case "defaulted":
        return "destructive";
      case "matured":
        return "secondary";
      default:
        return "outline";
    }
  };

  const maturityDate = new Date(bond.maturityDate);
  const formattedMaturity = maturityDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const fundingProgress = (bond.fundedHbar / bond.targetHbar) * 100;
  const totalInvestors = investments.length;

  return (
    <IssuerGuard>
      <main className="min-h-screen bg-background pb-12">
        {/* Header */}
        <div className="border-b bg-background">
          <div className="mx-auto w-full max-w-7xl px-4 py-4">
            <Link
              href="/bonds/my-bonds"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to My Bonds
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 py-8">
          {/* Bond Header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Building2 size={32} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant={getStatusBadgeVariant(bond.status)}>
                    {bond.status.replace("_", " ")}
                  </Badge>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">{bond.sector}</span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">{bond.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {bond.status === "draft" && (
                <Link href={`/bonds/edit/${bond.id}`}>
                  <Button>
                    <Edit className="size-4 mr-1" />
                    Edit Bond
                  </Button>
                </Link>
              )}
              {(bond.status === "active" || bond.status === "published") && (
                <Link href={`/analytics?bondId=${bond.id}`}>
                  <Button variant="outline">
                    <TrendingUp className="size-4 mr-1" />
                    Analytics
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Status Messages */}
          {bond.status === "under_review" && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-200">
                    Under Review
                  </h3>
                  <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                    Your bond is currently being reviewed by our team. We'll notify you once
                    the review is complete.
                  </p>
                </div>
              </div>
            </div>
          )}

          {bond.status === "rejected" && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <h3 className="font-semibold text-red-900 dark:text-red-200">
                    Bond Rejected
                  </h3>
                  <p className="mt-1 text-sm text-red-800 dark:text-red-300">
                    {bond.rejectionReason || "Your bond application was rejected. Please contact support for more information."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {bond.status === "approved" && (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-200">
                    Bond Approved
                  </h3>
                  <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                    Your bond has been approved and is ready to be published to the marketplace.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Overview Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription className="text-xs">Target Amount</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatHbar(bond.targetHbar)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription className="text-xs">Funded Amount</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {formatHbar(bond.fundedHbar)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription className="text-xs">Total Investors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalInvestors}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Funding Progress */}
              <Card>
                <CardHeader>
                  <CardTitle>Funding Progress</CardTitle>
                  <CardDescription>
                    {formatHbar(bond.fundedHbar)} raised of {formatHbar(bond.targetHbar)} target
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress value={fundingProgress} className="h-3" />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{fundingProgress.toFixed(1)}% funded</span>
                    <span className="font-medium">
                      {formatHbar(bond.targetHbar - bond.fundedHbar)} remaining
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Bond Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Bond Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-start gap-3">
                      <DollarSign className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Interest Rate</div>
                        <div className="text-lg font-semibold">{bond.interestApyPct}% APY</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Maturity Date</div>
                        <div className="text-lg font-semibold">{formattedMaturity}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <DollarSign className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Coupon Rate</div>
                        <div className="text-lg font-semibold">{bond.couponRate}%</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Payment Frequency</div>
                        <div className="text-lg font-semibold">{bond.paymentFrequency}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="text-sm text-muted-foreground mb-2">Description</div>
                    <p className="text-sm leading-relaxed">{bond.fullDescription}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Financial Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-sm text-muted-foreground">Face Value</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatHbar(bond.faceValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Min Investment</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatHbar(bond.minInvestment)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Duration</div>
                      <div className="mt-1 text-lg font-semibold">
                        {bond.durationMonths} months
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Risk Level</div>
                      <div className="mt-1">
                        <Badge>{bond.riskLevel}</Badge>
                      </div>
                    </div>
                  </div>

                  {bond.collateral && (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-start gap-2">
                        <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Collateral</div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {bond.collateral}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Investors */}
              {investments.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Investors ({investments.length})
                    </CardTitle>
                    <CardDescription>
                      List of all investors in this bond
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Investor</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {investments.map((investment) => (
                            <TableRow key={investment.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {investment.investorName || "Anonymous Investor"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {formatHbar(investment.amountHbar)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-muted-foreground">
                                  {investment.timestamp?.toDate?.()?.toLocaleDateString() || "N/A"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={investment.status === "completed" ? "default" : "secondary"}>
                                  {investment.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              {/* Documents */}
              {bond.documents && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {bond.documents.termSheetUrl && (
                      <a
                        href={bond.documents.termSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">Term Sheet</span>
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                    {bond.documents.financialStatementsUrl && (
                      <a
                        href={bond.documents.financialStatementsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">Financial Statements</span>
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                    {bond.documents.collateralDocumentsUrl && (
                      <a
                        href={bond.documents.collateralDocumentsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">Collateral Documents</span>
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                    {bond.documents.legalDocumentsUrl && (
                      <a
                        href={bond.documents.legalDocumentsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">Legal Documents</span>
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {bond.createdAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <div className="h-full w-px bg-border" />
                      </div>
                      <div className="pb-4">
                        <div className="text-sm font-medium">Created</div>
                        <div className="text-xs text-muted-foreground">
                          {bond.createdAt?.toDate?.()?.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  )}
                  {bond.submittedForReviewAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <div className="h-full w-px bg-border" />
                      </div>
                      <div className="pb-4">
                        <div className="text-sm font-medium">Submitted for Review</div>
                        <div className="text-xs text-muted-foreground">
                          {bond.submittedForReviewAt?.toDate?.()?.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  )}
                  {bond.publishedAt && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <div className="h-full w-px bg-border" />
                      </div>
                      <div className="pb-4">
                        <div className="text-sm font-medium">Published</div>
                        <div className="text-xs text-muted-foreground">
                          {bond.publishedAt?.toDate?.()?.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Maturity</div>
                      <div className="text-xs text-muted-foreground">
                        {formattedMaturity}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Rating</span>
                    <Badge variant="outline">{bond.rating || "Unrated"}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Sector</span>
                    <span className="text-sm font-medium">{bond.sector}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Available</span>
                    <span className="text-sm font-medium">
                      {formatHbar(bond.available)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </IssuerGuard>
  );
}


