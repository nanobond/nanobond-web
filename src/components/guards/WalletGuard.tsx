"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Wallet } from "lucide-react";
import { useWallet } from "@/lib/hooks/useWallet";
import { requireWalletConnection } from "@/lib/guards/walletGuards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WalletGuardProps {
  children: React.ReactNode;
  mode?: "modal" | "block";
  customMessage?: string;
  redirectTo?: string;
}

/**
 * Guard component that requires wallet connection
 * Can show a modal or block access entirely
 */
export function WalletGuard({
  children,
  mode = "modal",
  customMessage,
  redirectTo,
}: WalletGuardProps) {
  const router = useRouter();
  const { isConnected, accountId, isInitializing, connectWallet } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isInitializing) return;

    const result = requireWalletConnection(isConnected, accountId);
    
    if (!result.allowed) {
      if (mode === "modal") {
        setModalOpen(true);
      } else if (redirectTo) {
        toast.error(result.reason);
        router.replace(redirectTo);
      }
    }
  }, [isConnected, accountId, isInitializing, mode, redirectTo, router]);

  if (isInitializing) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-muted-foreground">Initializing wallet...</div>
      </div>
    );
  }

  const result = requireWalletConnection(isConnected, accountId);

  // Block mode - show blocking UI
  if (!result.allowed && mode === "block") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center max-w-md">
          <Wallet className="mx-auto mb-4 size-12 text-orange-500" />
          <h2 className="mb-2 text-xl font-semibold">Wallet Connection Required</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {customMessage || result.reason}
          </p>
          <Button onClick={connectWallet}>
            <Wallet className="size-4 mr-2" />
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  // Modal mode - show children but with modal
  return (
    <>
      {children}
      <Dialog open={modalOpen && !result.allowed} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex justify-center">
              <AlertCircle className="size-6 text-orange-500" />
            </div>
            <DialogTitle className="text-center">Wallet Connection Required</DialogTitle>
            <DialogDescription className="text-center">
              {customMessage || result.reason}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-2 mt-4">
            <Button
              onClick={() => {
                connectWallet();
                setModalOpen(false);
              }}
            >
              <Wallet className="size-4 mr-2" />
              Connect Wallet
            </Button>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}



