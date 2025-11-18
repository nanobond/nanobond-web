"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { requireIssuerRole } from "@/lib/guards";

interface IssuerGuardProps {
  children: React.ReactNode;
}

/**
 * Guard component that restricts access to issuer-only pages
 */
export function IssuerGuard({ children }: IssuerGuardProps) {
  const router = useRouter();
  const { role, loading } = useUserRole();

  useEffect(() => {
    if (loading) return;

    const result = requireIssuerRole(role);
    if (!result.allowed) {
      toast.error(result.reason);
      if (result.redirectTo) {
        router.replace(result.redirectTo);
      }
    }
  }, [role, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const result = requireIssuerRole(role);
  if (!result.allowed) {
    return null;
  }

  return <>{children}</>;
}




