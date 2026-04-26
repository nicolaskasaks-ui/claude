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
});

export const env = schema.parse(process.env);
export type Env = typeof env;
