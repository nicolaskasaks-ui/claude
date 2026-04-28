import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  RUN_WORKER_INLINE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  NFC_TOKEN_SECRET: z.string().min(16),

  APPLE_PASS_TYPE_IDENTIFIER: z.string().optional(),
  APPLE_TEAM_IDENTIFIER: z.string().optional(),
  // Either set the *_PATH (dev: file on disk) or *_B64 (prod: base64-encoded
  // contents in an env var, preferred for hosted platforms like Fly.io
  // where staging cert files on disk is awkward).
  APPLE_PASS_CERT_PATH: z.string().optional(),
  APPLE_PASS_CERT_B64: z.string().optional(),
  APPLE_PASS_KEY_PATH: z.string().optional(),
  APPLE_PASS_KEY_B64: z.string().optional(),
  APPLE_PASS_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_CERT_PATH: z.string().optional(),
  APPLE_WWDR_CERT_B64: z.string().optional(),

  GOOGLE_WALLET_ISSUER_ID: z.string().optional(),
  GOOGLE_WALLET_SERVICE_ACCOUNT_PATH: z.string().optional(),
  GOOGLE_WALLET_SA_JSON_B64: z.string().optional(),

  // Mercado Pago — used for the public gift card purchase flow at /regalo.
  // The access token authenticates server-side calls (Preference creation,
  // payment fetch). The webhook secret is the "Clave secreta" set on the
  // MP merchant dashboard under Notifications → Webhooks; we use it to
  // verify the x-signature header on every webhook callback so attackers
  // can't fabricate "PAID" notifications.
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),

  // Resend — transactional email used to deliver gift card passes to the
  // recipient and order confirmations to the buyer. Free tier covers up
  // to 3.000 sends/month which is plenty for Chuí volumes; we bump to
  // paid only when we expand to multi-tenant.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Chuí <hola@chui.com.ar>"),

  // Public host for absolute URLs in emails / payment redirects.
  // Falls back to the request's Host header at runtime if not set, but
  // setting it explicitly avoids surprises behind proxies / preview deploys.
  PUBLIC_BASE_URL: z.string().url().default("https://card.chui.com.ar"),

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every
  // scheduled call. We verify it on cron routes so they cannot be hit by
  // anyone but Vercel's scheduler.
  CRON_SECRET: z.string().min(16).optional(),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
