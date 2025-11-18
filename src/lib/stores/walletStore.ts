import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type WalletType = "hedera" | "evm" | null;

interface WalletState {
  accountId: string | null;
  walletType: WalletType;
  network: "testnet" | "mainnet";
  pairingTopic: string | null;
  lastConnected: number | null;
  
  // Actions
  setAccountId: (accountId: string | null) => void;
  setWalletType: (type: WalletType) => void;
  setPairingTopic: (topic: string | null) => void;
  setNetwork: (network: "testnet" | "mainnet") => void;
  updateLastConnected: () => void;
  clearWallet: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      accountId: null,
      walletType: null,
      network: "testnet",
      pairingTopic: null,
      lastConnected: null,

      setAccountId: (accountId) => set({ accountId }),
      
      setWalletType: (type) => set({ walletType: type }),
      
      setPairingTopic: (topic) => set({ pairingTopic: topic }),
      
      setNetwork: (network) => set({ network }),
      
      updateLastConnected: () => set({ lastConnected: Date.now() }),
      
      clearWallet: () => set({
        accountId: null,
        walletType: null,
        pairingTopic: null,
        lastConnected: null,
      }),
    }),
    {
      name: "hedera-wallet-storage",
      storage: createJSONStorage(() => {
        // Only use localStorage in browser environment
        if (typeof window !== "undefined") {
          return localStorage;
        }
        // Return a no-op storage for SSR
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        accountId: state.accountId,
        walletType: state.walletType,
        network: state.network,
        pairingTopic: state.pairingTopic,
        lastConnected: state.lastConnected,
      }),
    }
  )
);

// Selectors
export const selectAccountId = (state: WalletState) => state.accountId;
export const selectIsConnected = (state: WalletState) => state.accountId !== null;
export const selectNetwork = (state: WalletState) => state.network;
export const selectPairingTopic = (state: WalletState) => state.pairingTopic;
export const selectWalletType = (state: WalletState) => state.walletType;



