import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "./useWallet";
import { toast } from "sonner";
import AdminV1ABI from "@/abi/AdminV1.json";

const CONTRACT_ADDRESS = "0xCD27aa62Ea1FcE472F3be1eB0655Be9A616fBC79";

interface IssuerInfo {
  wallet: string;
  kycApproved: boolean;
  connected: boolean;
}

type AdminContract = ethers.Contract & {
  issuers: (address: string) => Promise<[string, boolean, boolean]>;
  registerIssuer: (wallet: string) => Promise<ethers.ContractTransactionResponse>;
};

export function useIssuerRegistration() {
  const { isConnected, accountId, getSigner } = useWallet();
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [issuerInfo, setIssuerInfo] = useState<IssuerInfo | null>(null);
  const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const [contract, setContract] = useState<AdminContract | null>(null);

  // Initialize provider
  useEffect(() => {
    if (typeof window !== "undefined") {
      const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";
      const rpcUrl = network === "mainnet" 
        ? "https://mainnet.hashio.io/api"
        : "https://testnet.hashio.io/api";
      
      const newProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(newProvider);
    }
  }, []);

  // Initialize contract
  useEffect(() => {
    if (provider && CONTRACT_ADDRESS) {
      try {
        const newContract = new ethers.Contract(CONTRACT_ADDRESS, AdminV1ABI, provider) as AdminContract;
        setContract(newContract);
      } catch (error) {
        console.error("Failed to initialize contract:", error);
      }
    }
  }, [provider]);

  // Check issuer registration
  const checkRegistration = async (address: string) => {
    if (!contract || !address) {
      setIsRegistered(false);
      return;
    }

    setIsChecking(true);
    try {
      const issuerData = await contract.issuers(address);
      const [wallet, kycApproved, connected] = issuerData;
      
      const info: IssuerInfo = {
        wallet: wallet,
        kycApproved: kycApproved,
        connected: connected,
      };
      
      setIssuerInfo(info);
      // Check if issuer is registered (wallet is not zero address and connected is true)
      const registered = wallet !== ethers.ZeroAddress && connected === true;
      setIsRegistered(registered);
    } catch (error) {
      console.error("Error checking issuer registration:", error);
      setIsRegistered(false);
      toast.error("Failed to check issuer registration");
    } finally {
      setIsChecking(false);
    }
  };

  // Register issuer
  const registerIssuer = async (walletAddress: string) => {
    if (!contract || !isConnected || !accountId) {
      toast.error("Please connect your wallet first");
      return false;
    }

    setIsRegistering(true);
    try {
      const signer = await getSigner();
      if (!signer) {
        toast.error("Wallet signer not available");
        return false;
      }

      const contractWithSigner = contract.connect(signer) as AdminContract;
      
      toast.loading("Registering issuer on blockchain...", { id: "registerIssuer" });
      
      const txResponse = await contractWithSigner.registerIssuer(walletAddress);
      const txHash = txResponse.hash;
      
      toast.loading(`Transaction sent: ${txHash}`, { id: "registerIssuer" });
      
      const receipt = await txResponse.wait();
      
      if (receipt && receipt.status === 1) {
        toast.success(`Issuer registered successfully!`, { id: "registerIssuer" });
        // Re-check registration status
        await checkRegistration(accountId);
        return true;
      } else {
        toast.success(`Transaction submitted: ${txHash}`, { id: "registerIssuer" });
        // Still re-check in case it goes through
        await checkRegistration(accountId);
        return true;
      }
    } catch (error) {
      console.error("Error registering issuer:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to register issuer";
      toast.error(`Registration failed: ${errorMessage}`, { id: "registerIssuer" });
      return false;
    } finally {
      setIsRegistering(false);
    }
  };

  // Auto-check when wallet is connected
  useEffect(() => {
    if (isConnected && accountId && contract && !isChecking) {
      checkRegistration(accountId);
    } else if (!isConnected || !accountId) {
      setIsRegistered(null);
      setIssuerInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, accountId, contract]);

  return {
    isRegistered,
    isChecking,
    isRegistering,
    issuerInfo,
    checkRegistration,
    registerIssuer,
  };
}

