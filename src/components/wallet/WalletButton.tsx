"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useWallet } from "@/lib/hooks/useWallet";
import { WalletModal } from "./WalletModal";
import { cn } from "@/lib/utils";

interface WalletButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showFullAddress?: boolean;
  className?: string;
}

export function WalletButton({
  variant = "outline",
  size = "default",
  showFullAddress = false,
  className,
}: WalletButtonProps) {
  const { accountId, isConnected, isInitializing, connectWallet } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  const formatAccountId = (id: string) => {
    if (showFullAddress) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  };

  const handleClick = () => {
    if (isConnected) {
      setModalOpen(true);
    } else {
      connectWallet();
    }
  };

  if (isInitializing) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Wallet className="size-4 mr-2" />
        Loading...
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn(
          isConnected && "border-emerald-500/50 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20",
          className
        )}
      >
        <Wallet className={cn("size-4", size !== "icon" && "mr-2")} />
        {size !== "icon" && (
          <span>{isConnected ? formatAccountId(accountId!) : "Connect Wallet"}</span>
        )}
      </Button>

      <WalletModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}



