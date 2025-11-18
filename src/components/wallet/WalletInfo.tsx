"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, LogOut, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/hooks/useWallet";
import { toast } from "sonner";

export function WalletInfo() {
  const { accountId, network, disconnectWallet, lastConnected } = useWallet();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    if (!accountId) return;
    
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy address");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  const getExplorerUrl = () => {
    if (!accountId) return "";
    
    const baseUrl = network === "mainnet" 
      ? "https://hashscan.io" 
      : "https://hashscan.io/testnet";
    
    // EVM addresses start with 0x
    if (accountId.startsWith("0x")) {
      return `${baseUrl}/address/${accountId}`;
    }
    
    // Hedera account IDs
    return `${baseUrl}/account/${accountId}`;
  };

  if (!accountId) return null;

  return (
    <div className="space-y-4">
      {/* Account ID */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Account ID</span>
          <Badge variant={network === "testnet" ? "info" : "success"}>
            {network === "testnet" ? "Testnet" : "Mainnet"}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono">
            {accountId}
          </code>
          <Button
            variant="outline"
            size="icon"
            onClick={copyToClipboard}
            className="shrink-0"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Connection Info */}
      {lastConnected && (
        <div className="text-sm text-muted-foreground">
          Connected: {new Date(lastConnected).toLocaleString()}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="outline"
          className="flex-1"
          asChild
        >
          <a
            href={getExplorerUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4 mr-2" />
            View on HashScan
          </a>
        </Button>
        <Button
          variant="destructive"
          onClick={handleDisconnect}
          className="flex-1"
        >
          <LogOut className="size-4 mr-2" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}



