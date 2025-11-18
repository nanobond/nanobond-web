"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { IssuerDashboard } from "@/components/issuer-dashboard";
import { InvestorDashboard } from "@/components/investor-dashboard";

export default function Home() {
  const router = useRouter();
  const { isIssuer, loading } = useUserRole();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.uid);
    });

    return () => unsubscribe();
  }, [router]);

  if (loading || !userId) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  // Show issuer dashboard for issuers
  if (isIssuer) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <section className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of your bond offerings and activity</p>
        </section>
        <IssuerDashboard userId={userId} />
      </main>
    );
  }

  // Show investor dashboard for investors
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your portfolio and market activity
        </p>
      </section>
      <InvestorDashboard userId={userId} />
    </main>
  );
}
