import { z } from "zod";

export const bondSchema = z.object({
  id: z.string().optional(),
  issuerId: z.string(),
  issuerName: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  fullDescription: z.string().optional().default(""),
  sector: z.string().optional().default("Other"),
  interestApyPct: z.number(),
  durationMonths: z.number(),
  couponRate: z.number().optional().default(0),
  paymentFrequency: z.string().optional().default("Semi-annual"),
  targetHbar: z.number().min(100), // minimum 100 HBAR
  fundedHbar: z.number().optional().default(0),
  faceValue: z.number().min(1), // minimum 1 HBAR
  minInvestment: z.number().min(1), // minimum 1 HBAR
  available: z.number().min(0),
  collateral: z.string().optional().default("Other"),
  riskLevel: z.enum(["Low Risk", "Medium Risk", "High Risk"]).optional().default("Medium Risk"),
  rating: z.string().optional().default("Unrated"),
  status: z.string().optional().default("draft"),
  verified: z.boolean().optional().default(false),
  maturityDate: z.string().optional().default(new Date().toISOString()),
  documents: z.any().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});


