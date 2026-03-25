// services/chipinService.ts
// Frontend service wrappers for Chip-in API — all calls proxied via Vercel API routes
// The actual Chip-in API key NEVER touches the browser

export interface ChipinVoucherItem {
  code: string;
  name: string;
  value: number; // in RM (not cents — API route handles conversion)
}

export interface CreatePurchasePayload {
  customerEmail: string;
  customerName?: string;
  vouchers: ChipinVoucherItem[];
  type: 'pos' | 'online';
  successUrl?: string;
  failureUrl?: string;
}

export interface CreatePurchaseResult {
  purchaseId: string;
  checkoutUrl: string | null;
  status: string;
}

export interface MarkAsPaidResult {
  success: boolean;
  markedAsPaid: boolean;
  purchaseId: string;
}

// Detect the base URL — works for both local dev and production
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export const createChipinPurchase = async (
  payload: CreatePurchasePayload
): Promise<CreatePurchaseResult> => {
  const res = await fetch(`${getBaseUrl()}/api/create-purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Chip-in create-purchase failed (${res.status})`);
  }

  return res.json();
};

export const markChipinPurchaseAsPaid = async (
  purchaseId: string
): Promise<MarkAsPaidResult> => {
  const res = await fetch(`${getBaseUrl()}/api/mark-as-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Chip-in mark-as-paid failed (${res.status})`);
  }

  return res.json();
};
