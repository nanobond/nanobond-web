"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db } from "@/lib/db";
import { storage } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { Progress } from "@/components/ui/progress";
import { Plus, X } from "lucide-react";

const companyProfileSchema = z.object({
  // Basic Info
  companyName: z.string().min(2, "Company name is required"),
  registrationNumber: z.string().min(1, "Registration number is required"),
  industry: z.string().min(1, "Industry is required"),
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  country: z.string().min(1, "Country is required"),
  
  // Details
  taxId: z.string().min(1, "Tax ID is required"),
  foundingYear: z.number().min(1800).max(new Date().getFullYear()),
  employeeCount: z.number().min(1),
  annualRevenue: z.number().min(0),
  companyDescription: z.string().min(20, "Description must be at least 20 characters"),
});

type CompanyProfileFormValues = z.infer<typeof companyProfileSchema>;

const STEPS = [
  { label: "Basic Info", description: "Company details" },
  { label: "Details", description: "Additional info" },
  { label: "Documents", description: "Upload files" },
  { label: "References", description: "Business refs" },
];

interface Reference {
  name: string;
  company: string;
  email: string;
  phone: string;
}

export function CompanyProfileForm({ userId }: { userId: string }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [references, setReferences] = useState<Reference[]>([]);
  const [documents, setDocuments] = useState<{
    businessPlan?: File;
    financialStatements?: File;
    referencesDoc?: File;
  }>({});
  const [existingDocUrls, setExistingDocUrls] = useState<{
    businessPlanUrl?: string;
    financialStatementsUrl?: string;
    referencesUrl?: string;
  }>({});
  const [loading, setLoading] = useState(true);
  const [existingProfile, setExistingProfile] = useState(false);

  const form = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    mode: "onBlur",
    defaultValues: {
      companyName: "",
      registrationNumber: "",
      industry: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      taxId: "",
      foundingYear: new Date().getFullYear(),
      employeeCount: 1,
      annualRevenue: 0,
      companyDescription: "",
    },
  });

  // Load existing company profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profileRef = doc(db, "companyProfiles", userId);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setExistingProfile(true);
          
          // Populate form with existing data
          form.reset({
            companyName: data.companyName || "",
            registrationNumber: data.registrationNumber || "",
            industry: data.industry || "",
            street: data.address?.street || "",
            city: data.address?.city || "",
            state: data.address?.state || "",
            zipCode: data.address?.zipCode || "",
            country: data.address?.country || "",
            taxId: data.taxId || "",
            foundingYear: data.foundingYear || new Date().getFullYear(),
            employeeCount: data.employeeCount || 1,
            annualRevenue: data.annualRevenue || 0,
            companyDescription: data.companyDescription || "",
          });
          
          // Populate references
          if (data.references && Array.isArray(data.references)) {
            setReferences(data.references);
          }
          
          // Populate existing document URLs
          if (data.documents) {
            const docUrls = {
              businessPlanUrl: data.documents.businessPlanUrl,
              financialStatementsUrl: data.documents.financialStatementsUrl,
              referencesUrl: data.documents.referencesUrl,
            };
            console.log("Loading existing documents:", docUrls);
            setExistingDocUrls(docUrls);
          }
        }
      } catch (error) {
        console.error("Error loading company profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [userId, form]);

  const addReference = () => {
    setReferences([...references, { name: "", company: "", email: "", phone: "" }]);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  const updateReference = (index: number, field: keyof Reference, value: string) => {
    const updated = [...references];
    updated[index] = { ...updated[index], [field]: value };
    setReferences(updated);
  };

  const uploadDocument = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, `company-profiles/${userId}/${path}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleSubmit = async (values: CompanyProfileFormValues) => {
    const t = toast.loading("Saving company profile...");
    try {
      console.log("=== Starting save ===");
      console.log("Existing doc URLs:", existingDocUrls);
      console.log("New documents to upload:", documents);
      
      // Upload documents - start with existing URLs
      const documentUrls: {
        businessPlanUrl?: string;
        financialStatementsUrl?: string;
        referencesUrl?: string;
      } = { ...existingDocUrls };

      // Only upload if new file selected
      if (documents.businessPlan) {
        console.log("Uploading business plan...");
        documentUrls.businessPlanUrl = await uploadDocument(
          documents.businessPlan,
          "business-plan.pdf"
        );
        console.log("Business plan uploaded:", documentUrls.businessPlanUrl);
      }
      if (documents.financialStatements) {
        console.log("Uploading financial statements...");
        documentUrls.financialStatementsUrl = await uploadDocument(
          documents.financialStatements,
          "financial-statements.pdf"
        );
        console.log("Financial statements uploaded:", documentUrls.financialStatementsUrl);
      }
      if (documents.referencesDoc) {
        console.log("Uploading references doc...");
        documentUrls.referencesUrl = await uploadDocument(
          documents.referencesDoc,
          "references.pdf"
        );
        console.log("References doc uploaded:", documentUrls.referencesUrl);
      }

      console.log("Final documentUrls to save:", documentUrls);

      // Save company profile
      const companyProfileRef = doc(db, "companyProfiles", userId);
      const profileData = {
        userId,
        companyName: values.companyName,
        registrationNumber: values.registrationNumber,
        industry: values.industry,
        address: {
          street: values.street,
          city: values.city,
          state: values.state,
          zipCode: values.zipCode,
          country: values.country,
        },
        taxId: values.taxId,
        foundingYear: values.foundingYear,
        employeeCount: values.employeeCount,
        annualRevenue: values.annualRevenue,
        companyDescription: values.companyDescription,
        documents: documentUrls,
        references,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      };
      
      console.log("Saving profile data:", profileData);
      await setDoc(companyProfileRef, profileData);
      console.log("Profile saved to Firestore successfully");

      // Update user metadata
      const userRef = doc(db, "users", userId);
      await setDoc(userRef, {
        profileComplete: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("User metadata updated");

      toast.success("Company profile saved successfully!", { id: t });
      setExistingProfile(true);
      // Clear the documents state so new uploads don't persist
      setDocuments({});
      // Update existing doc URLs with the new ones
      setExistingDocUrls(documentUrls);
      console.log("=== Save completed ===");
    } catch (error) {
      console.error("Error saving company profile:", error);
      toast.error("Failed to save company profile", { id: t });
    }
  };

  const nextStep = async () => {
    console.log("nextStep called, currentStep:", currentStep);
    let isValid = false;
    
    if (currentStep === 1) {
      isValid = await form.trigger([
        "companyName", "registrationNumber", "industry",
        "street", "city", "state", "zipCode", "country"
      ]);
    } else if (currentStep === 2) {
      isValid = await form.trigger([
        "taxId", "foundingYear", "employeeCount", "annualRevenue", "companyDescription"
      ]);
    } else {
      // Steps 3 and 4 don't require validation
      isValid = true;
    }

    console.log("Validation result:", isValid);
    if (isValid) {
      const newStep = currentStep + 1;
      console.log("Moving to step:", newStep);
      setCurrentStep(newStep);
    } else {
      toast.error("Please fill in all required fields correctly");
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const progress = (currentStep / STEPS.length) * 100;

  // Debug logging
  if (currentStep === 3) {
    console.log("On Documents step - existingDocUrls:", existingDocUrls);
    console.log("On Documents step - documents:", documents);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Loading company profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {existingProfile && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-100">
          ✓ Company profile is complete. You can update it anytime.
        </div>
      )}
      <div>
        <Stepper steps={STEPS} currentStep={currentStep} />
        <div className="mt-4">
          <Progress value={progress} showLabel />
        </div>
      </div>

      <form 
        onSubmit={(e) => {
          e.preventDefault();
          // Only submit if on the last step
          if (currentStep === STEPS.length) {
            form.handleSubmit(handleSubmit)(e);
          } else {
            console.log("Form submission blocked - not on last step");
          }
        }} 
        className="space-y-6"
      >
        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="companyName" className="text-sm font-medium">Company Name *</label>
                <Input id="companyName" {...form.register("companyName")} />
                {form.formState.errors.companyName && (
                  <p className="text-xs text-destructive">{form.formState.errors.companyName.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="registrationNumber" className="text-sm font-medium">Registration Number *</label>
                <Input id="registrationNumber" {...form.register("registrationNumber")} />
                {form.formState.errors.registrationNumber && (
                  <p className="text-xs text-destructive">{form.formState.errors.registrationNumber.message}</p>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="industry" className="text-sm font-medium">Industry *</label>
              <select
                id="industry"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                {...form.register("industry")}
              >
                <option value="">Select an industry</option>
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
              {form.formState.errors.industry && (
                <p className="text-xs text-destructive">{form.formState.errors.industry.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="street" className="text-sm font-medium">Street Address *</label>
              <Input id="street" {...form.register("street")} />
              {form.formState.errors.street && (
                <p className="text-xs text-destructive">{form.formState.errors.street.message}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="city" className="text-sm font-medium">City *</label>
                <Input id="city" {...form.register("city")} />
                {form.formState.errors.city && (
                  <p className="text-xs text-destructive">{form.formState.errors.city.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="state" className="text-sm font-medium">State *</label>
                <Input id="state" {...form.register("state")} />
                {form.formState.errors.state && (
                  <p className="text-xs text-destructive">{form.formState.errors.state.message}</p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="zipCode" className="text-sm font-medium">ZIP Code *</label>
                <Input id="zipCode" {...form.register("zipCode")} />
                {form.formState.errors.zipCode && (
                  <p className="text-xs text-destructive">{form.formState.errors.zipCode.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="country" className="text-sm font-medium">Country *</label>
                <Input id="country" {...form.register("country")} />
                {form.formState.errors.country && (
                  <p className="text-xs text-destructive">{form.formState.errors.country.message}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Company Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="taxId" className="text-sm font-medium">Tax ID *</label>
                <Input id="taxId" {...form.register("taxId")} />
                {form.formState.errors.taxId && (
                  <p className="text-xs text-destructive">{form.formState.errors.taxId.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="foundingYear" className="text-sm font-medium">Founding Year *</label>
                <Input
                  id="foundingYear"
                  type="number"
                  {...form.register("foundingYear", { valueAsNumber: true })}
                />
                {form.formState.errors.foundingYear && (
                  <p className="text-xs text-destructive">{form.formState.errors.foundingYear.message}</p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="employeeCount" className="text-sm font-medium">Number of Employees *</label>
                <Input
                  id="employeeCount"
                  type="number"
                  {...form.register("employeeCount", { valueAsNumber: true })}
                />
                {form.formState.errors.employeeCount && (
                  <p className="text-xs text-destructive">{form.formState.errors.employeeCount.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="annualRevenue" className="text-sm font-medium">Annual Revenue (USD) *</label>
                <Input
                  id="annualRevenue"
                  type="number"
                  {...form.register("annualRevenue", { valueAsNumber: true })}
                />
                {form.formState.errors.annualRevenue && (
                  <p className="text-xs text-destructive">{form.formState.errors.annualRevenue.message}</p>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="companyDescription" className="text-sm font-medium">Company Description *</label>
              <textarea
                id="companyDescription"
                rows={4}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                {...form.register("companyDescription")}
              />
              {form.formState.errors.companyDescription && (
                <p className="text-xs text-destructive">{form.formState.errors.companyDescription.message}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Documents */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Documents</h3>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="businessPlan" className="text-sm font-medium">Business Plan (PDF)</label>
                {existingDocUrls.businessPlanUrl && !documents.businessPlan && (
                  <div className="text-sm text-muted-foreground mb-2">
                    Current: <a href={existingDocUrls.businessPlanUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                      View document
                    </a>
                  </div>
                )}
                <Input
                  id="businessPlan"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setDocuments({ ...documents, businessPlan: file });
                  }}
                />
                {documents.businessPlan && (
                  <span className="text-xs text-muted-foreground">New file: {documents.businessPlan.name}</span>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="financialStatements" className="text-sm font-medium">Financial Statements (PDF)</label>
                {existingDocUrls.financialStatementsUrl && !documents.financialStatements && (
                  <div className="text-sm text-muted-foreground mb-2">
                    Current: <a href={existingDocUrls.financialStatementsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                      View document
                    </a>
                  </div>
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
                {documents.financialStatements && (
                  <span className="text-xs text-muted-foreground">New file: {documents.financialStatements.name}</span>
                )}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="referencesDoc" className="text-sm font-medium">References Document (PDF)</label>
                {existingDocUrls.referencesUrl && !documents.referencesDoc && (
                  <div className="text-sm text-muted-foreground mb-2">
                    Current: <a href={existingDocUrls.referencesUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                      View document
                    </a>
                  </div>
                )}
                <Input
                  id="referencesDoc"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setDocuments({ ...documents, referencesDoc: file });
                  }}
                />
                {documents.referencesDoc && (
                  <span className="text-xs text-muted-foreground">New file: {documents.referencesDoc.name}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: References */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Business References</h3>
              <Button type="button" variant="outline" size="sm" onClick={addReference}>
                <Plus className="size-4 mr-1" /> Add Reference
              </Button>
            </div>
            {references.length === 0 && (
              <p className="text-sm text-muted-foreground">No references added yet.</p>
            )}
            {references.map((ref, index) => (
              <div key={index} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Reference {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReference(index)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Name"
                    value={ref.name}
                    onChange={(e) => updateReference(index, "name", e.target.value)}
                  />
                  <Input
                    placeholder="Company"
                    value={ref.company}
                    onChange={(e) => updateReference(index, "company", e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={ref.email}
                    onChange={(e) => updateReference(index, "email", e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    type="tel"
                    value={ref.phone}
                    onChange={(e) => updateReference(index, "phone", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            Previous
          </Button>
          {currentStep < STEPS.length ? (
            <Button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                nextStep();
              }}
            >
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : existingProfile ? "Update Profile" : "Complete Profile"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

