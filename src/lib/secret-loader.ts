import { readFile } from "node:fs/promises";

// Helpers to load a credential blob from one of two places, in order:
//   1. base64 env var (preferred in production — Fly.io secrets etc.)
//   2. file on disk (preferred in dev — easier to swap PEMs without
//      re-encoding).
//
// Returns null if neither is set, so callers can degrade to "wallet not
// configured" without throwing for unrelated requests.

export async function loadSecretBuffer(args: {
  b64?: string;
  path?: string;
  label: string;
}): Promise<Buffer | null> {
  if (args.b64 && args.b64.length > 0) {
    try {
      return Buffer.from(args.b64, "base64");
    } catch {
      throw new Error(`${args.label}: invalid base64`);
    }
  }
  if (args.path && args.path.length > 0) {
    return readFile(args.path);
  }
  return null;
}

export async function loadSecretString(args: {
  b64?: string;
  path?: string;
  label: string;
}): Promise<string | null> {
  const buf = await loadSecretBuffer(args);
  return buf ? buf.toString("utf8") : null;
}
