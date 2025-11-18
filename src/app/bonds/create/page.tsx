"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { doc, setDoc, updateDoc, serverTimestamp, getDoc, collection } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, storage } from "@/lib/firebase";
import { db } from "@/lib/db";
import { IssuerGuard } from "@/components/guards/IssuerGuard";
import { KYCGuard } from "@/components/guards/KYCGuard";
import { ProfileCompleteGuard } from "@/components/guards/ProfileCompleteGuard";
import { WalletGuard } from "@/components/guards/WalletGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { Progress } from "@/components/ui/progress";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useWallet } from "@/lib/hooks/useWallet";
import { useIssuerRegistration } from "@/lib/hooks/useIssuerRegistration";
import { IssuerRegistrationModal } from "@/components/IssuerRegistrationModal";

const bondSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  sector: z.string().min(2, "Sector is required"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  fullDescription: z.string().min(50, "Full description must be at least 50 characters"),
  
  interestApyPct: z.number().min(0.1).max(50),
  durationMonths: z.number().min(1).max(120),
  couponRate: z.number().min(0).max(50),
  paymentFrequency: z.enum(["Monthly", "Quarterly", "Semi-annual", "Annual"]),
  
  targetHbar: z.number().min(100), // minimum 100 HBAR
  faceValue: z.number().min(1, "Face value must be at least 1 HBAR"),
  minInvestment: z.number().min(1), // minimum 1 HBAR
  available: z.number().min(100), // minimum 100 HBAR
  
  collateral: z.string().min(5, "Collateral description required"),
});

type BondFormValues = z.infer<typeof bondSchema>;

const STEPS = [
  { label: "Basic Info", description: "Bond details" },
  { label: "Terms", description: "Interest & duration" },
  { label: "Financials", description: "Amounts" },
  { label: "Documents", description: "Upload files" },
  { label: "Review", description: "Submit" },
];

