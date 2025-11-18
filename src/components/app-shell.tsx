"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AppNavbar } from "@/components/app-navbar";
import { useUserStore } from "@/lib/stores/userStore";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname.startsWith("/auth");
  const initialize = useUserStore((state) => state.initialize);

  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  return (
    <div className="min-h-svh flex flex-col">
      {!hideNav && <AppNavbar />}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}


