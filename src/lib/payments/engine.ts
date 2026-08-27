// =====================================================================
// POSTYAR — Payment engine abstraction
// ---------------------------------------------------------------------
// The PaymentProvider interface is implemented by card / bank / bale.
// Each provider knows how to:
//   1) createPaymentRequest({ order, user }) → returns a redirect URL,
//      invoice payload, or bot invoice URL plus a providerRef.
//   2) verifyAndFinalize({ order, requestPayload }) → called by webhook /
//      callback. Returns whether the payment is genuinely paid and, if so,
//      how much was paid (server-authoritative — must equal order.amountRials
//      HARDCHECK at the actual charge point inside each provider's handler).
//
// IMPORTANT: the actual wallet/ledger/subscription mutations happen INSIDE
// the provider's handler when an authoritative payment event arrives —
// they use atomic $transaction + deterministic idempotency keys + hard
// amount check. See each provider file for the specific protocol.
// =====================================================================
import type { CardProvider } from "@/lib/payments/card";
import type { BankProvider } from "@/lib/payments/bank";
import type { BaleProvider } from "@/lib/payments/bale";
import { getCardProvider } from "@/lib/payments/card";
import { getBankProvider } from "@/lib/payments/bank";
import { getBaleProvider } from "@/lib/payments/bale";

export type PaymentProviderKind = "card" | "bank" | "bale";

export interface OrderLike {
  id: string;
  userId: string;
  kind: string;
  amountRials: number;
  descriptionFa: string;
  status: string;
}

export interface CreatePaymentRequestResult {
  redirectUrl?: string;
  invoicePayload?: string;
  botInvoiceUrl?: string;
  providerRef: string;
  // Additional provider-specific view data the UI may show.
  view?: Record<string, unknown>;
}

export interface VerifyAndFinalizeResult {
  ok: boolean;
  paidRials?: number;
  providerRef?: string;
  errorFa?: string;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly kind: PaymentProviderKind;
  createPaymentRequest(input: {
    order: OrderLike;
    user: { id: string; firstName: string; lastName: string };
    extras?: Record<string, unknown>;
  }): Promise<CreatePaymentRequestResult>;
  verifyAndFinalize(input: {
    order: OrderLike;
    requestPayload: Record<string, unknown>;
  }): Promise<VerifyAndFinalizeResult>;
}

// Registry -------------------------------------------------------------
export function getPaymentProvider(provider: PaymentProviderKind): PaymentProvider {
  switch (provider) {
    case "card":
      return getCardProvider();
    case "bank":
      return getBankProvider();
    case "bale":
      return getBaleProvider();
    default: {
      const exhaustive: never = provider;
      void exhaustive;
      throw new Error(`پروایدر پرداخت پشتیبانی نمی‌شود: ${provider}`);
    }
  }
}

export type { CardProvider, BankProvider, BaleProvider };