export default function CreateBondPage() {
  const router = useRouter();
  const { canCreateBond, profileComplete, kycApproved } = useUserRole();
  const { isConnected, accountId } = useWallet();
  const { isRegistered, isChecking } = useIssuerRegistration();
  const [userId, setUserId] = useState<string | null>(null);
  const [issuerName, setIssuerName] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [documents, setDocuments] = useState<{
    termSheet?: File;
    financialStatements?: File;
    collateralDocs?: File;
    legalDocs?: File;
  }>({});

  const form = useForm<BondFormValues>({
    resolver: zodResolver(bondSchema),
    defaultValues: {
      name: "",
      sector: "",
      description: "",
      fullDescription: "",
      interestApyPct: 5.5,
      durationMonths: 12,
      couponRate: 8,
      paymentFrequency: "Semi-annual",
      targetHbar: 1000, // Default 1000 HBAR
      faceValue: 1, // Auto-calculated: targetHbar / available
      minInvestment: 10, // Default 10 HBAR
      available: 1000, // Default 1000 HBAR
      collateral: "",
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.uid);
      
      // Get company profile to set issuer name
      const profileRef = doc(db, "companyProfiles", user.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        setIssuerName(profileSnap.data().companyName);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Auto-calculate face value based on target amount and available units
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "targetHbar" || name === "available") {
        const targetHbar = value.targetHbar || 0;
        const available = value.available || 0;
        
        if (targetHbar > 0 && available > 0) {
          const calculatedFaceValue = targetHbar / available;
          form.setValue("faceValue", Math.round(calculatedFaceValue * 100) / 100);
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form]);

  // Check if issuer is registered when wallet is connected
  useEffect(() => {
    if (isConnected && accountId && isRegistered === false && !isChecking) {
      setShowRegistrationModal(true);
    }
  }, [isConnected, accountId, isRegistered, isChecking]);

  const uploadDocument = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, `bond-documents/${userId}/${path}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleSubmit = async (values: BondFormValues, submitForReview: boolean = false) => {
    if (!userId || !canCreateBond) {
      return toast.error("You don't have permission to create bonds");
    }

    // Check if issuer is registered on blockchain
    if (isConnected && accountId && isRegistered === false) {
      setShowRegistrationModal(true);
      toast.error("Please register as an issuer on the blockchain first");
      return;
    }

    setSubmitting(true);
    const t = toast.loading(submitForReview ? "Submitting bond for review..." : "Creating bond...");

    try {
      // Verify user document exists and has required fields before creating bond
      // This helps debug Firestore permission issues
      const userDocRef = doc(db, "users", userId);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists()) {
        throw new Error("User profile not found. Please complete your profile setup.");
      }
      
      const userData = userDocSnap.data();
      if (userData.role !== "issuer") {
        throw new Error("You must be an issuer to create bonds.");
      }
      if (!userData.profileComplete) {
        throw new Error("Please complete your company profile before creating bonds.");
      }
      if (userData.kycStatus !== "approved") {
        throw new Error("Your KYC verification must be approved before creating bonds.");
      }
      // Upload documents
      const documentUrls: {
        termSheetUrl?: string;
        financialStatementsUrl?: string;
        collateralDocumentsUrl?: string;
        legalDocumentsUrl?: string;
      } = {};

      if (documents.termSheet) {
        documentUrls.termSheetUrl = await uploadDocument(documents.termSheet, `term-sheet-${Date.now()}.pdf`);
      }
      if (documents.financialStatements) {
        documentUrls.financialStatementsUrl = await uploadDocument(documents.financialStatements, `financials-${Date.now()}.pdf`);
      }
      if (documents.collateralDocs) {
        documentUrls.collateralDocumentsUrl = await uploadDocument(documents.collateralDocs, `collateral-${Date.now()}.pdf`);
      }
      if (documents.legalDocs) {
        documentUrls.legalDocumentsUrl = await uploadDocument(documents.legalDocs, `legal-${Date.now()}.pdf`);
      }

      // Calculate maturity date
      const maturityDate = new Date();
      maturityDate.setMonth(maturityDate.getMonth() + values.durationMonths);

      // Create bond document with auto-generated ID
      const bondRef = doc(collection(db, "bonds"));
      
      // Always create with 'draft' status (required by Firestore rules)
      const bondData: Record<string, unknown> = {
        issuerId: userId,
        issuerName: issuerName || "Unknown Issuer",
        name: values.name,
        sector: values.sector,
        description: values.description,
        fullDescription: values.fullDescription,
        interestApyPct: 5.5, // Fixed platform rate
        durationMonths: values.durationMonths,
        couponRate: values.couponRate,
        paymentFrequency: values.paymentFrequency,
        targetHbar: values.targetHbar,
        fundedHbar: 0,
        faceValue: values.faceValue,
        minInvestment: values.minInvestment,
        available: values.available,
        collateral: values.collateral,
        riskLevel: "Medium Risk", // Default, will be evaluated by admin
        rating: "Unrated", // Default, will be evaluated by admin
        status: "draft", // Must be 'draft' on create (Firestore rule requirement)
        verified: false,
        maturityDate: maturityDate.toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Only include documents if there are any (optional field)
      if (Object.keys(documentUrls).length > 0) {
        bondData.documents = documentUrls;
      }
      
      // Log the data being sent for debugging
      console.log("Creating bond with data:", {
        ...bondData,
        createdAt: "[serverTimestamp]",
        updatedAt: "[serverTimestamp]",
      });
      
      // Create the bond with 'draft' status
      await setDoc(bondRef, bondData);

      // If submitting for review, update status to 'under_review'
      if (submitForReview) {
        await updateDoc(bondRef, {
          status: "under_review",
          submittedForReviewAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast.success(
        submitForReview 
          ? "Bond submitted for review successfully!" 
          : "Bond created successfully!",
        { id: t }
      );
      router.push("/bonds/my-bonds");
    } catch (error: unknown) {
      console.error("Error creating bond:", error);
      
      // Provide more specific error messages
      let errorMessage = "Failed to create bond";
      if (error && typeof error === "object" && "code" in error && error.code === "permission-denied") {
        errorMessage = "Permission denied. Please ensure you have completed your profile and KYC verification.";
      } else if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
        errorMessage = `Failed to create bond: ${error.message}`;
      }
      
      toast.error(errorMessage, { id: t });
    } finally {
      setSubmitting(false);
    }
  };

  const nextStep = async () => {
    let isValid = false;
    
    if (currentStep === 1) {
      isValid = await form.trigger(["name", "sector", "description", "fullDescription"]);
    } else if (currentStep === 2) {
      isValid = await form.trigger(["interestApyPct", "durationMonths", "couponRate", "paymentFrequency"]);
    } else if (currentStep === 3) {
      isValid = await form.trigger(["targetHbar", "faceValue", "minInvestment", "available", "collateral"]);
    } else {
      isValid = true;
    }

    if (isValid) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  // Temporary mock function to fill form and go to last step
  const fillMockData = () => {
    form.reset({
      name: "Growth Bond 2025",
      sector: "Technology",
      description: "A high-growth technology bond offering attractive returns for investors seeking exposure to the tech sector. This bond is backed by a portfolio of innovative technology companies.",
      fullDescription: "This Growth Bond 2025 offers investors an opportunity to participate in the technology sector's growth potential. The bond is structured with competitive interest rates and is backed by a diversified portfolio of technology companies. We have a strong track record in the technology sector and are committed to delivering value to our investors. The bond proceeds will be used to fund expansion projects, research and development initiatives, and strategic acquisitions in the technology space. Our experienced management team has a proven track record of successful investments and will ensure prudent management of the bond proceeds. This is an excellent opportunity for investors looking to diversify their portfolio with technology sector exposure while earning attractive returns.",
      interestApyPct: 7.5,
      durationMonths: 24,
      couponRate: 8.5,
      paymentFrequency: "Quarterly" as const,
      targetHbar: 5000,
      faceValue: 10,
      minInvestment: 10,
      available: 5000,
      collateral: "Portfolio of technology company stocks and real estate assets valued at $75,000",
    });
    setCurrentStep(STEPS.length); // Go to last step (Review)
    toast.success("Form filled with mock data!");
  };

  // Block access if requirements not met
  if (!profileComplete || !kycApproved || !isConnected) {
    return (
      <IssuerGuard>
        <ProfileCompleteGuard showBanner={false}>
          <KYCGuard blockAccess showModal={false}>
            <WalletGuard mode="block" customMessage="You must connect your Hedera wallet before creating a bond. The wallet will be used for bond token management.">
              <main className="mx-auto w-full max-w-4xl px-4 py-8">
                <div className="text-center">
                  <h1 className="text-3xl font-semibold tracking-tight mb-4">Create Bond</h1>
                  <p className="text-muted-foreground">
                    Loading requirements...
                  </p>
                </div>
              </main>
            </WalletGuard>
          </KYCGuard>
        </ProfileCompleteGuard>
      </IssuerGuard>
    );
  }

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <IssuerGuard>
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Create Bond</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a new bond offering for investors
            </p>
          </div>
          {/* Temporary mock button */}
          <Button
            type="button"
            variant="outline"
            onClick={fillMockData}
            className="bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950 dark:hover:bg-yellow-900 border-yellow-200 dark:border-yellow-800"
          >
            🧪 Fill Mock Data
          </Button>
        </div>

        <div className="mt-8 space-y-6">
          <div>
            <Stepper steps={STEPS} currentStep={currentStep} />
            <div className="mt-4">
              <Progress value={progress} showLabel />
            </div>
          </div>

          <form className="space-y-6">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              {/* Step 1: Basic Info */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Basic Information</h3>
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <label htmlFor="name" className="text-sm font-medium">Bond Name *</label>
                      <Input id="name" {...form.register("name")} placeholder="e.g., Growth Bond 2025" />
                      {form.formState.errors.name && (
                        <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="sector" className="text-sm font-medium">Sector *</label>
                      <select
                        id="sector"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        {...form.register("sector")}
                      >
                        <option value="">Select a sector</option>
                        <option value="Agriculture">Agriculture</option>
                        <option value="Automotive">Automotive</option>
                        <option value="Construction">Construction</option>
                        <option value="Education">Education</option>
                        <option value="Energy">Energy</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Financial Services">Financial Services</option>
                        <option value="Food & Beverage">Food & Beverage</option>
                        <option value="Healthcare">Healthcare</option>
                        <option value="Hospitality">Hospitality</option>
                        <option value="Information Technology">Information Technology</option>
                        <option value="Manufacturing">Manufacturing</option>
                        <option value="Media">Media</option>
                        <option value="Pharmaceuticals">Pharmaceuticals</option>
                        <option value="Real Estate">Real Estate</option>
                        <option value="Retail">Retail</option>
                        <option value="Telecommunications">Telecommunications</option>
                        <option value="Transportation">Transportation</option>
                        <option value="Utilities">Utilities</option>
                        <option value="Other">Other</option>
                      </select>
                      {form.formState.errors.sector && (
                        <p className="text-xs text-destructive">{form.formState.errors.sector.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="description" className="text-sm font-medium">Short Description *</label>
                      <textarea
                        id="description"
                        rows={2}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        {...form.register("description")}
                        placeholder="Brief description (shown on cards)"
                      />
                      {form.formState.errors.description && (
                        <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="fullDescription" className="text-sm font-medium">Full Description *</label>
                      <textarea
                        id="fullDescription"
                        rows={4}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        {...form.register("fullDescription")}
                        placeholder="Detailed description of the bond offering"
                      />
                      {form.formState.errors.fullDescription && (
                        <p className="text-xs text-destructive">{form.formState.errors.fullDescription.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Terms */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Bond Terms</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label htmlFor="interestApyPct" className="text-sm font-medium">Interest Rate (% APY) *</label>
                      <Input
                        id="interestApyPct"
                        type="number"
                        step="0.1"
                        {...form.register("interestApyPct", { valueAsNumber: true })}
                        disabled
                        className="bg-muted cursor-not-allowed"
                      />
                      {form.formState.errors.interestApyPct && (
                        <p className="text-xs text-destructive">{form.formState.errors.interestApyPct.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="durationMonths" className="text-sm font-medium">Duration (Months) *</label>
                      <Input
                        id="durationMonths"
                        type="number"
                        {...form.register("durationMonths", { valueAsNumber: true })}
                      />
                      {form.formState.errors.durationMonths && (
                        <p className="text-xs text-destructive">{form.formState.errors.durationMonths.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="couponRate" className="text-sm font-medium">Coupon Rate (%) *</label>
                      <Input
                        id="couponRate"
                        type="number"
                        step="0.1"
                        {...form.register("couponRate", { valueAsNumber: true })}
                      />
                      {form.formState.errors.couponRate && (
                        <p className="text-xs text-destructive">{form.formState.errors.couponRate.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="paymentFrequency" className="text-sm font-medium">Payment Frequency *</label>
                      <select
                        id="paymentFrequency"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        {...form.register("paymentFrequency")}
                      >
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Semi-annual">Semi-annual</option>
                        <option value="Annual">Annual</option>
                      </select>
                      {form.formState.errors.paymentFrequency && (
                        <p className="text-xs text-destructive">{form.formState.errors.paymentFrequency.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Financials */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Financial Details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label htmlFor="targetHbar" className="text-sm font-medium">Target Amount (HBAR) *</label>
                      <Input
                        id="targetHbar"
                        type="number"
                        {...form.register("targetHbar", { valueAsNumber: true })}
                      />
                      {form.formState.errors.targetHbar && (
                        <p className="text-xs text-destructive">{form.formState.errors.targetHbar.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="faceValue" className="text-sm font-medium">Face Value (HBAR) *</label>
                      <Input
                        id="faceValue"
                        type="number"
                        {...form.register("faceValue", { valueAsNumber: true })}
                        disabled
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground">Auto-calculated: Target Amount ÷ Available Units</p>
                      {form.formState.errors.faceValue && (
                        <p className="text-xs text-destructive">{form.formState.errors.faceValue.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="minInvestment" className="text-sm font-medium">Min Investment (HBAR) *</label>
                      <Input
                        id="minInvestment"
                        type="number"
                        {...form.register("minInvestment", { valueAsNumber: true })}
                      />
                      {form.formState.errors.minInvestment && (
                        <p className="text-xs text-destructive">{form.formState.errors.minInvestment.message}</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="available" className="text-sm font-medium">Available Units *</label>
                      <Input
                        id="available"
                        type="number"
                        {...form.register("available", { valueAsNumber: true })}
                      />
                      {form.formState.errors.available && (
                        <p className="text-xs text-destructive">{form.formState.errors.available.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="collateral" className="text-sm font-medium">Collateral *</label>
                    <Input id="collateral" {...form.register("collateral")} placeholder="Description of collateral" />
                    {form.formState.errors.collateral && (
                      <p className="text-xs text-destructive">{form.formState.errors.collateral.message}</p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Note: Risk level and rating will be evaluated by the admin.</p>
                </div>
              )}

              {/* Step 4: Documents */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Documents (Optional)</h3>
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <label htmlFor="termSheet" className="text-sm font-medium">Term Sheet</label>
                      <Input
                        id="termSheet"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, termSheet: file });
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="financialStatements" className="text-sm font-medium">Financial Statements</label>
                      <Input
                        id="financialStatements"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, financialStatements: file });
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="collateralDocs" className="text-sm font-medium">Collateral Documents</label>
                      <Input
                        id="collateralDocs"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, collateralDocs: file });
                        }}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="legalDocs" className="text-sm font-medium">Legal Documents</label>
                      <Input
                        id="legalDocs"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, legalDocs: file });
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Review */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Review & Submit</h3>
                  <div className="space-y-3">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium mb-2">Basic Information</div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>Name: {form.watch("name")}</div>
                        <div>Sector: {form.watch("sector")}</div>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium mb-2">Terms</div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>Interest: {form.watch("interestApyPct")}% APY</div>
                        <div>Duration: {form.watch("durationMonths")} months</div>
                        <div>Payment: {form.watch("paymentFrequency")}</div>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium mb-2">Financials</div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>Target: {form.watch("targetHbar").toLocaleString()} HBAR</div>
                        <div>Min Investment: {form.watch("minInvestment")} HBAR</div>
                      </div>
                    </div>
                  </div>

                  {/* Wallet Information */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 p-4">
                    <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100 mb-2">
                      Connected Wallet
                    </div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">
                      Bond tokens will be managed through this wallet:
                    </div>
                    <code className="block rounded bg-emerald-100 dark:bg-emerald-900/30 px-3 py-2 text-xs font-mono text-emerald-900 dark:text-emerald-100">
                      {accountId}
                    </code>
                  </div>

                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                      You can save your bond as a draft to continue editing later, or submit it for admin review. Once submitted for review, you won&apos;t be able to edit until it&apos;s approved or rejected.
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 mt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1 || submitting}
                >
                  Previous
                </Button>
                {currentStep < STEPS.length ? (
                  <Button type="button" onClick={nextStep} disabled={submitting}>
                    Next
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.handleSubmit((values) => handleSubmit(values, false))()}
                      disabled={submitting}
                    >
                      {submitting ? "Saving..." : "Save as Draft"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => form.handleSubmit((values) => handleSubmit(values, true))()}
                      disabled={submitting}
                    >
                      {submitting ? "Submitting..." : "Submit for Review"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </main>
      <IssuerRegistrationModal 
        open={showRegistrationModal} 
        onOpenChange={setShowRegistrationModal} 
      />
    </IssuerGuard>
  );
}



