"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "@/lib/db";
import type { Bond, Investment } from "@/lib/types";

export type TimestampLike =
  | {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    }
  | Date
  | null
  | undefined;

export interface InvestmentWithBond extends Omit<Investment, "units" | "investedAt" | "status"> {
  investedAt?: TimestampLike;
  status?: string;
  units?: number;
  walletAddress?: string;
  transactionHash?: string;
  bond?: Bond | null;
}

export interface AllocationSlice {
  sector: string;
  amount: number;
  percent: number;
}

export const toDate = (value: TimestampLike): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value.seconds === "number") {
    const millis = value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
    return new Date(millis);
  }
  return null;
};

export const formatRelativeTime = (date: Date | null) => {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export function useInvestorPortfolio(userId?: string | null) {
  const [investments, setInvestments] = useState<InvestmentWithBond[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setInvestments([]);
      setLoading(true);
      setError(null);
      return;
    }

    let active = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const investmentsQuery = query(
          collection(db, "investments"),
          where("investorId", "==", userId)
        );
        const investmentsSnap = await getDocs(investmentsQuery);
        const investmentDocs = investmentsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as InvestmentWithBond[];

        const bondIds = Array.from(
          new Set(investmentDocs.map((investment) => investment.bondId).filter(Boolean))
        ) as string[];

        const bondsMap = new Map<string, Bond>();
        await Promise.all(
          bondIds.map(async (bondId) => {
            const bondRef = doc(db, "bonds", bondId);
            const bondSnap = await getDoc(bondRef);
            if (bondSnap.exists()) {
              bondsMap.set(bondId, { id: bondSnap.id, ...bondSnap.data() } as Bond);
            }
          })
        );

        const enrichedInvestments = investmentDocs.map((investment) => ({
          ...investment,
          bond: investment.bond ?? bondsMap.get(investment.bondId) ?? null,
        }));

        if (!active) return;

        setInvestments(enrichedInvestments);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch investor portfolio data", err);
        if (!active) return;
        setInvestments([]);
        setError("We couldn't load your investments. Please try again shortly.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [userId]);

  const metrics = useMemo(() => {
    const activeInvestments = investments.filter((investment) => investment.status !== "cancelled");
    const investedBalance = activeInvestments.reduce(
      (sum, investment) => sum + (investment.amountHbar || 0),
      0
    );

    const last24hCutoff = Date.now() - 24 * 60 * 60 * 1000;
    let last24hAmount = 0;
    let last24hCount = 0;
    activeInvestments.forEach((investment) => {
      const investedAt = toDate(investment.investedAt);
      if (investedAt && investedAt.getTime() >= last24hCutoff) {
        last24hAmount += investment.amountHbar || 0;
        last24hCount += 1;
      }
    });

    const activePositions = new Set(activeInvestments.map((investment) => investment.bondId)).size;

    const allocationMap = new Map<string, number>();
    activeInvestments.forEach((investment) => {
      const sector = investment.bond?.sector || "Uncategorized";
      allocationMap.set(sector, (allocationMap.get(sector) || 0) + (investment.amountHbar || 0));
    });

    const allocation: AllocationSlice[] = investedBalance
      ? Array.from(allocationMap.entries())
          .map(([sector, amount]) => ({
            sector,
            amount,
            percent: (amount / investedBalance) * 100,
          }))
          .sort((a, b) => b.amount - a.amount)
      : [];

    const averageYield =
      activeInvestments.length > 0
        ? activeInvestments.reduce(
            (sum, investment) => sum + (investment.bond?.interestApyPct || 0),
            0
          ) / activeInvestments.length
        : 0;

    const upcomingMaturity =
      activeInvestments
        .map((investment) => {
          if (!investment.bond?.maturityDate) return null;
          const date = new Date(investment.bond.maturityDate);
          if (isNaN(date.getTime())) return null;
          return {
            bondName: investment.bond.name,
            date,
          };
        })
        .filter(
          (value): value is { bondName: string; date: Date } =>
            value !== null && value !== undefined
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null;

    const holdingsMap = new Map<string, { total: number; bond: Bond | null }>();
    activeInvestments.forEach((investment) => {
      if (!investment.bondId) return;
      const existing = holdingsMap.get(investment.bondId) ?? {
        total: 0,
        bond: investment.bond ?? null,
      };
      existing.total += investment.amountHbar || 0;
      existing.bond = existing.bond || investment.bond || null;
      holdingsMap.set(investment.bondId, existing);
    });

    const topHoldings = Array.from(holdingsMap.entries())
      .map(([bondId, data]) => ({
        bondId,
        total: data.total,
        bond: data.bond,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);

    const recentActivity = [...activeInvestments]
      .sort((a, b) => {
        const aTime = toDate(a.investedAt)?.getTime() ?? 0;
        const bTime = toDate(b.investedAt)?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 5);

    return {
      investedBalance,
      last24hAmount,
      last24hCount,
      activePositions,
      activeInvestmentCount: activeInvestments.length,
      allocation,
      averageYield,
      upcomingMaturity,
      topHoldings,
      recentActivity,
    };
  }, [investments]);

  return {
    investments,
    loading,
    error,
    ...metrics,
  };
}


