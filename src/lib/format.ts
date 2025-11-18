export function daysUntil(dateIso: string): number {
  const now = new Date();
  const target = new Date(dateIso);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / (24 * 3600 * 1000)));
}

// HBAR utilities
// 1 HBAR = 100,000,000 tinybars (1e8)
const TINYBARS_PER_HBAR = BigInt(100000000);

/**
 * Format HBAR amount for display
 */
export function formatHbar(amount: number | undefined | null, decimals: number = 2): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "0.00 HBAR";
  }
  return `${amount.toFixed(decimals)} HBAR`;
}

/**
 * Format tinybars for display
 */
export function formatTinybars(tinybars: bigint): string {
  const hbar = Number(tinybars) / Number(TINYBARS_PER_HBAR);
  return formatHbar(hbar);
}


