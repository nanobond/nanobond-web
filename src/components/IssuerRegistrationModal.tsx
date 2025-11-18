"use client";

import { useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useIssuerRegistration } from "@/lib/hooks/useIssuerRegistration";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Wallet } from "lucide-react";

interface IssuerRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssuerRegistrationModal({ open, onOpenChange }: IssuerRegistrationModalProps) {
  const { accountId, isConnected, connectWallet } = useWallet();
  const { registerIssuer, isRegistering, isChecking } = useIssuerRegistration();
  const [walletAddress, setWalletAddress] = useState("");

  const handleRegister = async () => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    const addressToRegister = walletAddress.trim() || accountId || "";
    
    if (!addressToRegister) {
      return;
    }

    const success = await registerIssuer(addressToRegister);
    if (success) {
      onOpenChange(false);
      setWalletAddress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Register as Issuer
          </DialogTitle>
          <DialogDescription>
            You need to register your wallet address as an issuer on the blockchain before you can create bonds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isChecking ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                Checking registration status...
              </p>
            </div>
          ) : !isConnected ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Please connect your wallet first to register as an issuer.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="wallet-address" className="text-sm font-medium">
                  Wallet Address
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="wallet-address"
                    placeholder={accountId || "0x..."}
                    value={walletAddress || accountId || ""}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    disabled={!accountId}
                    className="font-mono text-sm"
                  />
                  {accountId && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wallet className="h-3 w-3" />
                      Connected
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {accountId 
                    ? "This will register your connected wallet address. You can also specify a different address."
                    : "Enter the wallet address you want to register as an issuer."}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Note:</strong> Registration is a one-time blockchain transaction. After registration, 
                  you'll be able to create and manage bonds. KYC approval is handled separately by the admin.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRegistering}>
            Cancel
          </Button>
          {!isConnected ? (
            <Button onClick={() => connectWallet()}>
              Connect Wallet
            </Button>
          ) : (
            <Button onClick={handleRegister} disabled={isRegistering || !accountId}>
              {isRegistering ? "Registering..." : "Register Issuer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

