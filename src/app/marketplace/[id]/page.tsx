"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Building2, Calendar, CheckCircle2, Shield, TrendingUp, Loader2 } from "lucide-react";
import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/db";
import { formatHbar } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/hooks/useWallet";
import { toast } from "sonner";
import type { Bond } from "@/lib/types";
import { ethers } from "ethers";
import AdminV1ABI from "@/abi/AdminV1.json";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BondDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const { isConnected, accountId, connectWallet, getSigner } = useWallet();
  
  const [bond, setBond] = useState<Bond | null>(null);
  const [loading, setLoading] = useState(true);
  const [investAmount, setInvestAmount] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [processingInvestment, setProcessingInvestment] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

// Contract address
const CONTRACT_ADDRESS = "0xCD27aa62Ea1FcE472F3be1eB0655Be9A616fBC79";
const MIN_INVESTMENT_HBAR = 2;

type AdminContract = ethers.Contract & {
  bonds: (id: number) => Promise<unknown[]>;
  buyBond: ((
    bondId: number,
    units: ethers.BigNumberish,
    overrides?: ethers.TransactionRequest
  ) => Promise<ethers.ContractTransactionResponse>) & {
    populateTransaction: (
      bondId: number,
      units: ethers.BigNumberish,
      overrides?: ethers.TransactionRequest
    ) => Promise<ethers.TransactionRequest>;
  };
};
  
  // Initialize provider for Hedera network
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

  // Initialize contract when provider is available
  useEffect(() => {
    if (provider && CONTRACT_ADDRESS) {
      try {
        const newContract = new ethers.Contract(CONTRACT_ADDRESS, AdminV1ABI, provider);
        setContract(newContract);
      } catch (error) {
        console.error("Failed to initialize contract:", error);
      }
    }
  }, [provider, CONTRACT_ADDRESS]);

  // Fetch bond from Firestore
  useEffect(() => {
    const fetchBond = async () => {
      try {
        const bondDoc = await getDoc(doc(db, "bonds", id));
        if (bondDoc.exists()) {
          const bondData = {
            id: bondDoc.id,
            ...bondDoc.data(),
          } as Bond;
          setBond(bondData);
        } else {
          setBond(null);
        }
      } catch (error) {
        console.error("Error fetching bond:", error);
        toast.error("Failed to load bond details");
        setBond(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchBond();
    }
  }, [id]);

  // Get current user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid || null);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-background pb-12">
        <div className="mx-auto w-full max-w-7xl px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </main>
    );
  }

  if (!bond) return notFound();

  // Check if bond is available for investment
  const isAvailableForInvestment = bond.status === "published" || bond.status === "active";
  const canInvest = isAvailableForInvestment && bond.available > 0;

  const maturityDate = new Date(bond.maturityDate);
  const formattedMaturity = maturityDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const riskColorClass =
    bond.riskLevel === "Low Risk"
      ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400"
      : bond.riskLevel === "Medium Risk"
      ? "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400"
      : "bg-red-500/10 text-red-600 ring-red-500/30 dark:text-red-400";

  // Investment amount is in HBAR
  const investmentHbar = parseFloat(investAmount) || 0;
  // Calculate returns directly in HBAR
  const interestEarnedHbar = (investmentHbar * bond.interestApyPct / 100 * bond.durationMonths) / 12;
  const totalAtMaturityHbar = investmentHbar + interestEarnedHbar;
  const perPaymentHbar = (investmentHbar * bond.couponRate / 100) / 2;
  
  // Bond amounts are already in HBAR
  const minInvestmentHbar = Math.max(MIN_INVESTMENT_HBAR, bond.minInvestment);
  const availableHbar = bond.available;
  const faceValueHbar = bond.faceValue;

  const handleInvestClick = async () => {
    if (!isConnected) {
      toast.info("Please connect your wallet to invest");
      await connectWallet();
      return;
    }

    if (!userId) {
      toast.error("Please sign in to invest");
      return;
    }

    setShowConfirmDialog(true);
    setAcceptedTerms(false);
  };

  const handleConfirmInvestment = async () => {
    if (!bond || !userId || !accountId) {
      toast.error("Missing required information");
      return;
    }

    // Verify user has investor role
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        toast.error("User account not found. Please complete your profile setup.");
        return;
      }
      const userData = userDoc.data();
      if (userData.role !== "investor") {
        toast.error("Only investors can make investments. Please update your account role.");
        return;
      }
    } catch (error) {
      console.error("Error checking user role:", error);
      toast.error("Failed to verify user permissions. Please try again.");
      return;
    }

    // Re-check bond status and availability
    if (bond.status !== "published" && bond.status !== "active") {
      toast.error("This bond is not available for investment");
      setShowConfirmDialog(false);
      return;
    }

    if (investmentHbar < minInvestmentHbar) {
      toast.error(`Minimum investment is ${formatHbar(minInvestmentHbar)}`);
      return;
    }

    if (investmentHbar > availableHbar) {
      toast.error(`Maximum available investment is ${formatHbar(availableHbar)}`);
      return;
    }

    if (availableHbar <= 0) {
      toast.error("This bond is fully funded");
      setShowConfirmDialog(false);
      return;
    }

    if (!contract || !provider) {
      toast.error("Smart contract not initialized. Please try again.");
      setProcessingInvestment(false);
      return;
    }

    setProcessingInvestment(true);

    try {
      // Get contract bond ID - assuming bond has a contractBondId field, or use a mapping
      const bondWithContractId = bond as Bond & { contractBondId?: number };
      const contractBondId = bondWithContractId.contractBondId ?? 0; // TODO: Add contractBondId to Bond type

      const parseHbarToWei = (hbarValue: number) => {
        return ethers.parseUnits(hbarValue.toString(), 18);
      };

      const formatWeiToHbar = (weiValue: bigint) => {
        return Number(ethers.formatUnits(weiValue, 18));
      };

      const investmentWei = parseHbarToWei(investmentHbar);

      // Try to read the bond's faceValue from the contract
      // The contract stores faceValue in tinybars
      let contractFaceValueWei: bigint;
      try {
        // Try to read bond data from contract (bonds mapping is public, so we can access it)
        // The bond struct is: (id, issuer, interestRateBP, couponRateBP, faceValue, availableUnits, targetUSD, durationSec, maturityTimestamp, status, htsTokenId, issuedUnits)
        // faceValue is at index 4
        const bondData = await (contract as AdminContract).bonds(contractBondId);
        if (bondData && bondData.length > 4) {
          const faceValueRaw = bondData[4] as { toString: () => string } | bigint | number;
          const faceValueString = typeof faceValueRaw === "bigint"
            ? faceValueRaw.toString()
            : typeof faceValueRaw === "number"
              ? Math.trunc(faceValueRaw).toString()
              : faceValueRaw?.toString();
          if (!faceValueString) {
            throw new Error("Could not parse faceValue from contract");
          }
          contractFaceValueWei = BigInt(faceValueString);
          const chainFaceValueHbar = formatWeiToHbar(contractFaceValueWei);
          const difference =
            faceValueHbar > 0 ? Math.abs(chainFaceValueHbar - faceValueHbar) / faceValueHbar : 0;
          if (chainFaceValueHbar <= 0 || difference > 0.5) {
            console.warn(
              "Contract face value differs significantly from bond data. Falling back to bond face value.",
              { chainFaceValueHbar, faceValueHbar }
            );
            contractFaceValueWei = parseHbarToWei(faceValueHbar);
          }
          console.log("Using faceValue (wei):", contractFaceValueWei.toString());
        } else {
          throw new Error("Could not read bond data from contract");
        }
      } catch (error) {
        console.warn("Could not read faceValue from contract, using calculated value:", error);
        // Fallback: use bond faceValue (already in HBAR)
        contractFaceValueWei = parseHbarToWei(faceValueHbar);
        console.warn("Using calculated faceValue:", contractFaceValueWei.toString());
      }

      // Calculate units based on investment amount
      // Convert contract faceValue from wei to HBAR for display/calculation
      const contractFaceValueHbar = formatWeiToHbar(contractFaceValueWei);
      
      // Units = investment / face value (round down)
      const unitsBigInt = contractFaceValueWei > BigInt(0) ? investmentWei / contractFaceValueWei : BigInt(0);
      const units = Number(unitsBigInt); // for UI messages only
      
      // Check minimum investment: $0.5 USD
      if (investmentHbar < MIN_INVESTMENT_HBAR) {
        toast.error(`Minimum investment is ${formatHbar(MIN_INVESTMENT_HBAR)} HBAR`);
        setProcessingInvestment(false);
        return;
      }
      
      if (units === 0) {
        toast.error(`Investment amount must be at least ${formatHbar(Math.max(contractFaceValueHbar, MIN_INVESTMENT_HBAR))}`);
        setProcessingInvestment(false);
        return;
      }

      // The contract expects: faceValue * units in wei
      // This must match exactly what the contract calculates: b.faceValue * units
      const requiredWei = contractFaceValueWei * unitsBigInt;
      const requiredHbarAmount = formatWeiToHbar(requiredWei);
      
      // Check if user entered more than required (we'll use the exact required amount)
      if (investmentWei > requiredWei) {
        toast.info(
          `Investment amount will be adjusted to ${formatHbar(requiredHbarAmount)} for ${units} units. ` +
          `Excess amount: ${formatHbar(investmentHbar - requiredHbarAmount)}`
        );
      }
      
      // Verify the user has enough
      if (investmentWei < requiredWei) {
        toast.error(`Investment amount is too low. Required: ${formatHbar(requiredHbarAmount)} for ${units} units`);
        setProcessingInvestment(false);
        return;
      }

      console.log("Investment details:", {
        investmentHbar,
        faceValueHbar,
        contractFaceValueWei: contractFaceValueWei.toString(),
        units,
        requiredWei: requiredWei.toString(),
      });

      toast.loading("Preparing transaction...", { id: "buyBond" });

      // Build transaction with exact HBAR amount
      const populatedTx = await (contract as AdminContract).buyBond.populateTransaction(
        contractBondId,
        unitsBigInt,
        { value: requiredWei }
      );

      const signer = await getSigner();
      if (!signer) {
        throw new Error("Wallet signer not available. Please reconnect your wallet.");
      }

      const signerProvider = signer.provider ?? provider;

      // Get gas estimates
      const feeData = signerProvider ? await signerProvider.getFeeData() : await provider.getFeeData();
      let estimatedGas: bigint;
      try {
        estimatedGas = await (signerProvider ?? provider).estimateGas(populatedTx);
      } catch (error) {
        console.warn("Gas estimation failed:", error);
        estimatedGas = BigInt(500000);
      }

      const FIXED_GAS_LIMIT = BigInt(2000000);
      const gasLimitFromEstimate = estimatedGas > BigInt(0)
        ? estimatedGas * BigInt(3)
        : FIXED_GAS_LIMIT;
      const maxGasLimit = BigInt(5000000);
      const calculatedLimit = gasLimitFromEstimate > maxGasLimit ? maxGasLimit : gasLimitFromEstimate;
      const finalGasLimit = calculatedLimit > FIXED_GAS_LIMIT ? calculatedLimit : FIXED_GAS_LIMIT;

      const overrides: ethers.TransactionRequest = {
        value: requiredWei,
        gasLimit: finalGasLimit,
      };

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        overrides.maxFeePerGas = feeData.maxFeePerGas;
        overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } else if (feeData.gasPrice) {
        overrides.gasPrice = feeData.gasPrice;
      }

      toast.loading("Requesting transaction signature from wallet...", { id: "buyBond" });

      const contractWithSigner = (contract as AdminContract).connect(signer) as AdminContract;
      const txResponse = await contractWithSigner.buyBond(contractBondId, unitsBigInt, overrides);
      const txHash = txResponse.hash;

      toast.loading(`Transaction sent: ${txHash}`, { id: "buyBond" });

      const receipt = await txResponse.wait();

      if (receipt && receipt.status === 1) {
        toast.success(`Transaction confirmed: ${txHash}`, { id: "buyBond" });
      } else {
        toast.success(`Transaction submitted: ${txHash}`, { id: "buyBond" });
      }

      // Use the actual amount sent (requiredHbarAmount) instead of user input
      const actualInvestmentHbar = requiredHbarAmount;

      // Create investment record in Firestore
      await addDoc(collection(db, "investments"), {
        bondId: bond.id,
        investorId: userId,
        issuerId: bond.issuerId,
        amountHbar: actualInvestmentHbar,
        units: units,
        investedAt: serverTimestamp(),
        status: "active",
        walletAddress: accountId,
        transactionHash: txHash,
        contractBondId: contractBondId,
      });

      // Update bond funding (all values in HBAR)
      const bondRef = doc(db, "bonds", bond.id);
      await updateDoc(bondRef, {
        fundedHbar: bond.fundedHbar + actualInvestmentHbar,
        available: Math.max(0, bond.available - actualInvestmentHbar),
        updatedAt: serverTimestamp(),
      });

      toast.success("Investment successful!");
      setShowConfirmDialog(false);
      setInvestAmount("");

      // Refresh bond data
      const bondDoc = await getDoc(doc(db, "bonds", id));
      if (bondDoc.exists()) {
        const bondData = {
          id: bondDoc.id,
          ...bondDoc.data(),
        } as Bond;
        setBond(bondData);
      }
    } catch (error) {
      console.error("Error processing investment:", error);
      let errorMessage = "Failed to process investment";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Provide more specific error messages for common issues
        if (error.message.includes("Missing or insufficient permissions")) {
          errorMessage = "Permission denied. Please ensure:\n1. Your account has the 'investor' role\n2. Firestore rules are properly deployed\n3. You are authenticated";
        } else if (error.message.includes("permission")) {
          errorMessage = "Permission error. Please check your account role and try again.";
        }
      }
      
      toast.error(`Investment failed: ${errorMessage}`, { id: "buyBond" });
    } finally {
      setProcessingInvestment(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-12">
      {/* Back button - full width */}
      <div className="border-b bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to marketplace
          </Link>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column - Hero + Content cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero section */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Building2 size={32} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${riskColorClass}`}>
                        {bond.riskLevel}
                      </span>
                      <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                        {bond.sector}
                      </span>
                      <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                        {bond.rating}
                      </span>
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold">{bond.name}</h1>
                    {bond.verified && (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                        <CheckCircle2 size={14} />
                        Verified
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Yield</div>
                  <div className="mt-1 text-4xl font-bold text-primary">{bond.interestApyPct.toFixed(2)}%</div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{bond.issuerName}</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {bond.fullDescription || bond.description || "No description available."}
              </p>
            </div>
            {/* Key Metrics */}
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Key Metrics</h2>
              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Coupon Rate</div>
                  <div className="mt-2 text-2xl font-semibold">{bond.couponRate.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Payment Frequency</div>
                  <div className="mt-2 text-2xl font-semibold">{bond.paymentFrequency}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Face Value</div>
                  <div className="mt-2 text-2xl font-semibold">{formatHbar(bond.faceValue)}</div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Maturity Date</div>
                  <div className="mt-2 text-2xl font-semibold">{formattedMaturity}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Min. Investment</div>
                  <div className="mt-2 text-2xl font-semibold">{formatHbar(minInvestmentHbar)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Available</div>
                  <div className="mt-2 text-2xl font-semibold">{formatHbar(availableHbar)}</div>
                </div>
              </div>

              {/* Funding Progress */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Funding Progress</span>
                  <span className="font-medium">
                    {formatHbar(bond.fundedHbar)} / {formatHbar(bond.targetHbar)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div 
                    className="h-full rounded-full bg-primary transition-all" 
                    style={{ width: `${Math.min(100, (bond.fundedHbar / bond.targetHbar) * 100)}%` }} 
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {Math.round((bond.fundedHbar / bond.targetHbar) * 100)}% funded
                </div>
              </div>
            </div>

            {/* Key Features */}
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Key Features</h2>
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-medium">Government-backed security</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Full faith and credit backing provides maximum security
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-medium">Tax advantages on state/local taxes</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Interest may be exempt from state and local taxes
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-medium">Highly liquid secondary market</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Easy to buy and sell with competitive pricing
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-medium">Predictable income stream</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Regular coupon payments provide steady returns
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Assessment */}
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Risk Assessment</h2>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                  <div>
                    <div className="text-sm font-medium">Credit Risk</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Very low - backed by government
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${riskColorClass}`}>
                    {bond.riskLevel}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                  <div>
                    <div className="text-sm font-medium">Market Risk</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Interest rate fluctuations may affect value
                    </div>
                  </div>
                  <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
                    Medium
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                  <div>
                    <div className="text-sm font-medium">Liquidity Risk</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      High liquidity with active trading market
                    </div>
                  </div>
                  <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                    Low Risk
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-500/10">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Investment Note:</span> Past performance does not guarantee future results. Please review all documentation carefully before investing.
                  </div>
                </div>
              </div>
            </div>

            {/* Collateral */}
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Collateral</h2>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Collateral Type</div>
                  <div className="font-semibold">{bond.collateral}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">Security Status</div>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Secured
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold">Asset Backing</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  This bond is secured by high-quality collateral including physical assets, 
                  revenue streams, and government guarantees. The collateral provides additional 
                  protection for investors in the unlikely event of default.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Coverage Ratio</div>
                    <div className="mt-1 font-semibold">150%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Asset Valuation</div>
                    <div className="mt-1 font-semibold">{formatHbar(bond.targetHbar * 1.5)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar - Investment Summary */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 rounded-2xl border bg-card p-6 max-h-[calc(100vh-6rem)] overflow-y-auto"
                 style={{ scrollbarGutter: "stable" }}>
              <h2 className="text-lg font-semibold">Investment Summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">Calculate your returns and invest</p>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Yield</div>
                    <div className="text-lg font-semibold">{bond.interestApyPct.toFixed(2)}%</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Rating</div>
                    <div className="text-lg font-semibold">{bond.rating}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Maturity</div>
                    <div className="text-lg font-semibold">{formattedMaturity}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium">Investment Amount</div>
                <div className="relative mt-2">
                  <Input
                    type="number"
                    placeholder="Enter HBAR amount"
                    value={investAmount}
                    onChange={(e) => setInvestAmount(e.target.value)}
                    step="0.01"
                    min="0"
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Minimum: {formatHbar(minInvestmentHbar)}
                </div>
              </div>

              {/* Returns Calculator */}
              {investAmount && parseFloat(investAmount) >= minInvestmentHbar && (
                <div className="mt-6 rounded-xl border bg-linear-to-br from-primary/5 to-primary/10 p-4">
                  <h3 className="text-sm font-semibold">Projected Returns</h3>
                  
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Initial Investment</span>
                      <span className="font-semibold">{formatHbar(investmentHbar)}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Interest Earned ({bond.durationMonths} months)</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{formatHbar(interestEarnedHbar)}
                      </span>
                    </div>
                    
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total at Maturity</span>
                        <span className="text-lg font-bold text-primary">
                          {formatHbar(totalAtMaturityHbar)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="mt-4 rounded-lg bg-card/50 p-3">
                    <div className="text-xs font-medium text-muted-foreground">Payment Schedule</div>
                    <div className="mt-2 space-y-2">
                      {bond.paymentFrequency === "Semi-annual" && (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Payments per year</span>
                            <span className="font-medium">2</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Per payment</span>
                            <span className="font-medium">
                              {formatHbar(perPaymentHbar)}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Total payments</span>
                        <span className="font-medium">
                          {Math.floor(bond.durationMonths / 6)} payments
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ROI Analysis */}
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-500/10">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="flex-1 text-xs">
                      <span className="font-medium text-emerald-800 dark:text-emerald-300">
                        ROI: {((bond.interestApyPct * bond.durationMonths) / 12).toFixed(2)}%
                      </span>
                      <span className="ml-1 text-emerald-700 dark:text-emerald-400">
                        over {bond.durationMonths} months
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {investAmount && parseFloat(investAmount) < minInvestmentHbar && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Minimum investment is {formatHbar(minInvestmentHbar)}
                  </p>
                </div>
              )}

              {investAmount && parseFloat(investAmount) > availableHbar && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                  <p className="text-xs text-red-800 dark:text-red-300">
                    Maximum available investment is {formatHbar(availableHbar)}
                  </p>
                </div>
              )}

              {!isAvailableForInvestment && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    This bond is not currently available for investment (Status: {bond.status})
                  </p>
                </div>
              )}

              <Button 
                className="mt-6 w-full" 
                size="lg"
                disabled={!canInvest || !investAmount || parseFloat(investAmount) < minInvestmentHbar || availableHbar <= 0}
                onClick={handleInvestClick}
              >
                {availableHbar <= 0 ? "Fully Funded" : !isAvailableForInvestment ? "Not Available" : "Invest Now"}
              </Button>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>Secure transaction • Privacy protected</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Confirm Investment</DialogTitle>
            <DialogDescription>
              Review your investment details carefully before proceeding
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Investment Summary */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold">Investment Summary</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Bond</span>
                  <span className="font-medium">{bond.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Issuer</span>
                  <span className="font-medium">{bond.issuerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Investment Amount</span>
                  <span className="text-lg font-semibold text-primary">
                    {formatHbar(investmentHbar)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Interest Rate (APY)</span>
                  <span className="font-medium">{bond.interestApyPct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Duration</span>
                  <span className="font-medium">{bond.durationMonths} months</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Maturity Date</span>
                  <span className="font-medium">{formattedMaturity}</span>
                </div>
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Estimated Interest</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      +{formatHbar(interestEarnedHbar)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total at Maturity</span>
                    <span className="text-lg font-bold text-primary">
                      {formatHbar(totalAtMaturityHbar)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Details */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="text-sm font-semibold">Payment Schedule</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Frequency</span>
                  <span className="font-medium">{bond.paymentFrequency}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Payment per period</span>
                  <span className="font-medium">{formatHbar(perPaymentHbar)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Number of payments</span>
                  <span className="font-medium">{Math.floor(bond.durationMonths / 6)}</span>
                </div>
              </div>
            </div>

            {/* Risk & Disclaimer */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">Investment Disclaimer</p>
                  <p className="text-amber-800 dark:text-amber-300">
                    • All investments carry risk. You may lose some or all of your principal.
                  </p>
                  <p className="text-amber-800 dark:text-amber-300">
                    • Past performance does not guarantee future results.
                  </p>
                  <p className="text-amber-800 dark:text-amber-300">
                    • Interest payments and maturity dates are subject to the issuer&apos;s financial condition.
                  </p>
                  <p className="text-amber-800 dark:text-amber-300">
                    • This investment may not be suitable for all investors. Please consult a financial advisor.
                  </p>
                  <p className="text-amber-800 dark:text-amber-300">
                    • Bonds are not FDIC insured and may lose value.
                  </p>
                </div>
              </div>
            </div>

            {/* Terms Acceptance */}
            <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <input
                type="checkbox"
                id="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="terms" className="cursor-pointer text-sm">
                <span className="font-medium">I acknowledge that I have read and understand the investment details and disclaimers.</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  By checking this box, you confirm that you understand the risks associated with this investment and agree to proceed.
                </span>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmInvestment}
              disabled={!acceptedTerms || processingInvestment}
              className="min-w-32"
            >
              {processingInvestment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Investment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
