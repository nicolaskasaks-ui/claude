import { Resend } from "resend";
import { env } from "../lib/env.js";

// Transactional email via Resend. Used for the public gift card flow:
// when a payment confirms we email the recipient a link to add the
// wallet pass, and email the buyer a receipt.
//
// Domain verification: `chui.com.ar` must be verified in Resend's
// dashboard before the configured FROM_EMAIL works in production.
// In dev (no API key), every send is a no-op that just logs the call.

let _resend: Resend | null = null;

function client(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (_resend) return _resend;
  _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

export function isEmailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  // Optional plaintext fallback for clients that prefer it.
  text?: string;
  // Reply-To override (defaults to the from address).
  replyTo?: string;
};

async function send(args: SendArgs): Promise<{ id: string | null; sent: boolean }> {
  const c = client();
  if (!c) {
    // eslint-disable-next-line no-console
    console.log(`[email] dev no-op: ${args.subject} -> ${args.to}`);
    return { id: null, sent: false };
  }
  const res = await c.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: args.replyTo,
  });
  if ("error" in res && res.error) {
    throw new Error(`Resend send failed: ${res.error.message}`);
  }
  return { id: (res.data?.id as string) ?? null, sent: true };
}

// Email sent to the gift card recipient. Contains a deep link to add the
// wallet pass to Apple/Google Wallet.
export async function sendGiftCardEmail(args: {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string | null | undefined;
  amountFormatted: string;
  appleWalletUrl: string;
  googleWalletUrl: string;
  tenantName: string;
}): Promise<{ id: string | null; sent: boolean }> {
  const subject = `${args.senderName} te regaló ${args.tenantName}`;
  const messageBlock = args.message
    ? `<p style="font-style:italic;color:#444;border-left:3px solid #c4622a;padding-left:14px;margin:24px 0;">${escapeHtml(args.message)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f7f6f1;color:#10281a;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(16,40,26,0.08);">
      <p style="text-transform:uppercase;letter-spacing:0.18em;font-size:12px;color:#10281a;margin:0;">Tarjeta de regalo</p>
      <h1 style="font-weight:700;font-size:28px;line-height:1.2;margin:14px 0 24px 0;">${escapeHtml(args.senderName)} te regaló ${escapeHtml(args.tenantName)}.</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hola ${escapeHtml(args.recipientName)},</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;">Tenés una tarjeta de regalo por <strong>${escapeHtml(args.amountFormatted)}</strong> para usar cuando vengas a comer.</p>
      ${messageBlock}
      <p style="font-size:16px;line-height:1.6;margin:0 0 24px 0;">Agregala al wallet de tu celular y mostrala en la mesa cuando vengas. La podés usar en una sola visita o dividir entre varias hasta agotar el saldo.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${args.appleWalletUrl}" style="display:inline-block;background:#10281a;color:#edebe2;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:6px;">Agregar a Apple Wallet</a>
        <a href="${args.googleWalletUrl}" style="display:inline-block;background:#10281a;color:#edebe2;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:6px;">Agregar a Google Wallet</a>
      </div>
      <p style="font-size:13px;color:#666;margin:32px 0 0 0;">Si tenés algún problema, escribinos a hola@chui.com.ar.</p>
    </div>
  </body>
</html>`;

  const text = `${args.senderName} te regaló ${args.tenantName}.

Hola ${args.recipientName},

Tenés una tarjeta de regalo por ${args.amountFormatted} para usar cuando vengas a comer.
${args.message ? `\n"${args.message}"\n` : ""}
Agregala a tu wallet:
  Apple Wallet: ${args.appleWalletUrl}
  Google Wallet: ${args.googleWalletUrl}

Si tenés algún problema, escribinos a hola@chui.com.ar.`;

  return send({
    to: args.recipientEmail,
    subject,
    html,
    text,
  });
}

// Receipt sent to the buyer after payment confirms.
export async function sendGiftCardReceiptEmail(args: {
  buyerName: string;
  buyerEmail: string;
  recipientName: string;
  amountFormatted: string;
  tenantName: string;
}): Promise<{ id: string | null; sent: boolean }> {
  const subject = `Confirmación de tarjeta de regalo · ${args.tenantName}`;
  const html = `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f7f6f1;color:#10281a;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;">
      <p style="text-transform:uppercase;letter-spacing:0.18em;font-size:12px;margin:0;">Tarjeta de regalo enviada</p>
      <h1 style="font-weight:700;font-size:24px;margin:14px 0 16px 0;">Gracias, ${escapeHtml(args.buyerName)}.</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;">Le mandamos a ${escapeHtml(args.recipientName)} una tarjeta de regalo por <strong>${escapeHtml(args.amountFormatted)}</strong>.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;">La pueden agregar al wallet del celular y usarla cuando vengan.</p>
      <p style="font-size:13px;color:#666;margin:32px 0 0 0;">Cualquier consulta, respondé este mail.</p>
    </div>
  </body>
</html>`;
  return send({ to: args.buyerEmail, subject, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
