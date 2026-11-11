/**
 * Payment gateway abstraction.
 *
 * `createIntent` is the single entry point checkout uses. In sandbox it returns
 * a deterministic hosted-checkout simulation so the whole funnel is testable
 * without merchant credentials. In live mode it POSTs to `/api/payments/initiate`,
 * which calls the real bKash Tokenized Checkout / Nagad / SSLCommerz API with
 * server-held secrets and returns the provider's redirect URL.
 *
 * Money is only ever marked paid after `verify` confirms with the provider —
 * a customer-supplied TrxID is treated as a claim, never as proof.
 */
import { ops } from "@/db/ops-store";
import { gatewayReady, type GatewayId, type StoreSettings } from "./settings";
import { isLive } from "./live";

export type PaymentIntent = {
  provider: GatewayId;
  reference: string;
  amount: number;
  mode: "sandbox" | "live";
  status: "requires_action" | "pending" | "cod";
  /** Where to send the customer for a hosted checkout (live mode). */
  redirectUrl?: string;
  /** Manual send-money instructions for person-to-person bKash/Nagad. */
  instructions?: { recipient: string; label: string; steps: string[] };
};

export type VerifyResult = {
  ok: boolean;
  status: "paid" | "pending" | "failed";
  trxId?: string;
  message: string;
};

export const GATEWAY_LABEL: Record<GatewayId, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  sslcommerz: "Card / SSLCommerz",
  cod: "Cash on delivery",
};

export function availableGateways(settings: StoreSettings): GatewayId[] {
  const ids = ["bkash", "nagad", "sslcommerz", "cod"] as GatewayId[];
  if (isLive()) {
    /* In live mode the server precomputes readiness (secrets never reach us). */
    const pub = settings.payments as unknown as Record<GatewayId, { enabled: boolean; ready?: boolean }>;
    return ids.filter((id) => pub[id]?.ready ?? pub[id]?.enabled);
  }
  return ids.filter((id) => gatewayReady(id, settings));
}

export async function createIntent(input: {
  provider: GatewayId;
  amount: number;
  orderNumber: string;
  phone: string;
  customerName: string;
}): Promise<PaymentIntent> {
  const settings = ops.state.settings;
  const config = settings.payments[input.provider];
  const reference = `${input.orderNumber}-${input.provider.toUpperCase()}-${ops.uid().slice(0, 6).toUpperCase()}`;

  if (input.provider === "cod") {
    return { provider: "cod", reference, amount: input.amount, mode: "live", status: "cod" };
  }

  if (!gatewayReady(input.provider, settings)) {
    throw new Error(`${GATEWAY_LABEL[input.provider]} is not available right now. Please choose another payment method.`);
  }

  if (config.mode === "live") {
    const response = await fetch("/api/payments/initiate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, reference }),
    });
    const data = (await response.json()) as { redirectUrl?: string; error?: string };
    if (!response.ok || !data.redirectUrl) {
      throw new Error(data.error ?? "The payment provider did not respond. Please try again.");
    }
    return { provider: input.provider, reference, amount: input.amount, mode: "live", status: "requires_action", redirectUrl: data.redirectUrl };
  }

  /* Sandbox: person-to-person instructions for bKash/Nagad, hosted page for cards. */
  await new Promise((resolve) => setTimeout(resolve, 550));
  const label = GATEWAY_LABEL[input.provider];
  return {
    provider: input.provider,
    reference,
    amount: input.amount,
    mode: "sandbox",
    status: "requires_action",
    redirectUrl: input.provider === "sslcommerz" ? `sandbox://sslcommerz/${reference}` : undefined,
    instructions:
      input.provider === "sslcommerz"
        ? undefined
        : {
            recipient: config.merchantNumber || "01400788738",
            label,
            steps: [
              `Open your ${label} app and choose Send Money.`,
              `Send ৳${input.amount.toLocaleString("en-IN")} to ${config.merchantNumber || "01400788738"}.`,
              `Use reference ${input.orderNumber} and paste the transaction ID below.`,
            ],
          },
  };
}

/**
 * Confirms a payment. Sandbox validates the TrxID shape and marks it paid so the
 * funnel completes; live mode always round-trips to the provider.
 */
export async function verifyPayment(input: {
  provider: GatewayId;
  reference: string;
  orderNumber: string;
  trxId: string;
  amount: number;
}): Promise<VerifyResult> {
  const config = ops.state.settings.payments[input.provider];

  if (input.provider === "cod") {
    return { ok: true, status: "pending", message: "Payable in cash when the parcel arrives." };
  }

  /* Sandbox cards simulate the hosted redirect — approved without a TrxID. */
  if (input.provider === "sslcommerz" && config.mode === "sandbox") {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { ok: true, status: "paid", trxId: `SIM-${Date.now().toString(36).toUpperCase()}`, message: "Payment confirmed." };
  }

  const cleaned = input.trxId.trim().toUpperCase();
  if (!cleaned) {
    return { ok: false, status: "failed", message: "Enter the transaction ID from your payment confirmation SMS." };
  }
  if (!/^[A-Z0-9]{6,20}$/.test(cleaned)) {
    return { ok: false, status: "failed", message: "That does not look like a valid transaction ID (6–20 letters and digits)." };
  }

  if (config.mode === "live") {
    const response = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await response.json()) as VerifyResult;
    return data;
  }

  await new Promise((resolve) => setTimeout(resolve, 700));
  /* Deterministic sandbox rule: IDs ending in 00 simulate a declined payment. */
  if (cleaned.endsWith("00")) {
    return { ok: false, status: "failed", message: "The provider declined this transaction. No money was taken." };
  }
  return { ok: true, status: "paid", trxId: cleaned, message: "Payment confirmed." };
}

export async function refundPayment(input: { orderNumber: string; amount: number; reason: string }): Promise<VerifyResult> {
  const patch = ops.getOrderPatch(input.orderNumber);
  if (!patch.trxId) {
    return { ok: false, status: "failed", message: "No captured payment to refund on this order." };
  }
  const anyLive = (["bkash", "nagad", "sslcommerz"] as GatewayId[]).some(
    (id) => ops.state.settings.payments[id].mode === "live",
  );
  if (anyLive) {
    const response = await fetch("/api/payments/refund", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, trxId: patch.trxId }),
    });
    return (await response.json()) as VerifyResult;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { ok: true, status: "paid", trxId: patch.trxId, message: `Refund of ৳${input.amount.toLocaleString("en-IN")} queued to the original method.` };
}
