"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { Button } from "@/components/ui/button";

interface ProfileCompleteGuardProps {
  children: React.ReactNode;
  showBanner?: boolean;
}

/**
 * Guard component that shows a banner if profile is incomplete
 */
export function ProfileCompleteGuard({ children, showBanner = true }: ProfileCompleteGuardProps) {
  const { profileComplete, isIssuer, loading } = useUserRole();

  if (loading || !isIssuer) {
    return <>{children}</>;
  }

  if (!profileComplete && showBanner) {
    return (
      <>
        <div className="border-b bg-orange-50 dark:bg-orange-950/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-orange-600 dark:text-orange-400" />
              <div>
                <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Complete your company profile
                </div>
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  You need to complete your profile before you can create bonds
                </div>
              </div>
            </div>
            <Link href="/profile">
              <Button size="sm" variant="default">
                Complete Profile
              </Button>
            </Link>
          </div>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}




