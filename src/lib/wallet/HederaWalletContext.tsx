"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  DAppConnector,
  HederaSessionEvent,
  HederaJsonRpcMethod,
  HederaChainId,
} from "@hashgraph/hedera-wallet-connect";
import { LedgerId } from "@hashgraph/sdk";
import { ethers } from "ethers";
import { toast } from "sonner";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/db";

interface HederaWalletContextType {
  // State
  accountId: string | null;
  isConnected: boolean;
  isInitializing: boolean;
  network: "testnet" | "mainnet";
  topic: string | null;
  
  // Methods
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  checkConnection: () => Promise<boolean>;
  signTransaction: (transactionBytes: Uint8Array) => Promise<unknown>;
  getConnector: () => DAppConnector | null;
  getSigner: () => Promise<ethers.JsonRpcSigner | null>;
}

const HederaWalletContext = createContext<HederaWalletContextType | undefined>(undefined);

const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Nanobond",
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Decentralized Bond Platform",
  url: typeof window !== "undefined" ? window.location.origin : "https://nanobond.app",
  icons: [typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : ""],
};

const NETWORK = (process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet") as "testnet" | "mainnet";

interface HederaWalletProviderProps {
  children: React.ReactNode;
}

export function HederaWalletProvider({ children }: HederaWalletProviderProps) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const topic: string | null = null;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Log state changes
  useEffect(() => {
    console.log("[Wallet] State update - accountId:", accountId, "isConnected:", isConnected);
  }, [accountId, isConnected]);
  
  const dappConnectorRef = useRef<DAppConnector | null>(null);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
    });
    return unsubscribe;
  }, []);

  // Sync wallet address to Firestore
  const syncWalletToFirestore = useCallback(async (accountId: string | null) => {
    console.log("[Wallet] 💾 Syncing to Firestore - User ID:", currentUserId, "Account:", accountId);
    if (!currentUserId) {
      console.log("[Wallet] Skipping Firestore sync - no user logged in");
      return;
    }

    try {
      const userRef = doc(db, "users", currentUserId);
      if (accountId) {
        await setDoc(userRef, {
          walletAddress: accountId,
          walletPairedAt: serverTimestamp(),
          walletNetwork: NETWORK,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("[Wallet] ✓ Wallet address synced to Firestore:", accountId);
      } else {
        // Clear wallet data on disconnect
        await setDoc(userRef, {
          walletAddress: null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("[Wallet] ✓ Wallet address cleared from Firestore");
      }
    } catch (error) {
      console.error("[Wallet] ✗ Failed to sync wallet to Firestore:", error);
    }
  }, [currentUserId]);

  // Initialize Hedera Wallet Connect DAppConnector
  const initializeConnector = useCallback(async () => {
    // If already initializing, return the existing promise
    if (initializationPromiseRef.current) {
      console.log("[Wallet] Already initializing, returning existing promise");
      return initializationPromiseRef.current;
    }

    // Create initialization promise
    initializationPromiseRef.current = (async () => {
      try {
        console.log("[Wallet] Starting initialization...");
        if (dappConnectorRef.current) {
          console.log("[Wallet] Already initialized");
          return; // Already initialized
        }
        const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
        console.log("[Wallet] Project ID:", projectId ? "✓ Found" : "✗ Missing");
        console.log("[Wallet] Network:", NETWORK);
        console.log("[Wallet] App config:", APP_CONFIG);
        
        if (!projectId) {
          console.error("[Wallet] Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
          toast.error("WalletConnect project ID missing");
        }

        const ledgerId = NETWORK === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET;
        console.log("[Wallet] Ledger ID:", ledgerId);

        const connector = new DAppConnector(
          APP_CONFIG,
          ledgerId,
          projectId || "",
          Object.values(HederaJsonRpcMethod),
          [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
          [HederaChainId.Mainnet, HederaChainId.Testnet]
        );

        console.log("[Wallet] DAppConnector created, initializing...");
        await connector.init({ logger: "error" });
        console.log("[Wallet] DAppConnector initialized successfully");
        dappConnectorRef.current = connector;

        // Attempt to restore active session and account
        console.log("[Wallet] Checking for existing session...");
        try {
          type WCSession = { namespaces?: Record<string, { accounts?: string[] }> };
          const sUnknown: unknown = (connector as unknown as { getActiveSession?: () => unknown; session?: unknown }).getActiveSession?.() || (connector as unknown as { session?: unknown }).session;
          console.log("[Wallet] Session object:", sUnknown);
          const session = (sUnknown || {}) as WCSession;
          const accounts: string[] | undefined = session?.namespaces?.hedera?.accounts;
          console.log("[Wallet] Hedera accounts from session:", accounts);
          
          if (accounts && accounts.length > 0) {
            // Format: "hedera:testnet:0.0.x" → take last segment
            const first = accounts[0];
            const parts = first.split(":");
            const acct = parts[parts.length - 1];
            console.log("[Wallet] ✓ Restored account from session:", acct);
            setAccountId(acct);
            setIsConnected(true);
            localStorage.setItem("hedera_account_id", acct);
            await syncWalletToFirestore(acct);
          } else {
            console.log("[Wallet] No existing session found");
          }
        } catch (err) {
          console.log("[Wallet] Error checking session (this is normal if no previous connection):", err);
        }

        // Session/account change listener
        console.log("[Wallet] Setting up AccountsChanged event listener");
        (connector as unknown as { on?: (event: HederaSessionEvent, handler: (payload: unknown) => void) => void }).on?.(HederaSessionEvent.AccountsChanged, (payload: unknown) => {
          console.log("[Wallet] 🔔 AccountsChanged event received:", payload);
          try {
            const p = payload as unknown as { accounts?: string[] } | string[];
            const accs: string[] | undefined = Array.isArray(p) ? p : p.accounts;
            console.log("[Wallet] Extracted accounts:", accs);
            
            if (Array.isArray(accs) && accs.length > 0) {
              const first = accs[0];
              console.log("[Wallet] First account (CAIP format):", first);
              const parts = first.split(":");
              const acct = parts[parts.length - 1];
              console.log("[Wallet] ✓ Parsed account ID:", acct);
              
              setAccountId(acct);
              setIsConnected(true);
              localStorage.setItem("hedera_account_id", acct);
              syncWalletToFirestore(acct);
              toast.success(`Wallet connected: ${acct}`);
            } else {
              console.log("[Wallet] ✗ No accounts in payload");
            }
          } catch (err) {
            console.error("[Wallet] Error handling AccountsChanged event:", err);
          }
        });
      } catch (error) {
        console.error("[Wallet] ✗ Failed to initialize Hedera Wallet Connect:", error);
        toast.error("Failed to initialize wallet connection");
      } finally {
        console.log("[Wallet] Initialization complete, isInitializing set to false");
        setIsInitializing(false);
      }
    })();

    return initializationPromiseRef.current;
  }, [syncWalletToFirestore]);

  // Initialize on mount
  useEffect(() => {
    initializeConnector();
  }, [initializeConnector]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    console.log("[Wallet] 🔌 connectWallet called");
    try {
      if (!dappConnectorRef.current) {
        console.log("[Wallet] Connector not initialized, initializing...");
        await initializeConnector();
      }

      const connector = dappConnectorRef.current;
      if (!connector) throw new Error("Connector not initialized");

      // Try multiple methods to connect - Hedera Wallet Connect API may vary
      type ConnectorMethods = { 
        openModal?: () => Promise<unknown>;
        connect?: () => Promise<unknown>;
        request?: (method: string, params?: unknown[]) => Promise<unknown>;
      };
      const connectorMethods = connector as unknown as ConnectorMethods;

      console.log("[Wallet] Connector exists:", !!connector);
      console.log("[Wallet] Available methods:", {
        openModal: typeof connectorMethods.openModal === "function",
        connect: typeof connectorMethods.connect === "function",
        request: typeof connectorMethods.request === "function",
      });
      
      let session: unknown = null;
      
      // Try openModal first (if it exists)
      if (typeof connectorMethods.openModal === "function") {
        try {
          console.log("[Wallet] Attempting to open modal via openModal()...");
          session = await connectorMethods.openModal();
          console.log("[Wallet] ✓ Modal resolved with session:", session);
        } catch (modalError) {
          console.error("[Wallet] openModal error details:", {
            error: modalError,
            errorType: typeof modalError,
            errorString: String(modalError),
            errorKeys: modalError && typeof modalError === 'object' ? Object.keys(modalError) : [],
            errorMessage: modalError instanceof Error ? modalError.message : undefined,
            errorStack: modalError instanceof Error ? modalError.stack : undefined,
          });
          // Don't throw here - try alternative methods
        }
      }
      
      // If openModal didn't work, try connect()
      if (!session && typeof connectorMethods.connect === "function") {
        try {
          console.log("[Wallet] Attempting to connect via connect()...");
          session = await connectorMethods.connect();
          console.log("[Wallet] ✓ Connect resolved with session:", session);
        } catch (connectError) {
          console.warn("[Wallet] connect() failed:", connectError);
        }
      }
      
      // If still no session, try using request method
      if (!session && typeof connectorMethods.request === "function") {
        try {
          console.log("[Wallet] Attempting to connect via request()...");
          session = await connectorMethods.request("hedera_connect", []);
          console.log("[Wallet] ✓ Request resolved with session:", session);
        } catch (requestError) {
          console.warn("[Wallet] request() failed:", requestError);
        }
      }
      
      if (!session) {
        throw new Error("Unable to establish wallet connection. Please ensure your wallet supports WalletConnect and try again.");
      }
      
      // Extract accounts from session
      type WCSession = { namespaces?: Record<string, { accounts?: string[] }> };
      const accounts: string[] | undefined = (session as WCSession)?.namespaces?.hedera?.accounts;
      console.log("[Wallet] Accounts from session:", accounts);
      
      if (accounts && accounts.length > 0) {
        // Format: "hedera:testnet:0.0.x" → take last segment
        const first = accounts[0];
        console.log("[Wallet] First account (CAIP format):", first);
        const parts = first.split(":");
        const acct = parts[parts.length - 1];
        console.log("[Wallet] ✓ Parsed account ID:", acct);
        
        setAccountId(acct);
        setIsConnected(true);
        localStorage.setItem("hedera_account_id", acct);
        await syncWalletToFirestore(acct);
        toast.success(`Wallet connected: ${acct}`);
      } else {
        console.log("[Wallet] ✗ No accounts found in session");
        toast.error("No accounts found in wallet session");
      }
    } catch (error) {
      console.error("[Wallet] ✗ Failed to connect wallet:", error);
      const errorObj = error as Error | { message?: string; code?: number | string };
      const errorMessage = errorObj?.message || String(error);
      const errorCode = errorObj && typeof errorObj === 'object' && 'code' in errorObj ? errorObj.code : undefined;
      
      // Check if user rejected
      const errMsg = errorMessage.toLowerCase();
      if (errMsg.includes('user') && (errMsg.includes('reject') || errMsg.includes('cancel'))) {
        toast.info("Wallet connection cancelled");
        return;
      }
      
      // Check for specific error codes
      if (errorCode === 4001 || errorCode === '4001') {
        toast.info("Wallet connection rejected by user");
        return;
      }
      
      toast.error(`Failed to connect wallet: ${errorMessage}`);
    }
  }, [initializeConnector, syncWalletToFirestore]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    console.log("[Wallet] 🔌 disconnectWallet called");
    try {
      type WCClient = { session?: { getAll: () => Array<{ topic: string }> } };
      type ConnectorWithClient = { walletConnectClient?: WCClient; disconnect?: (topic: string) => Promise<void> };
      const connector = dappConnectorRef.current as unknown as ConnectorWithClient;
      if (!connector) {
        console.log("[Wallet] No connector to disconnect");
        return;
      }

      // Get all active sessions and disconnect them
      if (connector.walletConnectClient?.session) {
        const sessions = connector.walletConnectClient.session.getAll();
        console.log("[Wallet] Active sessions:", sessions);
        
        for (const session of sessions) {
          console.log("[Wallet] Disconnecting session:", session.topic);
          if (typeof connector.disconnect === "function") {
            await connector.disconnect(session.topic);
          }
        }
      }
      
      setAccountId(null);
      setIsConnected(false);
      
      // Clear localStorage
      localStorage.removeItem("hedera_account_id");
      
      // Sync to Firestore
      await syncWalletToFirestore(null);
      
      console.log("[Wallet] ✓ Wallet disconnected");
      toast.success("Wallet disconnected");
    } catch (error) {
      console.error("[Wallet] ✗ Failed to disconnect wallet:", error);
      toast.error("Failed to disconnect wallet");
    }
  }, [syncWalletToFirestore]);

  // Check connection
  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!dappConnectorRef.current) {
      await initializeConnector();
    }
    return isConnected;
  }, [initializeConnector, isConnected]);

  // Sign transaction (for future use)
  const signTransaction = useCallback(
    async (transactionBytes: Uint8Array): Promise<unknown> => {
      // Placeholder: integrate with Hedera SDK / DAppConnector request flow when adding contract calls
      void transactionBytes;
      if (!isConnected || !accountId) throw new Error("Wallet not connected");
      throw new Error("signTransaction not implemented for Hedera Wallet Connect yet");
    },
    [isConnected, accountId]
  );

  // Get the connector instance
  const getConnector = useCallback((): DAppConnector | null => {
    return dappConnectorRef.current;
  }, []);

  // Get an ethers signer using Hedera Wallet Connect
  const getSigner = useCallback(async (): Promise<ethers.JsonRpcSigner | null> => {
    if (!isConnected || !accountId || !dappConnectorRef.current) {
      return null;
    }

    try {
      // Create a provider for Hedera network
      const network = NETWORK;
      const rpcUrl = network === "mainnet" 
        ? "https://mainnet.hashio.io/api"
        : "https://testnet.hashio.io/api";
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Create a custom signer that uses WalletConnect for signing
      // Note: This is a simplified version - you may need to implement
      // a custom signer class that wraps the DAppConnector's signing methods
      const signer = await provider.getSigner(accountId);
      
      return signer;
    } catch (error) {
      console.error("[Wallet] Failed to create signer:", error);
      return null;
    }
  }, [isConnected, accountId]);

  const value: HederaWalletContextType = {
    accountId,
    isConnected,
    isInitializing,
    network: NETWORK,
    topic,
    connectWallet,
    disconnectWallet,
    checkConnection,
    signTransaction,
    getConnector,
    getSigner,
  };

  return (
    <HederaWalletContext.Provider value={value}>
      {children}
    </HederaWalletContext.Provider>
  );
}

// Custom hook to use the wallet context
export function useHederaWallet() {
  const context = useContext(HederaWalletContext);
  if (context === undefined) {
    throw new Error("useHederaWallet must be used within a HederaWalletProvider");
  }
  return context;
}

