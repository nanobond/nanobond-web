"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, Clock, XCircle } from "lucide-react";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { requireKYCApproved } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface KYCGuardProps {
  children: React.ReactNode;
  showModal?: boolean;
  blockAccess?: boolean;
}

/**
 * Guard component that shows a modal or blocks access if KYC is not approved
 */
export function KYCGuard({ children, showModal = true, blockAccess = false }: KYCGuardProps) {
  const router = useRouter();
  const { kycStatus, isIssuer, loading } = useUserRole();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (loading || !isIssuer) return;

    const result = requireKYCApproved(kycStatus);
    if (!result.allowed && blockAccess) {
      toast.error(result.reason);
      if (result.redirectTo) {
        router.replace(result.redirectTo);
      }
    } else if (!result.allowed && showModal) {
      setModalOpen(true);
    }
  }, [kycStatus, loading, isIssuer, blockAccess, showModal, router]);

  if (loading || !isIssuer) {
    return <>{children}</>;
  }

  const result = requireKYCApproved(kycStatus);

  // Block access mode
  if (!result.allowed && blockAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 size-12 text-orange-500" />
          <h2 className="mb-2 text-xl font-semibold">KYC Verification Required</h2>
          <p className="mb-4 text-sm text-muted-foreground">{result.reason}</p>
          {kycStatus === "none" && (
            <Link href="/kyc">
              <Button>Start KYC Verification</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Modal mode
  const getStatusIcon = () => {
    if (kycStatus === "pending") return <Clock className="size-6 text-blue-500" />;
    if (kycStatus === "rejected") return <XCircle className="size-6 text-red-500" />;
    return <AlertCircle className="size-6 text-orange-500" />;
  };

  const getStatusTitle = () => {
    if (kycStatus === "pending") return "KYC Under Review";
    if (kycStatus === "rejected") return "KYC Rejected";
    return "KYC Verification Required";
  };

  const getStatusMessage = () => {
    if (kycStatus === "pending") return "Your KYC documents are being reviewed. This usually takes 1-2 business days.";
    if (kycStatus === "rejected") return "Your KYC verification was rejected. Please contact support for more information.";
    return "Complete your KYC verification to create and manage bonds on the platform.";
  };

  return (
    <>
      {children}
      <Dialog open={modalOpen && !result.allowed} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex justify-center">
              {getStatusIcon()}
            </div>
            <DialogTitle className="text-center">{getStatusTitle()}</DialogTitle>
            <DialogDescription className="text-center">
              {getStatusMessage()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-2 mt-4">
            {kycStatus === "none" && (
              <Link href="/kyc">
                <Button onClick={() => setModalOpen(false)}>Start KYC Verification</Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}




