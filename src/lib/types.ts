// User and Profile Types
export type UserRole = "investor" | "issuer";

export type KYCStatus = "none" | "pending" | "approved" | "rejected";

export interface UserMetadata {
  email: string;
  role: UserRole;
  profileComplete: boolean;
  kycStatus: KYCStatus;
  walletAddress?: string;
  walletPairedAt?: any; // Firestore Timestamp
  walletNetwork?: "testnet" | "mainnet";
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
}

// Company Profile Types
export interface CompanyProfile {
  userId: string;
  // Basic Info
  companyName: string;
  registrationNumber: string;
  industry: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  
  // Details
  taxId: string;
  foundingYear: number;
  employeeCount: number;
  annualRevenue: number;
  companyDescription: string;
  
  // Documents (Firebase Storage URLs)
  documents: {
    businessPlanUrl?: string;
    financialStatementsUrl?: string;
    referencesUrl?: string;
  };
  
  // References
  references: {
    name: string;
    company: string;
    email: string;
    phone: string;
  }[];
  
  createdAt: any;
  updatedAt: any;
  completedAt?: any;
}

// KYC Submission Types
export interface KYCDocument {
  name: string;
  url: string;
  uploadedAt: any;
  fileSize: number;
  fileType: string;
}

export interface KYCSubmission {
  userId: string;
  status: KYCStatus;
  
  // Step 1: ID Proof
  idProof: KYCDocument[];
  
  // Step 2: Company Registration
  companyRegistration: KYCDocument[];
  
  // Step 3: Address Proof
  addressProof: KYCDocument[];
  
  // Step 4: Financial Documents
  financialDocuments: KYCDocument[];
  
  // Step 5: Video Verification
  videoVerification?: {
    videoUrl?: string;
    scheduledCallDate?: any;
    completed: boolean;
  };
  
  // Metadata
  submittedAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
  reviewNotes?: string;
  createdAt: any;
  updatedAt: any;
}

// Bond Types
export type BondStatus = 
  | "draft" 
  | "under_review" 
  | "approved" 
  | "rejected" 
  | "published" 
  | "active" 
  | "matured" 
  | "defaulted";

export type RiskLevel = "Low Risk" | "Medium Risk" | "High Risk";

export interface Bond {
  id: string;
  issuerId: string;
  issuerName: string;
  
  // Basic Info
  name: string;
  description: string;
  fullDescription: string;
  sector: string;
  
  // Terms
  interestApyPct: number;
  durationMonths: number;
  maturityDate: string; // ISO date
  couponRate: number;
  paymentFrequency: string; // "Monthly", "Quarterly", "Semi-annual", "Annual"
  
  // Financials (all in HBAR)
  targetHbar: number;
  fundedHbar: number;
  faceValue: number; // in HBAR
  minInvestment: number; // in HBAR
  available: number; // in HBAR
  
  // Risk & Rating
  collateral: string;
  riskLevel: RiskLevel;
  rating: string;
  
  // Status & Verification
  status: BondStatus;
  verified: boolean;
  
  // Documents (Firebase Storage URLs)
  documents?: {
    termSheetUrl?: string;
    financialStatementsUrl?: string;
    collateralDocumentsUrl?: string;
    legalDocumentsUrl?: string;
  };
  
  // Metadata
  createdAt: any;
  updatedAt: any;
  submittedForReviewAt?: any;
  approvedAt?: any;
  rejectedAt?: any;
  publishedAt?: any;
  
  // Review
  reviewNotes?: string;
  rejectionReason?: string;
}

// Investment Types (for future use)
export interface Investment {
  id: string;
  bondId: string;
  investorId: string;
  amountHbar: number; // in HBAR
  units: number;
  investedAt: any;
  status: "active" | "matured" | "cancelled";
}

// Analytics Types
export interface BondAnalytics {
  bondId: string;
  totalInvestors: number;
  averageInvestment: number;
  fundingProgress: number; // percentage
  daysActive: number;
  expectedReturn: number;
  actualReturn?: number;
}

export interface IssuerDashboardMetrics {
  totalBonds: number;
  activeBonds: number;
  totalRaised: number;
  totalInvestors: number;
  pendingReviews: number;
  averageFundingRate: number;
}



