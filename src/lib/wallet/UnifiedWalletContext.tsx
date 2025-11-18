"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useHederaWallet } from "./HederaWalletContext";
import { useWalletStore, type WalletType } from "@/lib/stores/walletStore";
import { ethers, type Eip1193Provider } from "ethers";
import { toast } from "sonner";

const network = (process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet") as "testnet" | "mainnet";

type MetaMaskProvider = Eip1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

const hederaChainParams =
  network === "mainnet"
    ? {
        chainId: "0x127",
        chainName: "Hedera Mainnet",
        nativeCurrency: {
          name: "HBAR",
          symbol: "HBAR",
          decimals: 18,
        },
        rpcUrls: ["https://mainnet.hashio.io/api"],
        blockExplorerUrls: ["https://hashscan.io"],
      }
    : {
        chainId: "0x128",
        chainName: "Hedera Testnet",
        nativeCurrency: {
          name: "HBAR",
          symbol: "HBAR",
          decimals: 18,
        },
        rpcUrls: ["https://testnet.hashio.io/api"],
        blockExplorerUrls: ["https://hashscan.io/testnet"],
      };

async function ensureHederaNetwork(provider: MetaMaskProvider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hederaChainParams.chainId }],
    });
  } catch (error) {
    const err = error as { code?: number };
    if (err?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [hederaChainParams],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hederaChainParams.chainId }],
      });
    } else {
      throw error;
    }
  }
}

interface UnifiedWalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isInitializing: boolean;
  network: "testnet" | "mainnet";
  walletType: WalletType;
  connectWallet: (type?: "hedera" | "evm") => Promise<void>;
  disconnectWallet: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
  signTransaction: (transactionBytes: Uint8Array) => Promise<unknown>;
  getSigner: () => Promise<ethers.JsonRpcSigner | null>;
}

const UnifiedWalletContext = createContext<UnifiedWalletContextType | undefined>(undefined);

export function UnifiedWalletProvider({ children }: { children: React.ReactNode }) {
  const hederaWallet = useHederaWallet();
  const walletStore = useWalletStore();

  const [evmAccount, setEvmAccount] = useState<string | null>(null);
  const [isEvmConnecting, setIsEvmConnecting] = useState(false);

  const storeAccountId = walletStore.accountId;
  const storeWalletType = walletStore.walletType;

  const getEthereum = useCallback((): MetaMaskProvider | undefined => {
    if (typeof window === "undefined") {
      return undefined;
    }
    return (window as unknown as { ethereum?: MetaMaskProvider }).ethereum;
  }, []);

  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts.filter((a): a is string => typeof a === "string")) : [];
      setEvmAccount(list.length > 0 ? list[0] : null);
    };

    const handleChainChanged = () => {
      // no-op currently, but re-validate account state
    };

    const handleDisconnect = () => {
      setEvmAccount(null);
      setIsEvmConnecting(false);
    };

    ethereum.on?.("accountsChanged", handleAccountsChanged);
    ethereum.on?.("chainChanged", handleChainChanged);
    ethereum.on?.("disconnect", handleDisconnect);

    (async () => {
      try {
        const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
        setEvmAccount(accounts && accounts.length > 0 ? accounts[0] : null);
      } catch (error) {
        console.warn("[Wallet] Failed to detect MetaMask accounts:", error);
      }
    })();

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
      ethereum.removeListener?.("disconnect", handleDisconnect);
    };
  }, [getEthereum]);

  const connectEvmWallet = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      toast.error("MetaMask extension not detected. Please install MetaMask and try again.");
      return;
    }

    try {
      setIsEvmConnecting(true);
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from MetaMask");
      }

      await ensureHederaNetwork(ethereum);
      setEvmAccount(accounts[0]);
      toast.success("MetaMask connected");
    } catch (error) {
      const err = error as { code?: number; message?: string };
      if (err?.code === 4001) {
        toast.info("MetaMask connection rejected");
      } else {
        toast.error(err?.message || "Failed to connect MetaMask");
      }
    } finally {
      setIsEvmConnecting(false);
    }
  }, [getEthereum]);

  const walletType: WalletType = hederaWallet.isConnected
    ? "hedera"
    : evmAccount
      ? "evm"
      : null;

  const isConnected = walletType === "hedera" ? hederaWallet.isConnected : !!evmAccount;
  const accountId = walletType === "hedera" ? hederaWallet.accountId : evmAccount;
  const isInitializing = walletType === "hedera" ? hederaWallet.isInitializing : isEvmConnecting;

  useEffect(() => {
    if (accountId && walletType) {
      const accountChanged = storeAccountId !== accountId;
      const walletTypeChanged = storeWalletType !== walletType;

      if (accountChanged) {
        walletStore.setAccountId(accountId);
      }
      if (walletTypeChanged) {
        walletStore.setWalletType(walletType);
      }
      if (accountChanged || walletTypeChanged) {
        walletStore.updateLastConnected();
      }
    } else if (!accountId && walletType === null) {
      if (storeAccountId !== null || storeWalletType !== null) {
        walletStore.clearWallet();
      }
    }
  }, [accountId, walletType, storeAccountId, storeWalletType, walletStore]);

  const connectWallet = useCallback(async (type?: "hedera" | "evm") => {
    if (type === "evm" || (!type && !hederaWallet.isConnected)) {
      await connectEvmWallet();
    } else {
      await hederaWallet.connectWallet();
    }
  }, [connectEvmWallet, hederaWallet]);

  const disconnectWallet = useCallback(async () => {
    if (walletType === "hedera") {
      await hederaWallet.disconnectWallet();
    } else if (walletType === "evm") {
      setEvmAccount(null);
      setIsEvmConnecting(false);
      walletStore.clearWallet();
      toast.success("MetaMask disconnected");
    }
  }, [walletType, hederaWallet, walletStore]);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    return isConnected;
  }, [isConnected]);

  const signTransaction = useCallback(
    async (transactionBytes: Uint8Array): Promise<unknown> => {
      if (walletType === "hedera") {
        return hederaWallet.signTransaction(transactionBytes);
      } else if (walletType === "evm") {
        throw new Error("EVM transaction signing not yet implemented");
      }
      throw new Error("Wallet not connected");
    },
    [walletType, hederaWallet]
  );

  const getSigner = useCallback(async (): Promise<ethers.JsonRpcSigner | null> => {
    if (walletType === "hedera") {
      return hederaWallet.getSigner();
    } else if (walletType === "evm" && evmAccount) {
      const ethereum = getEthereum();
      if (!ethereum) {
        return null;
      }
      const provider = new ethers.BrowserProvider(ethereum);
      return await provider.getSigner();
    }
    return null;
  }, [walletType, hederaWallet, evmAccount, getEthereum]);

  const value: UnifiedWalletContextType = {
    accountId,
    isConnected,
    isInitializing,
    network: hederaWallet.network,
    walletType,
    connectWallet,
    disconnectWallet,
    checkConnection,
    signTransaction,
    getSigner,
  };

  return (
    <UnifiedWalletContext.Provider value={value}>
      {children}
    </UnifiedWalletContext.Provider>
  );
}

export function useUnifiedWallet() {
  const context = useContext(UnifiedWalletContext);
  if (context === undefined) {
    throw new Error("useUnifiedWallet must be used within UnifiedWalletProvider");
  }
  return context;
}

