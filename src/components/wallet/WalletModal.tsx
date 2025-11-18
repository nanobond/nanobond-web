"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/hooks/useWallet";
import { WalletInfo } from "./WalletInfo";
import { ExternalLink, Download, Wallet } from "lucide-react";

interface WalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletModal({ open, onOpenChange }: WalletModalProps) {
  const { isConnected, connectWallet, isInitializing } = useWallet();

  if (isConnected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet Connected</DialogTitle>
            <DialogDescription>
              Your wallet is connected to Nanobond
            </DialogDescription>
          </DialogHeader>
          <WalletInfo />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Choose a wallet type to connect to Nanobond
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hedera Native Wallets */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase">Hedera Native Wallets</h3>
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                  <svg
                    viewBox="0 0 40 40"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-8"
                  >
                    <path
                      d="M20 0L0 11.547V28.453L20 40L40 28.453V11.547L20 0Z"
                      fill="currentColor"
                      className="text-primary"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">HashPack Wallet</h4>
                  <p className="text-sm text-muted-foreground">
                    The most popular Hedera wallet with browser extension and mobile app
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                connectWallet("hedera");
                onOpenChange(false);
              }}
              disabled={isInitializing}
              className="w-full"
              variant="outline"
            >
              Connect Hedera Wallet
            </Button>
          </div>

          {/* EVM Wallets */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase">EVM Wallets</h3>
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                  <Wallet className="size-8" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">MetaMask & Others</h4>
                  <p className="text-sm text-muted-foreground">
                    Connect via MetaMask, WalletConnect, or other EVM-compatible wallets
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                connectWallet("evm");
                onOpenChange(false);
              }}
              disabled={isInitializing}
              className="w-full"
              variant="outline"
            >
              Connect EVM Wallet
            </Button>
          </div>

          {/* Download Links */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-3">
              Don't have a wallet?
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                asChild
              >
                <a
                  href="https://www.hashpack.app/download"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="size-4 mr-2" />
                  Download HashPack
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                asChild
              >
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="size-4 mr-2" />
                  Download MetaMask
                </a>
              </Button>
            </div>
          </div>

          {/* Network Info */}
          <div className="text-center text-xs text-muted-foreground">
            Network: Hedera Testnet (EVM Compatible)
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

