"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { User2 } from "lucide-react";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { WalletButton } from "@/components/wallet/WalletButton";

const NavLink = ({ href, label }: { href: string; label: string }) => {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} className={cn("inline-flex")}> 
      <Button
        variant="ghost"
        className={cn(
          "h-11 px-3",
          active && "font-medium text-primary bg-primary/10 hover:bg-primary/15"
        )}
      >
        {label}
      </Button>
    </Link>
  );
};

export function AppNavbar() {
  const { role, loading } = useUserRole();

  // Show loading state or default nav while determining role
  if (loading) {
    return (
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">Nanobond</span>
            </span>
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">Nanobond</span>
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-1">
          {role === "issuer" ? (
            <>
              <NavLink href="/" label="Dashboard" />
              <NavLink href="/bonds/my-bonds" label="My Bonds" />
              <NavLink href="/analytics" label="Analytics" />
              <NavLink href="/marketplace" label="Marketplace" />
            </>
          ) : (
            <>
              <NavLink href="/" label="Dashboard" />
              <NavLink href="/marketplace" label="Marketplace" />
              <NavLink href="/portfolio" label="Portfolio" />
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <WalletButton variant="outline" size="default" />
          <Link href="/profile" aria-label="Account">
            <Button variant="outline" size="icon" className="rounded-full">
              <User2 className="size-5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}


