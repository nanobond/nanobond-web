import { useUserStore, selectRole, selectProfileComplete, selectKYCStatus, selectLoading, selectIsIssuer, selectIsInvestor, selectKYCApproved, selectCanCreateBond } from "@/lib/stores/userStore";

/**
 * Custom hook to access user role and profile status
 * 
 * @returns Object with role, profile status, and loading state
 */
export function useUserRole() {
  const role = useUserStore(selectRole);
  const profileComplete = useUserStore(selectProfileComplete);
  const kycStatus = useUserStore(selectKYCStatus);
  const loading = useUserStore(selectLoading);
  const isIssuer = useUserStore(selectIsIssuer);
  const isInvestor = useUserStore(selectIsInvestor);
  const kycApproved = useUserStore(selectKYCApproved);
  const canCreateBond = useUserStore(selectCanCreateBond);

  return {
    role,
    profileComplete,
    kycStatus,
    loading,
    isIssuer,
    isInvestor,
    kycApproved,
    canCreateBond,
  };
}




