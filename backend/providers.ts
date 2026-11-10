/**
 * Outbound provider integrations: Meta Conversions API, SMS gateways, bKash,
 * SSLCommerz and couriers. Credentials always come from store settings (which
 * only the owner console can change) — never from request payloads.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { StoreSettings } from "./settings";
import { config } from "./config";

const sha256 = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 12_000) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, body: (parsed ?? {}) as Record<string, unknown>, text };
}

/* ------------------------------------------------------------------ */
/* Meta Conversions API                                                */
/* ------------------------------------------------------------------ */

export async function sendCapiEvent(
  settings: StoreSettings,
  event: {
    event_name: string;
    event_id: string;
    event_time: number;
    event_source_url: string;
    custom_data?: Record<string, unknown>;
    email?: string;
    phone?: string;
    fbc?: string;
    fbp?: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<{ ok: boolean; detail?: string }> {
  const { metaPixelId, metaAccessToken, metaTestEventCode } = settings.marketing;
  if (!metaPixelId || !metaAccessToken) return { ok: false, detail: "Meta Conversions API is not configured." };

  const userData: Record<string, unknown> = {
    client_ip_address: event.ip,
    client_user_agent: event.userAgent,
  };
  if (event.email) userData.em = [sha256(event.email)];
  if (event.phone) userData.ph = [sha256(event.phone.replace(/^\+?880/, "0"))];
  if (event.fbc) userData.fbc = event.fbc;
  if (event.fbp) userData.fbp = event.fbp;
  userData.country = [sha256("bd")];

  try {
    const result = await postJson(
      `https://graph.facebook.com/v21.0/${metaPixelId}/events?access_token=${encodeURIComponent(metaAccessToken)}`,
      {
        data: [
          {
            event_name: event.event_name,
            event_time: event.event_time,
            event_id: event.event_id,
            event_source_url: event.event_source_url,
            action_source: "website",
            user_data: userData,
            custom_data: { currency: "BDT", ...event.custom_data },
          },
        ],
        ...(metaTestEventCode ? { test_event_code: metaTestEventCode } : {}),
      },
    );
    if (!result.ok) {
      const message = (result.body.error as { message?: string } | undefined)?.message;
      return { ok: false, detail: message ?? `Meta rejected the event (HTTP ${result.status}).` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Network error." };
  }
}

/* ------------------------------------------------------------------ */
/* SMS                                                                 */
/* ------------------------------------------------------------------ */

export async function sendSms(
  settings: StoreSettings,
  to: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { smsProvider, smsApiKey, smsSenderId } = settings.notifications;
  if (smsProvider === "none" || !smsApiKey) return { ok: false, error: "No SMS provider configured." };
  const msisdn = to.startsWith("0") ? `88${to}` : to;

  try {
    if (smsProvider === "bulksmsbd") {
      const url = new URL("http://bulksmsbd.net/api/smsapi");
      url.searchParams.set("api_key", smsApiKey);
      url.searchParams.set("type", "text");
      url.searchParams.set("number", msisdn);
      url.searchParams.set("senderid", smsSenderId || "GLOWINGSPACE");
      url.searchParams.set("message", message);
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      const body = (await response.json()) as { response_code?: number; smsid?: string; error_message?: string };
      return body.response_code === 202
        ? { ok: true, id: body.smsid }
        : { ok: false, error: body.error_message ?? "SMS gateway rejected the message." };
    }
    const url = new URL("https://api.greenweb.com.bd/api.php");
    url.searchParams.set("token", smsApiKey);
    url.searchParams.set("to", msisdn);
    url.searchParams.set("message", message);
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const text = await response.text();
    return response.ok ? { ok: true, id: text.slice(0, 40) } : { ok: false, error: text.slice(0, 140) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

/* ------------------------------------------------------------------ */
/* bKash Tokenized Checkout                                            */
/* ------------------------------------------------------------------ */

const BKASH_BASE = {
  sandbox: "https://tokenized.sandbox.bka.sh/v1.2.0-beta",
  live: "https://tokenized.pay.bka.sh/v1.2.0-beta",
} as const;

let bkashToken: { value: string; expiresAt: number } | null = null;

async function bkashGrantToken(settings: StoreSettings): Promise<string> {
  if (bkashToken && Date.now() < bkashToken.expiresAt) return bkashToken.value;
  const gateway = settings.payments.bkash;
  const base = BKASH_BASE[gateway.mode];
  const result = await postJson(
    `${base}/tokenized/checkout/token/grant`,
    { app_key: gateway.publicKey, app_secret: gateway.secretKey },
    { accept: "application/json", username: gateway.username, password: gateway.password },
  );
  const token = result.body.id_token as string | undefined;
  if (!result.ok || !token) {
    throw new Error((result.body.statusMessage as string) ?? "bKash token grant failed.");
  }
  const ttl = Number(result.body.expires_in ?? 3000);
  bkashToken = { value: token, expiresAt: Date.now() + Math.max(60, ttl - 60) * 1000 };
  return token;
}

function bkashHeaders(settings: StoreSettings, token: string): Record<string, string> {
  return { accept: "application/json", authorization: token, "x-app-key": settings.payments.bkash.publicKey };
}

export async function bkashCreatePayment(settings: StoreSettings, input: { amount: number; reference: string; orderNumber: string }) {
  const base = BKASH_BASE[settings.payments.bkash.mode];
  const token = await bkashGrantToken(settings);
  const result = await postJson(
    `${base}/tokenized/checkout/create`,
    {
      mode: "0011",
      payerReference: input.orderNumber,
      callbackURL: `${config.siteUrl}/api/webhooks/payments?provider=bkash`,
      amount: String(input.amount),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: input.reference,
    },
    bkashHeaders(settings, token),
  );
  const redirectUrl = result.body.bkashURL as string | undefined;
  if (!result.ok || !redirectUrl) {
    throw new Error((result.body.statusMessage as string) ?? "bKash could not start the payment.");
  }
  return { redirectUrl, paymentId: (result.body.paymentID as string | undefined) ?? input.reference };
}

export async function bkashExecutePayment(settings: StoreSettings, paymentId: string) {
  const base = BKASH_BASE[settings.payments.bkash.mode];
  const token = await bkashGrantToken(settings);
  const result = await postJson(`${base}/tokenized/checkout/execute`, { paymentID: paymentId }, bkashHeaders(settings, token));
  return {
    ok: result.body.statusCode === "0000",
    trxId: result.body.trxID as string | undefined,
    amount: Number(result.body.amount ?? 0),
    message: (result.body.statusMessage as string) ?? "",
    raw: result.body,
  };
}

export async function bkashQueryPayment(settings: StoreSettings, paymentId: string) {
  const base = BKASH_BASE[settings.payments.bkash.mode];
  const token = await bkashGrantToken(settings);
  const result = await postJson(
    `${base}/tokenized/checkout/payment/status`,
    { paymentID: paymentId },
    bkashHeaders(settings, token),
  );
  return {
    ok: result.body.transactionStatus === "Completed",
    trxId: result.body.trxID as string | undefined,
    amount: Number(result.body.amount ?? 0),
    raw: result.body,
  };
}

export async function bkashRefund(
  settings: StoreSettings,
  input: { paymentId: string; trxId: string; amount: number; reason: string },
) {
  const base = BKASH_BASE[settings.payments.bkash.mode];
  const token = await bkashGrantToken(settings);
  const result = await postJson(
    `${base}/tokenized/checkout/payment/refund`,
    { paymentID: input.paymentId, trxID: input.trxId, amount: String(input.amount), sku: "refund", reason: input.reason.slice(0, 120) },
    bkashHeaders(settings, token),
  );
  return {
    ok: result.body.statusCode === "0000",
    message: (result.body.statusMessage as string) ?? "",
    raw: result.body,
  };
}

/* ------------------------------------------------------------------ */
/* SSLCommerz                                                          */
/* ------------------------------------------------------------------ */

const SSLC_BASE = { sandbox: "https://sandbox.sslcommerz.com", live: "https://securepay.sslcommerz.com" } as const;

export async function sslInitTransaction(
  settings: StoreSettings,
  input: {
    amount: number; reference: string; orderNumber: string; customerName: string;
    phone: string; email?: string | null; address: string; district: string;
  },
) {
  const gateway = settings.payments.sslcommerz;
  const base = SSLC_BASE[gateway.mode];
  const form = new URLSearchParams({
    store_id: gateway.publicKey,
    store_passwd: gateway.secretKey,
    total_amount: String(input.amount),
    currency: "BDT",
    tran_id: input.reference,
    success_url: `${config.siteUrl}/api/webhooks/payments?provider=sslcommerz&result=success`,
    fail_url: `${config.siteUrl}/api/webhooks/payments?provider=sslcommerz&result=fail`,
    cancel_url: `${config.siteUrl}/api/webhooks/payments?provider=sslcommerz&result=cancel`,
    ipn_url: `${config.siteUrl}/api/webhooks/payments?provider=sslcommerz&result=ipn`,
    product_name: `Order ${input.orderNumber}`,
    product_category: "electronics",
    product_profile: "general",
    cus_name: input.customerName,
    cus_email: input.email || "noemail@glowingspacebd.com",
    cus_add1: input.address,
    cus_city: input.district,
    cus_country: "Bangladesh",
    cus_phone: input.phone,
    shipping_method: "Courier",
    ship_name: input.customerName,
    ship_add1: input.address,
    ship_city: input.district,
    ship_country: "Bangladesh",
    num_of_item: "1",
  });
  const response = await fetch(`${base}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as { status?: string; GatewayPageURL?: string; failedreason?: string };
  if (body.status !== "SUCCESS" || !body.GatewayPageURL) {
    throw new Error(body.failedreason ?? "SSLCommerz session could not be created.");
  }
  return { redirectUrl: body.GatewayPageURL };
}

/** Rebuilds the IPN hash from the posted fields — forgeries fail loudly. */
export function sslVerifySignature(payload: Record<string, string>, storePassword: string): boolean {
  const signature = payload.verify_sign;
  const keyList = payload.verify_key;
  if (!signature || !keyList) return false;
  const fields = keyList.split(",").map((key) => `${key}=${payload[key] ?? ""}`);
  fields.push(`store_passwd=${createHash("md5").update(storePassword).digest("hex")}`);
  return createHash("md5").update(fields.join("&")).digest("hex") === signature;
}

/* ------------------------------------------------------------------ */
/* Couriers                                                            */
/* ------------------------------------------------------------------ */

export async function createConsignment(
  settings: StoreSettings,
  input: { orderNumber: string; name: string; phone: string; address: string; district: string; codAmount: number; weightKg: number },
): Promise<{ ok: boolean; consignmentId?: string; trackingUrl?: string; error?: string }> {
  const { provider, apiKey, apiSecret } = settings.courier;
  if (provider === "manual" || !apiKey) return { ok: false, error: "Courier API is not configured." };

  try {
    if (provider === "pathao") {
      const tokenResult = await postJson("https://api-hermes.pathao.com/aladdin/api/v1/issue-token", {
        client_id: apiKey,
        client_secret: apiSecret,
        username: apiKey,
        password: apiSecret,
        grant_type: "password",
      });
      const token = (tokenResult.body.access_token ?? tokenResult.body.accessToken) as string | undefined;
      if (!tokenResult.ok || !token) return { ok: false, error: "Pathao rejected the API credentials." };
      const result = await postJson(
        "https://api-hermes.pathao.com/aladdin/api/v1/orders",
        {
          merchant_order_id: input.orderNumber,
          recipient_name: input.name,
          recipient_phone: input.phone,
          recipient_address: input.address,
          recipient_city: input.district,
          delivery_type: 48,
          item_type: 2,
          item_quantity: 1,
          item_weight: input.weightKg,
          amount_to_collect: input.codAmount,
        },
        { authorization: `Bearer ${token}` },
      );
      const id = (result.body.data as { consignment_id?: string } | undefined)?.consignment_id;
      return id
        ? { ok: true, consignmentId: id, trackingUrl: `https://merchant.pathao.com/tracking?consignment_id=${id}` }
        : { ok: false, error: (result.body.message as string) ?? "Pathao refused the booking." };
    }

    const result = await postJson(
      "https://portal.packzy.com/api/v1/create_order",
      {
        invoice: input.orderNumber,
        recipient_name: input.name,
        recipient_phone: input.phone,
        recipient_address: `${input.address}, ${input.district}`,
        cod_amount: input.codAmount,
      },
      { "api-key": apiKey, "api-secret": apiSecret },
    );
    const id = (result.body.consignment as { consignment_id?: number | string } | undefined)?.consignment_id
      ?? (result.body.data as { consignment_id?: number | string } | undefined)?.consignment_id;
    return id
      ? { ok: true, consignmentId: String(id), trackingUrl: `https://portal.packzy.com/track/${id}` }
      : { ok: false, error: (result.body.message as string) ?? "Steadfast refused the booking." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

/** Constant-time HMAC check for providers that sign their callbacks. */
export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
