import { useUnifiedWallet } from "@/lib/wallet/UnifiedWalletContext";
import { useWalletStore } from "@/lib/stores/walletStore";
import { useEffect } from "react";

/**
 * Custom hook that provides a unified interface for both Hedera and EVM wallets
 */
export function useWallet() {
  const unifiedWallet = useUnifiedWallet();
  const walletStore = useWalletStore();

  // Sync unified wallet state with store
  useEffect(() => {
    if (unifiedWallet.accountId) {
      walletStore.setAccountId(unifiedWallet.accountId);
      walletStore.setWalletType(unifiedWallet.walletType);
      walletStore.updateLastConnected();
    } else {
      walletStore.clearWallet();
    }
  }, [unifiedWallet.accountId, unifiedWallet.walletType]);

  useEffect(() => {
    walletStore.setNetwork(unifiedWallet.network);
  }, [unifiedWallet.network]);

  return {
    // From unified wallet
    accountId: unifiedWallet.accountId,
    isConnected: unifiedWallet.isConnected,
    isInitializing: unifiedWallet.isInitializing,
    network: unifiedWallet.network,
    walletType: unifiedWallet.walletType,
    
    // From store (persisted state)
    lastConnected: walletStore.lastConnected,
    
    // Methods
    connectWallet: unifiedWallet.connectWallet,
    disconnectWallet: unifiedWallet.disconnectWallet,
    checkConnection: unifiedWallet.checkConnection,
    signTransaction: unifiedWallet.signTransaction,
    getSigner: unifiedWallet.getSigner,
  };
}



