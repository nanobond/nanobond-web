"use client";

import { Badge } from "@/components/ui/badge";
import type { KYCStatus as KYCStatusType } from "@/lib/types";
import { Clock, Check, X, AlertCircle } from "lucide-react";

interface KYCStatusProps {
  status: KYCStatusType;
  className?: string;
}

export function KYCStatus({ status, className }: KYCStatusProps) {
  const config = {
    none: {
      label: "Not Started",
      variant: "outline" as const,
      icon: AlertCircle,
    },
    pending: {
      label: "Under Review",
      variant: "info" as const,
      icon: Clock,
    },
    approved: {
      label: "Approved",
      variant: "success" as const,
      icon: Check,
    },
    rejected: {
      label: "Rejected",
      variant: "destructive" as const,
      icon: X,
    },
  };

  const { label, variant, icon: Icon } = config[status];

  return (
    <Badge variant={variant} className={className}>
      <Icon className="size-3 mr-1" />
      {label}
    </Badge>
  );
}




