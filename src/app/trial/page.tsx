"use client";

/**
 * AdminV1 Contract Trial Page
 * 
 * This page allows testing all AdminV1 contract functions.
 * 
 * ethers.js v6 Compatibility:
 * - Addresses are returned as strings directly
 * - Large numbers are returned as bigint (not BigNumber)
 * - Use typeof value === 'bigint' instead of ethers.isBigNumber()
 */

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { toast } from "sonner";
import { useWallet } from "@/lib/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import AdminV1ABI from "@/abi/AdminV1.json";

interface ContractCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export default function TrialPage() {
  const { isConnected, accountId, connectWallet, getSigner } = useWallet();
  const [contractAddress, setContractAddress] = useState("0x5Df533C51af3FdE2C05a0863E28C089605cd16fE");
  const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [results, setResults] = useState<Record<string, ContractCallResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Initialize provider for Hedera network
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Hedera EVM-compatible RPC endpoints
      const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";
      const rpcUrl = network === "mainnet" 
        ? "https://mainnet.hashio.io/api"
        : "https://testnet.hashio.io/api";
      
      const newProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(newProvider);
    }
  }, []);

  // Initialize contract when provider and address are available
  useEffect(() => {
    if (provider && contractAddress) {
      try {
        const newContract = new ethers.Contract(contractAddress, AdminV1ABI, provider);
        setContract(newContract);
        toast.success("Contract initialized");
      } catch (error) {
        console.error("Failed to initialize contract:", error);
        toast.error("Invalid contract address or ABI");
      }
    }
  }, [provider, contractAddress]);

  const executeCall = async (
    functionName: string,
    args: unknown[],
    isWrite: boolean = false,
    value?: bigint
  ) => {
    if (!contract) {
      toast.error("Contract not initialized. Please set contract address.");
      return;
    }
    const contractAny = contract as ethers.Contract & Record<string, unknown>;

    if (isWrite && !isConnected) {
      toast.error("Please connect your wallet first");
      await connectWallet();
      return;
    }

    setLoading((prev) => ({ ...prev, [functionName]: true }));
    setResults((prev) => ({ ...prev, [functionName]: { success: false, error: "Loading..." } }));

    try {
      if (isWrite) {
        if (!provider) {
          throw new Error("Provider not available");
        }

        const signer = await getSigner();
        if (!signer || !isConnected || !accountId) {
          toast.error("Please connect your wallet first");
          await connectWallet();
          return;
        }

        toast.loading("Preparing transaction...", { id: functionName });

        const contractFunction = contractAny[functionName] as {
          (...fnArgs: unknown[]): Promise<ethers.ContractTransactionResponse>;
          populateTransaction?: (
            ...fnArgs: unknown[]
          ) => Promise<ethers.TransactionRequest>;
        };

        if (!contractFunction || typeof contractFunction !== "function" || !contractFunction.populateTransaction) {
          throw new Error(`Function ${functionName} is not available on the contract`);
        }

        const populatedTx: ethers.TransactionRequest = value
          ? await contractFunction.populateTransaction(...args, { value })
          : await contractFunction.populateTransaction(...args);

        const signerProvider = signer.provider ?? provider;

        const feeData = await signerProvider.getFeeData();
        let estimatedGas: bigint;
        try {
          estimatedGas = await signerProvider.estimateGas(populatedTx);
          console.log(`[Gas] Raw estimate: ${estimatedGas.toString()}`);
        } catch (error) {
          console.warn(`[Gas] Estimation failed:`, error);
          estimatedGas = BigInt(500000);
        }

        const FIXED_GAS_LIMIT = BigInt(2000000);
        const gasLimitFromEstimate = estimatedGas > BigInt(0)
          ? estimatedGas * BigInt(3)
          : FIXED_GAS_LIMIT;
        const maxGasLimit = BigInt(5000000);
        const calculatedLimit = gasLimitFromEstimate > maxGasLimit ? maxGasLimit : gasLimitFromEstimate;
        const finalGasLimit = calculatedLimit > FIXED_GAS_LIMIT ? calculatedLimit : FIXED_GAS_LIMIT;

        console.log(`[Gas] Estimated: ${estimatedGas.toString()}, Calculated: ${calculatedLimit.toString()}, Final: ${finalGasLimit.toString()}`);

        const overrides: ethers.TransactionRequest = {
          gasLimit: finalGasLimit,
        };

        if (value) {
          overrides.value = value;
        }

        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
          overrides.maxFeePerGas = feeData.maxFeePerGas;
          overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        } else if (feeData.gasPrice) {
          overrides.gasPrice = feeData.gasPrice;
        }

        toast.loading("Requesting transaction signature from wallet...", { id: functionName });

        const contractWithSigner = contractAny.connect(signer) as typeof contractAny;
        const txResponse = await contractWithSigner[functionName](...args, overrides);
        const txHash = txResponse.hash;

        toast.loading(`Transaction sent: ${txHash}`, { id: functionName });

        const receipt = await txResponse.wait();

        if (!receipt) {
          setResults((prev) => ({
            ...prev,
            [functionName]: {
              success: true,
              data: {
                hash: txHash,
                status: "pending",
                message: "Transaction submitted. Receipt pending.",
              },
            },
          }));
          toast.success(`Transaction submitted: ${txHash}`, { id: functionName });
          return;
        }

        setResults((prev) => ({
          ...prev,
          [functionName]: {
            success: true,
            data: {
              hash: txHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
            },
          },
        }));
        toast.success(`Transaction confirmed: ${txHash}`, { id: functionName });
      } else {
        const contractFunction = contractAny[functionName];
        if (typeof contractFunction !== "function") {
          throw new Error(`Function ${functionName} is not available on the contract`);
        }

        const result = await contractFunction(...args);
        
        // Format result for display (ethers.js v6 compatible)
        // In v6: addresses are strings, large numbers are bigint
        let formattedResult = result;
        
        // Handle bigint values (replaces BigNumber in v6)
        if (typeof result === 'bigint') {
          formattedResult = result.toString();
        } else if (Array.isArray(result)) {
          formattedResult = result.map((item) => {
            if (typeof item === 'bigint') {
              return item.toString();
            }
            // Handle nested objects/arrays
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              return Object.fromEntries(
                Object.entries(item).map(([k, v]) => [
                  k,
                  typeof v === 'bigint' ? v.toString() : v,
                ])
              );
            }
            return item;
          });
        } else if (result && typeof result === "object" && !Array.isArray(result)) {
          // Handle struct/object returns
          formattedResult = Object.fromEntries(
            Object.entries(result).map(([key, val]) => {
              // Skip function properties (like _hex, _isBigNumber from v5)
              if (typeof val === 'function') {
                return [key, undefined];
              }
              // Convert bigint to string
              if (typeof val === 'bigint') {
                return [key, val.toString()];
              }
              // Handle nested objects
              if (val && typeof val === 'object' && !Array.isArray(val)) {
                return [key, Object.fromEntries(
                  Object.entries(val).map(([k, v]) => [
                    k,
                    typeof v === 'bigint' ? v.toString() : v,
                  ])
                )];
              }
              return [key, val];
            }).filter(([key, val]) => {
              void key;
              return val !== undefined;
            })
          );
        }
        
        setResults((prev) => ({
          ...prev,
          [functionName]: {
            success: true,
            data: formattedResult,
          },
        }));
        toast.success(`${functionName} executed successfully`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setResults((prev) => ({
        ...prev,
        [functionName]: {
          success: false,
          error: errorMessage,
        },
      }));
      toast.error(`${functionName} failed: ${errorMessage}`);
    } finally {
      setLoading((prev) => ({ ...prev, [functionName]: false }));
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">AdminV1 Contract Trial</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test all AdminV1 contract functions. Contract address is pre-configured. Connect your Hedera wallet to begin.
        </p>
      </div>

      {/* Contract Address Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Contract Configuration</CardTitle>
          <CardDescription>
            AdminV1 contract address (pre-filled with latest deployment)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="0x..."
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                className="font-mono"
              />
              {contractAddress === "0x5Df533C51af3FdE2C05a0863E28C089605cd16fE" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  ✓ Using latest AdminV1 contract deployment
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Badge variant="default" className="bg-emerald-600">
                  Connected: {accountId}
                </Badge>
              ) : (
                <Button
                  onClick={() => {
                    void connectWallet();
                  }}
                >
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Function Tabs */}
      <Tabs defaultValue="view" className="space-y-4">
        <TabsList>
          <TabsTrigger value="view">View Functions</TabsTrigger>
          <TabsTrigger value="bond">Bond Functions</TabsTrigger>
          <TabsTrigger value="issuer">Issuer Functions</TabsTrigger>
          <TabsTrigger value="admin">Admin Functions</TabsTrigger>
        </TabsList>

        {/* View Functions */}
        <TabsContent value="view" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>View Functions</CardTitle>
              <CardDescription>Read-only contract state queries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* bonds(uint256) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">bonds(uint256 bondId)</h3>
                  <Badge variant="outline">view</Badge>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Bond ID"
                    id="bonds-bondId"
                    className="w-32"
                  />
                  <Button
                    onClick={() => {
                      const input = document.getElementById("bonds-bondId") as HTMLInputElement;
                      const bondId = input.value;
                      if (!bondId) {
                        toast.error("Please enter a bond ID");
                        return;
                      }
                      executeCall("bonds", [bondId]);
                    }}
                    disabled={loading["bonds"]}
                  >
                    {loading["bonds"] ? "Loading..." : "Query"}
                  </Button>
                </div>
                {results["bonds"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["bonds"], null, 2)}
                  </pre>
                )}
              </div>

              {/* issuers(address) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">issuers(address issuer)</h3>
                  <Badge variant="outline">view</Badge>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="0x..."
                    id="issuers-address"
                    className="flex-1 font-mono"
                  />
                  <Button
                    onClick={() => {
                      const input = document.getElementById("issuers-address") as HTMLInputElement;
                      const address = input.value;
                      if (!address) {
                        toast.error("Please enter an address");
                        return;
                      }
                      executeCall("issuers", [address]);
                    }}
                    disabled={loading["issuers"]}
                  >
                    {loading["issuers"] ? "Loading..." : "Query"}
                  </Button>
                </div>
                {results["issuers"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["issuers"], null, 2)}
                  </pre>
                )}
              </div>

              {/* owner() */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">owner()</h3>
                  <Badge variant="outline">view</Badge>
                </div>
                <Button
                  onClick={() => executeCall("owner", [])}
                  disabled={loading["owner"]}
                >
                  {loading["owner"] ? "Loading..." : "Query Owner"}
                </Button>
                {results["owner"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["owner"], null, 2)}
                  </pre>
                )}
              </div>

              {/* paused() */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">paused()</h3>
                  <Badge variant="outline">view</Badge>
                </div>
                <Button
                  onClick={() => executeCall("paused", [])}
                  disabled={loading["paused"]}
                >
                  {loading["paused"] ? "Loading..." : "Query Paused Status"}
                </Button>
                {results["paused"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["paused"], null, 2)}
                  </pre>
                )}
              </div>

              {/* treasury() */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">treasury()</h3>
                  <Badge variant="outline">view</Badge>
                </div>
                <Button
                  onClick={() => executeCall("treasury", [])}
                  disabled={loading["treasury"]}
                >
                  {loading["treasury"] ? "Loading..." : "Query Treasury"}
                </Button>
                {results["treasury"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["treasury"], null, 2)}
                  </pre>
                )}
              </div>

              {/* htsManager() */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">htsManager()</h3>
                  <Badge variant="outline">view</Badge>
                </div>
                <Button
                  onClick={() => executeCall("htsManager", [])}
                  disabled={loading["htsManager"]}
                >
                  {loading["htsManager"] ? "Loading..." : "Query HTS Manager"}
                </Button>
                {results["htsManager"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["htsManager"], null, 2)}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bond Functions */}
        <TabsContent value="bond" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bond Functions</CardTitle>
              <CardDescription>Create, approve, purchase, redeem, and manage bonds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* createBond */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">createBond(...)</h3>
                  <Badge variant="destructive">write</Badge>
                </div>
                <div className="grid gap-2 grid-cols-2">
                  <Input placeholder="issuer (address)" id="createBond-issuer" className="font-mono text-xs" />
                  <Input placeholder="interestRateBP (uint256)" id="createBond-interestRateBP" type="number" className="text-xs" />
                  <Input placeholder="couponRateBP (uint256)" id="createBond-couponRateBP" type="number" className="text-xs" />
                  <Input placeholder="faceValue (uint256)" id="createBond-faceValue" type="number" className="text-xs" />
                  <Input placeholder="availableUnits (uint256)" id="createBond-availableUnits" type="number" className="text-xs" />
                  <Input placeholder="targetUSD (uint256)" id="createBond-targetUSD" type="number" className="text-xs" />
                  <Input placeholder="durationSec (uint256)" id="createBond-durationSec" type="number" className="text-xs" />
                  <Input placeholder="maturityTimestamp (uint256)" id="createBond-maturityTimestamp" type="number" className="text-xs" />
                </div>
                <Button
                  onClick={() => {
                    const issuer = (document.getElementById("createBond-issuer") as HTMLInputElement).value;
                    const interestRateBP = (document.getElementById("createBond-interestRateBP") as HTMLInputElement).value;
                    const couponRateBP = (document.getElementById("createBond-couponRateBP") as HTMLInputElement).value;
                    const faceValue = (document.getElementById("createBond-faceValue") as HTMLInputElement).value;
                    const availableUnits = (document.getElementById("createBond-availableUnits") as HTMLInputElement).value;
                    const targetUSD = (document.getElementById("createBond-targetUSD") as HTMLInputElement).value;
                    const durationSec = (document.getElementById("createBond-durationSec") as HTMLInputElement).value;
                    const maturityTimestamp = (document.getElementById("createBond-maturityTimestamp") as HTMLInputElement).value;
                    
                    if (!issuer || !interestRateBP || !couponRateBP || !faceValue || !availableUnits || !targetUSD || !durationSec || !maturityTimestamp) {
                      toast.error("Please fill all fields");
                      return;
                    }
                    
                    executeCall("createBond", [
                      issuer,
                      interestRateBP,
                      couponRateBP,
                      faceValue,
                      availableUnits,
                      targetUSD,
                      durationSec,
                      maturityTimestamp,
                    ], true);
                  }}
                  disabled={loading["createBond"]}
                >
                  {loading["createBond"] ? "Creating..." : "Create Bond"}
                </Button>
                {results["createBond"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["createBond"], null, 2)}
                  </pre>
                )}
              </div>

              {/* approveBond */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">approveBond(uint256 bondId)</h3>
                  <Badge variant="destructive">write</Badge>
                </div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Bond ID" id="approveBond-bondId" className="w-32" />
                  <Button
                    onClick={() => {
                      const bondId = (document.getElementById("approveBond-bondId") as HTMLInputElement).value;
                      if (!bondId) {
                        toast.error("Please enter a bond ID");
                        return;
                      }
                      executeCall("approveBond", [bondId], true);
                    }}
                    disabled={loading["approveBond"]}
                  >
                    {loading["approveBond"] ? "Approving..." : "Approve Bond"}
                  </Button>
                </div>
                {results["approveBond"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["approveBond"], null, 2)}
                  </pre>
                )}
              </div>

              {/* issueBond */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">issueBond(uint256 bondId, bytes metadata)</h3>
                  <Badge variant="destructive">write</Badge>
                </div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Bond ID" id="issueBond-bondId" className="w-32" />
                  <Input placeholder="metadata (hex string)" id="issueBond-metadata" className="flex-1 font-mono text-xs" />
                  <Button
                    onClick={() => {
                      const bondId = (document.getElementById("issueBond-bondId") as HTMLInputElement).value;
                      const metadata = (document.getElementById("issueBond-metadata") as HTMLInputElement).value;
                      if (!bondId || !metadata) {
                        toast.error("Please fill all fields");
                        return;
                      }
                      executeCall("issueBond", [bondId, metadata], true);
                    }}
                    disabled={loading["issueBond"]}
                  >
                    {loading["issueBond"] ? "Issuing..." : "Issue Bond"}
                  </Button>
                </div>
                {results["issueBond"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["issueBond"], null, 2)}
                  </pre>
                )}
              </div>

              {/* buyBond */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">buyBond(uint256 bondId, uint256 units)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">payable</Badge>
                </div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Bond ID" id="buyBond-bondId" className="w-32" />
                  <Input type="number" placeholder="Units" id="buyBond-units" className="w-32" />
                  <Input type="number" placeholder="HBAR value (in tinybar)" id="buyBond-value" className="w-48" />
                  <Button
                    onClick={() => {
                      const bondId = (document.getElementById("buyBond-bondId") as HTMLInputElement).value;
                      const units = (document.getElementById("buyBond-units") as HTMLInputElement).value;
                      const value = (document.getElementById("buyBond-value") as HTMLInputElement).value;
                      if (!bondId || !units) {
                        toast.error("Please fill all fields");
                        return;
                      }
                      const valueBigInt = value ? BigInt(value) : undefined;
                      executeCall("buyBond", [bondId, units], true, valueBigInt);
                    }}
                    disabled={loading["buyBond"]}
                  >
                    {loading["buyBond"] ? "Purchasing..." : "Buy Bond"}
                  </Button>
                </div>
                {results["buyBond"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["buyBond"], null, 2)}
                  </pre>
                )}
              </div>

              {/* redeemBond */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">redeemBond(uint256 bondId, uint256 units)</h3>
                  <Badge variant="destructive">write</Badge>
                </div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Bond ID" id="redeemBond-bondId" className="w-32" />
                  <Input type="number" placeholder="Units" id="redeemBond-units" className="w-32" />
                  <Button
                    onClick={() => {
                      const bondId = (document.getElementById("redeemBond-bondId") as HTMLInputElement).value;
                      const units = (document.getElementById("redeemBond-units") as HTMLInputElement).value;
                      if (!bondId || !units) {
                        toast.error("Please fill all fields");
                        return;
                      }
                      executeCall("redeemBond", [bondId, units], true);
                    }}
                    disabled={loading["redeemBond"]}
                  >
                    {loading["redeemBond"] ? "Redeeming..." : "Redeem Bond"}
                  </Button>
                </div>
                {results["redeemBond"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["redeemBond"], null, 2)}
                  </pre>
                )}
              </div>

              {/* markMature */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">markMature(uint256 bondId)</h3>
                  <Badge variant="destructive">write</Badge>
                </div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Bond ID" id="markMature-bondId" className="w-32" />
                  <Button
                    onClick={() => {
                      const bondId = (document.getElementById("markMature-bondId") as HTMLInputElement).value;
                      if (!bondId) {
                        toast.error("Please enter a bond ID");
                        return;
                      }
                      executeCall("markMature", [bondId], true);
                    }}
                    disabled={loading["markMature"]}
                  >
                    {loading["markMature"] ? "Marking..." : "Mark Mature"}
                  </Button>
                </div>
                {results["markMature"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["markMature"], null, 2)}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Issuer Functions */}
        <TabsContent value="issuer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Issuer Functions</CardTitle>
              <CardDescription>Register and manage issuers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* registerIssuer */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">registerIssuer(address wallet)</h3>
                  <Badge variant="destructive">write</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="registerIssuer-wallet" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const wallet = (document.getElementById("registerIssuer-wallet") as HTMLInputElement).value;
                      if (!wallet) {
                        toast.error("Please enter a wallet address");
                        return;
                      }
                      executeCall("registerIssuer", [wallet], true);
                    }}
                    disabled={loading["registerIssuer"]}
                  >
                    {loading["registerIssuer"] ? "Registering..." : "Register Issuer"}
                  </Button>
                </div>
                {results["registerIssuer"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["registerIssuer"], null, 2)}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Functions */}
        <TabsContent value="admin" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Admin Functions</CardTitle>
              <CardDescription>Administrative functions (owner only)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* approveKYC */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">approveKYC(address issuer)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="approveKYC-issuer" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const issuer = (document.getElementById("approveKYC-issuer") as HTMLInputElement).value;
                      if (!issuer) {
                        toast.error("Please enter an issuer address");
                        return;
                      }
                      executeCall("approveKYC", [issuer], true);
                    }}
                    disabled={loading["approveKYC"]}
                  >
                    {loading["approveKYC"] ? "Approving..." : "Approve KYC"}
                  </Button>
                </div>
                {results["approveKYC"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["approveKYC"], null, 2)}
                  </pre>
                )}
              </div>

              {/* revokeKYC */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">revokeKYC(address issuer)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="revokeKYC-issuer" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const issuer = (document.getElementById("revokeKYC-issuer") as HTMLInputElement).value;
                      if (!issuer) {
                        toast.error("Please enter an issuer address");
                        return;
                      }
                      executeCall("revokeKYC", [issuer], true);
                    }}
                    disabled={loading["revokeKYC"]}
                  >
                    {loading["revokeKYC"] ? "Revoking..." : "Revoke KYC"}
                  </Button>
                </div>
                {results["revokeKYC"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["revokeKYC"], null, 2)}
                  </pre>
                )}
              </div>

              {/* pause */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">pause()</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <Button
                  onClick={() => executeCall("pause", [], true)}
                  disabled={loading["pause"]}
                >
                  {loading["pause"] ? "Pausing..." : "Pause Contract"}
                </Button>
                {results["pause"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["pause"], null, 2)}
                  </pre>
                )}
              </div>

              {/* unpause */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">unpause()</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <Button
                  onClick={() => executeCall("unpause", [], true)}
                  disabled={loading["unpause"]}
                >
                  {loading["unpause"] ? "Unpausing..." : "Unpause Contract"}
                </Button>
                {results["unpause"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["unpause"], null, 2)}
                  </pre>
                )}
              </div>

              {/* setHTSManager */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">setHTSManager(address _m)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="setHTSManager-address" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const address = (document.getElementById("setHTSManager-address") as HTMLInputElement).value;
                      if (!address) {
                        toast.error("Please enter an address");
                        return;
                      }
                      executeCall("setHTSManager", [address], true);
                    }}
                    disabled={loading["setHTSManager"]}
                  >
                    {loading["setHTSManager"] ? "Setting..." : "Set HTS Manager"}
                  </Button>
                </div>
                {results["setHTSManager"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["setHTSManager"], null, 2)}
                  </pre>
                )}
              </div>

              {/* setTreasury */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">setTreasury(address _t)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="setTreasury-address" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const address = (document.getElementById("setTreasury-address") as HTMLInputElement).value;
                      if (!address) {
                        toast.error("Please enter an address");
                        return;
                      }
                      executeCall("setTreasury", [address], true);
                    }}
                    disabled={loading["setTreasury"]}
                  >
                    {loading["setTreasury"] ? "Setting..." : "Set Treasury"}
                  </Button>
                </div>
                {results["setTreasury"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["setTreasury"], null, 2)}
                  </pre>
                )}
              </div>

              {/* emergencyWithdrawHBAR */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">emergencyWithdrawHBAR(address to)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="emergencyWithdrawHBAR-to" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const to = (document.getElementById("emergencyWithdrawHBAR-to") as HTMLInputElement).value;
                      if (!to) {
                        toast.error("Please enter an address");
                        return;
                      }
                      executeCall("emergencyWithdrawHBAR", [to], true);
                    }}
                    disabled={loading["emergencyWithdrawHBAR"]}
                  >
                    {loading["emergencyWithdrawHBAR"] ? "Withdrawing..." : "Emergency Withdraw"}
                  </Button>
                </div>
                {results["emergencyWithdrawHBAR"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["emergencyWithdrawHBAR"], null, 2)}
                  </pre>
                )}
              </div>

              {/* transferOwnership */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">transferOwnership(address newOwner)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="0x..." id="transferOwnership-newOwner" className="flex-1 font-mono" />
                  <Button
                    onClick={() => {
                      const newOwner = (document.getElementById("transferOwnership-newOwner") as HTMLInputElement).value;
                      if (!newOwner) {
                        toast.error("Please enter an address");
                        return;
                      }
                      executeCall("transferOwnership", [newOwner], true);
                    }}
                    disabled={loading["transferOwnership"]}
                  >
                    {loading["transferOwnership"] ? "Transferring..." : "Transfer Ownership"}
                  </Button>
                </div>
                {results["transferOwnership"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["transferOwnership"], null, 2)}
                  </pre>
                )}
              </div>

              {/* renounceOwnership */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">renounceOwnership()</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                </div>
                <Button
                  onClick={() => executeCall("renounceOwnership", [], true)}
                  disabled={loading["renounceOwnership"]}
                  variant="destructive"
                >
                  {loading["renounceOwnership"] ? "Renouncing..." : "Renounce Ownership"}
                </Button>
                {results["renounceOwnership"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["renounceOwnership"], null, 2)}
                  </pre>
                )}
              </div>

              {/* upgradeToAndCall */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">upgradeToAndCall(address newImplementation, bytes data)</h3>
                  <Badge variant="destructive">write</Badge>
                  <Badge variant="outline">admin</Badge>
                  <Badge variant="outline">payable</Badge>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="newImplementation (0x...)" id="upgradeToAndCall-impl" className="flex-1 font-mono text-xs" />
                  <Input placeholder="data (hex)" id="upgradeToAndCall-data" className="flex-1 font-mono text-xs" />
                  <Input type="number" placeholder="value (tinybar)" id="upgradeToAndCall-value" className="w-32" />
                </div>
                <Button
                  onClick={() => {
                    const impl = (document.getElementById("upgradeToAndCall-impl") as HTMLInputElement).value;
                    const data = (document.getElementById("upgradeToAndCall-data") as HTMLInputElement).value;
                    const value = (document.getElementById("upgradeToAndCall-value") as HTMLInputElement).value;
                    if (!impl || !data) {
                      toast.error("Please fill all required fields");
                      return;
                    }
                    const valueBigInt = value ? BigInt(value) : undefined;
                    executeCall("upgradeToAndCall", [impl, data], true, valueBigInt);
                  }}
                  disabled={loading["upgradeToAndCall"]}
                  variant="destructive"
                >
                  {loading["upgradeToAndCall"] ? "Upgrading..." : "Upgrade Contract"}
                </Button>
                {results["upgradeToAndCall"] && (
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto">
                    {JSON.stringify(results["upgradeToAndCall"], null, 2)}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}

