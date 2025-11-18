"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, storage } from "@/lib/firebase";
import { db } from "@/lib/db";
import { IssuerGuard } from "@/components/guards/IssuerGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { Progress } from "@/components/ui/progress";
import { useUserRole } from "@/lib/hooks/useUserRole";
import type { Bond } from "@/lib/types";

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

export default function EditBondPage() {
  const router = useRouter();
  const params = useParams();
  const bondId = params.id as string;
  const { canCreateBond, profileComplete, kycApproved } = useUserRole();
  const [userId, setUserId] = useState<string | null>(null);
  const [issuerName, setIssuerName] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bond, setBond] = useState<Bond | null>(null);
  const [documents, setDocuments] = useState<{
    termSheet?: File;
    financialStatements?: File;
    collateralDocs?: File;
    legalDocs?: File;
  }>({});
  const [existingDocuments, setExistingDocuments] = useState<{
    termSheetUrl?: string;
    financialStatementsUrl?: string;
    collateralDocumentsUrl?: string;
    legalDocumentsUrl?: string;
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

      // Load bond data
      try {
        const bondRef = doc(db, "bonds", bondId);
        const bondSnap = await getDoc(bondRef);
        
        if (!bondSnap.exists()) {
          toast.error("Bond not found");
          router.push("/bonds/my-bonds");
          return;
        }

        const bondData = { id: bondSnap.id, ...bondSnap.data() } as Bond;

        // Check if user owns this bond
        if (bondData.issuerId !== user.uid) {
          toast.error("You don't have permission to edit this bond");
          router.push("/bonds/my-bonds");
          return;
        }

        // Check if bond is in draft status
        if (bondData.status !== "draft") {
          toast.error("Only draft bonds can be edited");
          router.push("/bonds/my-bonds");
          return;
        }

        setBond(bondData);

        // Populate form with existing bond data
        form.reset({
          name: bondData.name,
          sector: bondData.sector,
          description: bondData.description,
          fullDescription: bondData.fullDescription,
          interestApyPct: 5.5, // Fixed platform rate
          durationMonths: bondData.durationMonths,
          couponRate: bondData.couponRate,
          paymentFrequency: bondData.paymentFrequency as "Monthly" | "Quarterly" | "Semi-annual" | "Annual",
          targetHbar: bondData.targetHbar,
          faceValue: bondData.faceValue,
          minInvestment: bondData.minInvestment,
          available: bondData.available,
          collateral: bondData.collateral,
        });

        // Store existing documents
        if (bondData.documents) {
          setExistingDocuments(bondData.documents);
        }
      } catch (error) {
        console.error("Error loading bond:", error);
        toast.error("Failed to load bond");
        router.push("/bonds/my-bonds");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, bondId, form]);

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

  const uploadDocument = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, `bond-documents/${userId}/${path}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleSubmit = async (values: BondFormValues, submitForReview: boolean = false) => {
    if (!userId || !canCreateBond || !bond) {
      return toast.error("You don't have permission to edit bonds");
    }

    setSubmitting(true);
    const t = toast.loading(submitForReview ? "Submitting bond for review..." : "Saving bond...");

    try {
      // Upload new documents if provided
      const documentUrls: {
        termSheetUrl?: string;
        financialStatementsUrl?: string;
        collateralDocumentsUrl?: string;
        legalDocumentsUrl?: string;
      } = { ...existingDocuments };

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

      // Update bond document
      const bondRef = doc(db, "bonds", bondId);
      
      const updateData: any = {
        name: values.name,
        sector: values.sector,
        description: values.description,
        fullDescription: values.fullDescription,
        interestApyPct: 5.5, // Fixed platform rate
        durationMonths: values.durationMonths,
        couponRate: values.couponRate,
        paymentFrequency: values.paymentFrequency,
        targetHbar: values.targetHbar,
        faceValue: values.faceValue,
        minInvestment: values.minInvestment,
        available: values.available,
        collateral: values.collateral,
        // riskLevel and rating are not updated - they are managed by admin
        maturityDate: maturityDate.toISOString(),
        documents: documentUrls,
        updatedAt: serverTimestamp(),
      };

      if (submitForReview) {
        updateData.status = "under_review";
        updateData.submittedForReviewAt = serverTimestamp();
      }

      await updateDoc(bondRef, updateData);

      toast.success(
        submitForReview 
          ? "Bond submitted for review successfully!" 
          : "Bond updated successfully!",
        { id: t }
      );
      router.push("/bonds/my-bonds");
    } catch (error) {
      console.error("Error updating bond:", error);
      toast.error("Failed to update bond", { id: t });
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

  // Block access if requirements not met
  if (!profileComplete || !kycApproved) {
    return (
      <IssuerGuard>
        <main className="mx-auto w-full max-w-4xl px-4 py-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight mb-4">Edit Bond</h1>
            <p className="text-muted-foreground">
              Loading requirements...
            </p>
          </div>
        </main>
      </IssuerGuard>
    );
  }

  if (loading) {
    return (
      <IssuerGuard>
        <main className="mx-auto w-full max-w-4xl px-4 py-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight mb-4">Edit Bond</h1>
            <p className="text-muted-foreground">
              Loading bond data...
            </p>
          </div>
        </main>
      </IssuerGuard>
    );
  }

  if (!bond) {
    return null;
  }

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <IssuerGuard>
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit Bond</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your bond offering details
        </p>

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
                      {existingDocuments.termSheetUrl && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Current file: <a href={existingDocuments.termSheetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                        </p>
                      )}
                      <Input
                        id="termSheet"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, termSheet: file });
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Upload a new file to replace the existing one</p>
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="financialStatements" className="text-sm font-medium">Financial Statements</label>
                      {existingDocuments.financialStatementsUrl && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Current file: <a href={existingDocuments.financialStatementsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                        </p>
                      )}
                      <Input
                        id="financialStatements"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, financialStatements: file });
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Upload a new file to replace the existing one</p>
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="collateralDocs" className="text-sm font-medium">Collateral Documents</label>
                      {existingDocuments.collateralDocumentsUrl && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Current file: <a href={existingDocuments.collateralDocumentsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                        </p>
                      )}
                      <Input
                        id="collateralDocs"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, collateralDocs: file });
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Upload a new file to replace the existing one</p>
                    </div>
                    <div className="grid gap-1.5">
                      <label htmlFor="legalDocs" className="text-sm font-medium">Legal Documents</label>
                      {existingDocuments.legalDocumentsUrl && (
                        <p className="text-xs text-muted-foreground mb-1">
                          Current file: <a href={existingDocuments.legalDocumentsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                        </p>
                      )}
                      <Input
                        id="legalDocs"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDocuments({ ...documents, legalDocs: file });
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Upload a new file to replace the existing one</p>
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
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                      You can save your changes as a draft or submit the bond for admin review. Once submitted for review, you won't be able to edit until it's approved or rejected.
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
    </IssuerGuard>
  );
}


