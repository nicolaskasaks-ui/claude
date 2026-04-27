import { createHmac, timingSafeEqual } from "node:crypto";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import type { GiftCardPurchase } from "@prisma/client";
import { env } from "../lib/env.js";
import { BadRequest } from "../lib/errors.js";

// Mercado Pago integration for the public gift card purchase flow.
//
// The flow uses MP "Preferences" (Checkout Pro): we POST a preference
// describing the line item, redirect the buyer to MP's hosted checkout via
// the returned init_point URL, and listen for the asynchronous "payment"
// notification on our webhook.
//
// Webhook security: MP signs every notification with HMAC-SHA256 over a
// canonical string built from the data id + request id + timestamp. We
// verify the signature on every callback so attackers can't fabricate a
// "PAID" status. The shared secret is configured per-app in MP's dashboard
// at Notifications -> Webhooks -> "Clave secreta".

let _client: MercadoPagoConfig | null = null;

function client(): MercadoPagoConfig {
  if (_client) return _client;
  if (!env.MP_ACCESS_TOKEN) {
    throw new Error("MP_ACCESS_TOKEN is not set; cannot use Mercado Pago");
  }
  _client = new MercadoPagoConfig({
    accessToken: env.MP_ACCESS_TOKEN,
    options: { timeout: 10_000 },
  });
  return _client;
}

export function isMercadoPagoConfigured(): boolean {
  return !!env.MP_ACCESS_TOKEN;
}

// Create a Preference for a gift card purchase. The init_point URL is
// what we redirect the buyer to.
export async function createGiftCardPreference(args: {
  purchase: GiftCardPurchase;
  currency: string;
  tenantName: string;
  baseUrl: string;
}): Promise<{ preferenceId: string; initPoint: string; sandboxInitPoint: string | null }> {
  const pref = new Preference(client());
  const amount = args.purchase.amountCents / 100;

  const result = await pref.create({
    body: {
      items: [
        {
          // Items spec requires id+quantity+unit_price. Title shows in the
          // MP checkout header; description appears under it.
          id: `gift-${args.purchase.id}`,
          title: `Tarjeta de regalo · ${args.tenantName}`,
          description: args.purchase.message
            ? `Para ${args.purchase.recipientName}: ${args.purchase.message}`.slice(0, 240)
            : `Para ${args.purchase.recipientName}`,
          quantity: 1,
          unit_price: amount,
          currency_id: args.currency, // "ARS"
          category_id: "services",
        },
      ],
      payer: {
        name: args.purchase.senderName,
        email: args.purchase.senderEmail,
      },
      // External reference lets us correlate the payment back to the
      // GiftCardPurchase even if MP webhook arrives out of order or we
      // drop the preference id mapping.
      external_reference: args.purchase.id,
      // Where MP redirects the user after they finish the flow. We send
      // them to the same /regalo page with a status query param so the UI
      // can show "Gracias, te avisamos cuando confirme el pago".
      back_urls: {
        success: `${args.baseUrl}/app/regalo.html?status=success&purchase=${args.purchase.id}`,
        pending: `${args.baseUrl}/app/regalo.html?status=pending&purchase=${args.purchase.id}`,
        failure: `${args.baseUrl}/app/regalo.html?status=failure&purchase=${args.purchase.id}`,
      },
      // Where MP sends the asynchronous "payment created/updated" pings.
      notification_url: `${args.baseUrl}/v1/public/mp/webhook`,
      // Tag the payment as a service (no shipping required, no tangible good).
      statement_descriptor: args.tenantName.toUpperCase().slice(0, 11),
      auto_return: "approved",
    },
  });

  if (!result.id || !result.init_point) {
    throw new Error("Mercado Pago did not return an init_point for the preference");
  }

  return {
    preferenceId: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point ?? null,
  };
}

// Fetch a payment by id to confirm its status. Used by the webhook handler
// to validate that the notified payment is actually approved before we
// issue the gift card.
export async function fetchPayment(paymentId: string): Promise<{
  id: number;
  status: string;
  externalReference: string | null;
  amountCents: number;
  payerEmail: string | null;
}> {
  const pay = new Payment(client());
  const result = await pay.get({ id: paymentId });
  return {
    id: result.id ?? 0,
    status: result.status ?? "unknown",
    externalReference: result.external_reference ?? null,
    amountCents: Math.round((result.transaction_amount ?? 0) * 100),
    payerEmail: result.payer?.email ?? null,
  };
}

// Verify the x-signature header MP attaches to every webhook callback.
//
// MP docs: https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks#editor_2
// Format of x-signature: `ts=<unix-ts>,v1=<sha256-hex>`
// Signed manifest: `id:<DATA_ID>;request-id:<X-REQUEST-ID>;ts:<TS>;`
// The HMAC key is the per-application "Clave secreta" from MP dashboard.
//
// We tolerate up to 5 minutes of clock skew between MP and our server.
const MAX_SKEW_SECONDS = 300;

export function verifyWebhookSignature(args: {
  signatureHeader: string | undefined;
  requestIdHeader: string | undefined;
  // Comes from the query string `?data.id=<id>` MP sends with each callback.
  dataId: string | undefined;
}): { ok: true } | { ok: false; reason: string } {
  if (!env.MP_WEBHOOK_SECRET) {
    return { ok: false, reason: "MP_WEBHOOK_SECRET not set" };
  }
  if (!args.signatureHeader) return { ok: false, reason: "missing x-signature" };
  if (!args.requestIdHeader) return { ok: false, reason: "missing x-request-id" };
  if (!args.dataId) return { ok: false, reason: "missing data.id query param" };

  // Parse `ts=...,v1=...` (commas may have spaces around them).
  const parts = args.signatureHeader.split(",").map((p) => p.trim());
  const tsPart = parts.find((p) => p.startsWith("ts="));
  const v1Part = parts.find((p) => p.startsWith("v1="));
  if (!tsPart || !v1Part) return { ok: false, reason: "malformed x-signature" };

  const ts = tsPart.slice("ts=".length);
  const v1 = v1Part.slice("v1=".length);

  // Reject signatures older than MAX_SKEW_SECONDS — replay protection.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "invalid ts" };
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - tsNum) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "signature outside acceptable window" };
  }

  const manifest = `id:${args.dataId};request-id:${args.requestIdHeader};ts:${ts};`;
  const expected = createHmac("sha256", env.MP_WEBHOOK_SECRET).update(manifest).digest("hex");

  // timingSafeEqual requires equal-length buffers. Different length signatures
  // are immediately rejected without comparing content.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return { ok: false, reason: "length mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export function requirePaidStatus(status: string): void {
  if (status !== "approved") {
    throw BadRequest(`Payment not approved (status=${status})`);
  }
}
