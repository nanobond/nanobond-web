"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { collection, query as fsQuery, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/db";
import { ArrowUpDown, Building2, Check, Clock, Search, SlidersHorizontal, Info } from "lucide-react";
import { daysUntil, formatHbar } from "@/lib/format";
import { useUserRole } from "@/lib/hooks/useUserRole";
import type { Bond } from "@/lib/types";
import { bondSchema } from "@/lib/schemas";

export default function MarketplacePage() {
  const { isIssuer } = useUserRole();
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const [searchQuery, setSearchQuery] = useState("");
  const [sector, setSector] = useState<string>("All");
  const [sort, setSort] = useState<string>("Highest Interest");

  useEffect(() => {
    const fetchBonds = async () => {
      try {
        // Fetch only published or active bonds for marketplace
        const bondsQuery = fsQuery(
          collection(db, "bonds"),
          where("status", "in", ["published", "active"])
        );
        const bondsSnap = await getDocs(bondsQuery);
        let bondsData = bondsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Bond[];

        // Validate shape to avoid rendering malformed data
        bondsData = bondsData.filter((b) => bondSchema.safeParse(b).success);

        // Sort client-side to avoid Firestore composite index requirement
        bondsData = bondsData.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setBonds(bondsData);
        setLastUpdated(new Date());
      } catch (error) {
        console.error("Error fetching bonds:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBonds();
  }, []);

  const lastUpdatedText = `Updated ${Math.floor((Date.now() - lastUpdated.getTime()) / 60000)} minutes ago`;

  const sectorOptions = useMemo(() => {
    const set = new Set<string>(bonds.map((b) => b.sector));
    return ["All", ...Array.from(set).sort()];
  }, [bonds]);

  const visibleBonds = useMemo(() => {
    let list = bonds.filter((b) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery = !q ||
        b.name.toLowerCase().includes(q) ||
        b.issuerName.toLowerCase().includes(q) ||
        b.sector.toLowerCase().includes(q);
      const matchesSector = sector === "All" || b.sector === sector;
      return matchesQuery && matchesSector;
    });
    if (sort === "Highest Interest") {
      list = [...list].sort((a, b) => b.interestApyPct - a.interestApyPct);
    }
    return list;
  }, [bonds, searchQuery, sector, sort]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bond Marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Discover verified bonds from local businesses</p>
        </div>
        {isIssuer && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Info className="size-3" />
            <span>Browse-only mode</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative grow">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bonds, businesses, or sectors..."
              className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm">
            <SlidersHorizontal className="text-muted-foreground" size={16} />
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-transparent outline-none"
            >
              {sectorOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm">
            <ArrowUpDown className="text-muted-foreground" size={16} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-transparent outline-none"
            >
              <option>Highest Interest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-foreground/80">
          <span className="font-medium">{bonds.length}</span> bonds available
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock size={14} />
          <span>{lastUpdatedText}</span>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="mt-4 text-center text-sm text-muted-foreground py-12">
          Loading bonds...
        </div>
      ) : visibleBonds.length === 0 ? (
        <div className="mt-4 text-center py-12">
          <Building2 className="mx-auto size-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium mb-2">No bonds found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery || sector !== "All" ? "Try adjusting your filters" : "No bonds are currently available in the marketplace"}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visibleBonds.map((bond) => {
            const progress = Math.min(100, Math.round((bond.fundedHbar / bond.targetHbar) * 100));
            const days = daysUntil(bond.maturityDate);
            return (
              <Link
                key={bond.id}
                href={`/marketplace/${bond.id}`}
                className="group block rounded-2xl border bg-card p-5 shadow-sm transition-transform duration-150 hover:shadow-md active:translate-y-px"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold leading-tight">{bond.name}</div>
                      <div className="text-xs text-muted-foreground">{bond.issuerName}</div>
                    </div>
                  </div>
                  {bond.verified && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                      <Check size={14} />
                      Verified
                    </span>
                  )}
                </div>

                {/* Description */}
                <div className="mt-4 text-[15px] text-foreground">{bond.description}</div>

                {/* Vertical details */}
                <div className="mt-4 space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-muted-foreground">Interest Rate</div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">{bond.interestApyPct}% APY</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-muted-foreground">Duration</div>
                    <div className="font-semibold">{bond.durationMonths} months</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-muted-foreground">Collateral</div>
                    <div className="font-semibold">{bond.collateral}</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">Funding Progress</div>
                      <div className="text-sm font-medium text-foreground">
                        {formatHbar(bond.fundedHbar)} / {formatHbar(bond.targetHbar)}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="h-1.5 w-full rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{progress.toFixed(1)}% funded</span>
                        <span className="text-muted-foreground">{days} days to maturity</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}


