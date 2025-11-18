import type { GuardResult } from "../guards";

/**
 * Check if wallet is connected
 */
export function requireWalletConnection(isConnected: boolean, accountId: string | null): GuardResult {
  if (!isConnected || !accountId) {
    return {
      allowed: false,
      reason: "Please connect your Hedera wallet to continue",
    };
  }

  return { allowed: true };
}

/**
 * Check if wallet is connected for bond issuance
 */
export function requireWalletForBondIssuance(
  isConnected: boolean,
  accountId: string | null
): GuardResult {
  if (!isConnected || !accountId) {
    return {
      allowed: false,
      reason: "You must connect your wallet before issuing bonds. This wallet will be used for bond token management.",
    };
  }

  return { allowed: true };
}

/**
 * Check if wallet is connected for bond purchase
 */
export function requireWalletForBondPurchase(
  isConnected: boolean,
  accountId: string | null
): GuardResult {
  if (!isConnected || !accountId) {
    return {
      allowed: false,
      reason: "You must connect your wallet before purchasing bonds. Bonds will be transferred to this wallet.",
    };
  }

  return { allowed: true };
}



