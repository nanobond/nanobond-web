import type { UserRole, KYCStatus } from "@/lib/types";

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  redirectTo?: string;
}

/**
 * Check if user has issuer role
 */
export function requireIssuerRole(role: UserRole | null): GuardResult {
  if (!role) {
    return {
      allowed: false,
      reason: "Please sign in to continue",
      redirectTo: "/auth",
    };
  }
  
  if (role !== "issuer") {
    return {
      allowed: false,
      reason: "This page is only accessible to bond issuers",
      redirectTo: "/",
    };
  }

  return { allowed: true };
}

/**
 * Check if user has investor role
 */
export function requireInvestorRole(role: UserRole | null): GuardResult {
  if (!role) {
    return {
      allowed: false,
      reason: "Please sign in to continue",
      redirectTo: "/auth",
    };
  }
  
  if (role !== "investor") {
    return {
      allowed: false,
      reason: "This page is only accessible to investors",
      redirectTo: "/",
    };
  }

  return { allowed: true };
}

/**
 * Check if user's profile is complete
 */
export function requireProfileComplete(profileComplete: boolean): GuardResult {
  if (!profileComplete) {
    return {
      allowed: false,
      reason: "Please complete your company profile first",
      redirectTo: "/profile",
    };
  }

  return { allowed: true };
}

/**
 * Check if user's KYC is approved
 */
export function requireKYCApproved(kycStatus: KYCStatus): GuardResult {
  if (kycStatus === "none") {
    return {
      allowed: false,
      reason: "Please complete your KYC verification to continue",
      redirectTo: "/kyc",
    };
  }

  if (kycStatus === "pending") {
    return {
      allowed: false,
      reason: "Your KYC is under review. Please wait for approval.",
    };
  }

  if (kycStatus === "rejected") {
    return {
      allowed: false,
      reason: "Your KYC was rejected. Please contact support.",
    };
  }

  return { allowed: true };
}

/**
 * Combined check for bond creation eligibility
 */
export function requireCanCreateBond(
  role: UserRole | null,
  profileComplete: boolean,
  kycStatus: KYCStatus
): GuardResult {
  // Check role first
  const roleCheck = requireIssuerRole(role);
  if (!roleCheck.allowed) {
    return roleCheck;
  }

  // Then profile
  const profileCheck = requireProfileComplete(profileComplete);
  if (!profileCheck.allowed) {
    return profileCheck;
  }

  // Finally KYC
  const kycCheck = requireKYCApproved(kycStatus);
  if (!kycCheck.allowed) {
    return kycCheck;
  }

  return { allowed: true };
}




