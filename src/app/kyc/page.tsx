"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { db } from "@/lib/db";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { DocumentUpload } from "@/components/kyc/DocumentUpload";
import { KYCStatus } from "@/components/kyc/KYCStatus";
import { IssuerGuard } from "@/components/guards/IssuerGuard";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { Video, Calendar } from "lucide-react";
import type { KYCStatus as KYCStatusType } from "@/lib/types";

const STEPS = [
  { label: "ID Proof", description: "Owner/Director ID" },
  { label: "Registration", description: "Company docs" },
  { label: "Address Proof", description: "Verification" },
  { label: "Financials", description: "Bank & tax" },
  { label: "Video", description: "Verification" },
  { label: "Review", description: "Submit" },
];

export default function KYCPage() {
  const router = useRouter();
  const { kycStatus, loading: roleLoading } = useUserRole();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Document files
  const [idProof, setIdProof] = useState<File[]>([]);
  const [companyRegistration, setCompanyRegistration] = useState<File[]>([]);
  const [addressProof, setAddressProof] = useState<File[]>([]);
  const [financialDocuments, setFinancialDocuments] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [videoOption, setVideoOption] = useState<"upload" | "schedule">("schedule");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      setUserId(user.uid);
      
      // Check if KYC already exists
      const kycRef = doc(db, "kycSubmissions", user.uid);
      const kycSnap = await getDoc(kycRef);
      
      if (kycSnap.exists()) {
        const data = kycSnap.data();
        if (data.status === "pending" || data.status === "approved") {
          // Already submitted or approved
          setLoading(false);
          return;
        }
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const uploadDocument = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, `kyc-documents/${userId}/${path}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const uploadDocuments = async (files: File[], basePath: string) => {
    const uploadPromises = files.map(async (file, index) => {
      const url = await uploadDocument(file, `${basePath}/${file.name}`);
      return {
        name: file.name,
        url,
        uploadedAt: new Date(),
        fileSize: file.size,
        fileType: file.type,
      };
    });
    return await Promise.all(uploadPromises);
  };

  const handleSubmit = async () => {
    if (!userId) return;

    setSubmitting(true);
    const t = toast.loading("Submitting KYC documents...");

    try {
      // Upload all documents
      const [idProofDocs, companyRegDocs, addressProofDocs, financialDocs] = await Promise.all([
        uploadDocuments(idProof, "id-proof"),
        uploadDocuments(companyRegistration, "company-registration"),
        uploadDocuments(addressProof, "address-proof"),
        uploadDocuments(financialDocuments, "financial-documents"),
      ]);

      // Handle video verification
      let videoVerification: any = {
        completed: false,
      };

      if (videoOption === "upload" && videoFile) {
        const videoUrl = await uploadDocument(videoFile, "video-verification.mp4");
        videoVerification = {
          videoUrl,
          completed: true,
        };
      } else if (videoOption === "schedule" && scheduledDate) {
        videoVerification = {
          scheduledCallDate: new Date(scheduledDate),
          completed: false,
        };
      }

      // Save KYC submission
      const kycRef = doc(db, "kycSubmissions", userId);
      await setDoc(kycRef, {
        userId,
        status: "pending",
        idProof: idProofDocs,
        companyRegistration: companyRegDocs,
        addressProof: addressProofDocs,
        financialDocuments: financialDocs,
        videoVerification,
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update user KYC status
      const userRef = doc(db, "users", userId);
      await setDoc(userRef, {
        kycStatus: "pending",
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast.success("KYC documents submitted successfully! Review usually takes 1-2 business days.", { id: t });
      router.push("/");
    } catch (error) {
      console.error("Error submitting KYC:", error);
      toast.error("Failed to submit KYC documents", { id: t });
    } finally {
      setSubmitting(false);
    }
  };

  const nextStep = () => {
    // Validate current step before proceeding
    if (currentStep === 1 && idProof.length === 0) {
      return toast.error("Please upload at least one ID proof document");
    }
    if (currentStep === 2 && companyRegistration.length === 0) {
      return toast.error("Please upload company registration documents");
    }
    if (currentStep === 3 && addressProof.length === 0) {
      return toast.error("Please upload address proof documents");
    }
    if (currentStep === 4 && financialDocuments.length === 0) {
      return toast.error("Please upload financial documents");
    }
    if (currentStep === 5) {
      if (videoOption === "upload" && !videoFile) {
        return toast.error("Please upload a video or schedule a call");
      }
      if (videoOption === "schedule" && !scheduledDate) {
        return toast.error("Please select a date for the verification call");
      }
    }
    
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  if (loading || roleLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  // Show status if already submitted or approved
  if (kycStatus === "pending" || kycStatus === "approved") {
    return (
      <IssuerGuard>
        <main className="mx-auto w-full max-w-4xl px-4 py-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight mb-2">KYC Verification</h1>
            <div className="mb-6 flex justify-center">
              <KYCStatus status={kycStatus} />
            </div>
            {kycStatus === "pending" && (
              <p className="text-muted-foreground">
                Your KYC documents are under review. This usually takes 1-2 business days.
              </p>
            )}
            {kycStatus === "approved" && (
              <p className="text-muted-foreground">
                Your KYC has been approved! You can now create bond offerings.
              </p>
            )}
            <Button onClick={() => router.push("/")} className="mt-6">
              Go to Dashboard
            </Button>
          </div>
        </main>
      </IssuerGuard>
    );
  }

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <IssuerGuard>
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">KYC Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete your KYC verification to start issuing bonds
        </p>

        <div className="mt-8 space-y-6">
          <div>
            <Stepper steps={STEPS} currentStep={currentStep} />
            <div className="mt-4">
              <Progress value={progress} showLabel />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            {/* Step 1: ID Proof */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">ID Proof</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload government-issued ID of the company owner or authorized director
                  </p>
                </div>
                <DocumentUpload
                  label="ID Documents"
                  description="Passport, driver's license, or national ID card"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  files={idProof}
                  onChange={setIdProof}
                  required
                />
              </div>
            )}

            {/* Step 2: Company Registration */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Company Registration</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload official company registration and incorporation documents
                  </p>
                </div>
                <DocumentUpload
                  label="Registration Documents"
                  description="Certificate of incorporation, business license, etc."
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  files={companyRegistration}
                  onChange={setCompanyRegistration}
                  required
                />
              </div>
            )}

            {/* Step 3: Address Proof */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Address Proof</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload proof of business address
                  </p>
                </div>
                <DocumentUpload
                  label="Address Documents"
                  description="Utility bills, bank statements, lease agreement (within last 3 months)"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  files={addressProof}
                  onChange={setAddressProof}
                  required
                />
              </div>
            )}

            {/* Step 4: Financial Documents */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Financial Documents</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload recent financial statements and tax documents
                  </p>
                </div>
                <DocumentUpload
                  label="Financial Documents"
                  description="Bank statements, tax returns, audited financials (last 12 months)"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  files={financialDocuments}
                  onChange={setFinancialDocuments}
                  required
                />
              </div>
            )}

            {/* Step 5: Video Verification */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Video Verification</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete video verification by uploading a video or scheduling a call
                  </p>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setVideoOption("schedule")}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      videoOption === "schedule" ? "bg-secondary" : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="size-5 text-primary" />
                      <div>
                        <div className="text-sm font-medium">Schedule a Video Call</div>
                        <div className="text-xs text-muted-foreground">
                          We'll contact you for a quick verification call
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVideoOption("upload")}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      videoOption === "upload" ? "bg-secondary" : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Video className="size-5 text-primary" />
                      <div>
                        <div className="text-sm font-medium">Upload a Video</div>
                        <div className="text-xs text-muted-foreground">
                          Record and upload a short introduction video
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {videoOption === "schedule" && (
                  <div className="grid gap-1.5">
                    <label htmlFor="scheduledDate" className="text-sm font-medium">
                      Preferred Date & Time
                    </label>
                    <Input
                      id="scheduledDate"
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                )}

                {videoOption === "upload" && (
                  <div className="grid gap-1.5">
                    <label htmlFor="videoFile" className="text-sm font-medium">
                      Upload Video
                    </label>
                    <Input
                      id="videoFile"
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setVideoFile(file);
                      }}
                    />
                    {videoFile && (
                      <p className="text-xs text-muted-foreground">
                        Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Review */}
            {currentStep === 6 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Review & Submit</h3>
                  <p className="text-sm text-muted-foreground">
                    Please review your submission before submitting
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium mb-2">ID Proof</div>
                    <div className="text-xs text-muted-foreground">
                      {idProof.length} document{idProof.length > 1 ? "s" : ""} uploaded
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium mb-2">Company Registration</div>
                    <div className="text-xs text-muted-foreground">
                      {companyRegistration.length} document{companyRegistration.length > 1 ? "s" : ""} uploaded
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium mb-2">Address Proof</div>
                    <div className="text-xs text-muted-foreground">
                      {addressProof.length} document{addressProof.length > 1 ? "s" : ""} uploaded
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium mb-2">Financial Documents</div>
                    <div className="text-xs text-muted-foreground">
                      {financialDocuments.length} document{financialDocuments.length > 1 ? "s" : ""} uploaded
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium mb-2">Video Verification</div>
                    <div className="text-xs text-muted-foreground">
                      {videoOption === "upload"
                        ? `Video uploaded: ${videoFile?.name}`
                        : `Call scheduled for: ${new Date(scheduledDate).toLocaleString()}`}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    By submitting, you confirm that all information provided is accurate and complete.
                    Our team will review your documents within 1-2 business days.
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
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit for Review"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </IssuerGuard>
  );
}