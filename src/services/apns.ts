import { connect, type ClientHttp2Session } from "node:http2";
import { readFile } from "node:fs/promises";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

// Apple PassKit push notifications.
//
// PassKit uses a slightly different APNs flow than regular app notifications:
//   * Authentication is done with the *Pass Type ID certificate* as a TLS
//     client certificate (not provider tokens).
//   * The push payload is empty: `{}`. Receiving the push triggers iOS to
//     poll our PassKit web service (`/v1/wallet/apple/v1/passes/...`) for the
//     latest pass. So we never embed campaign content in the payload — the
//     content is whatever fields the pass exposes when iOS fetches it.
//   * The `apns-topic` header MUST be the pass type identifier.
//
// Apple recommends keeping the HTTP/2 session warm and reusing it for batches.

const APNS_HOST_PROD = "api.push.apple.com";
const APNS_HOST_DEV = "api.development.push.apple.com";

let sessionPromise: Promise<ClientHttp2Session> | null = null;

async function getSession(): Promise<ClientHttp2Session> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    if (
      !env.APPLE_PASS_CERT_PATH ||
      !env.APPLE_PASS_KEY_PATH ||
      !env.APPLE_PASS_TYPE_IDENTIFIER
    ) {
      throw new Error("APNs not configured: missing Apple Pass cert/key/type id");
    }
    const [cert, key] = await Promise.all([
      readFile(env.APPLE_PASS_CERT_PATH),
      readFile(env.APPLE_PASS_KEY_PATH),
    ]);
    const host = env.NODE_ENV === "production" ? APNS_HOST_PROD : APNS_HOST_DEV;
    const session = connect(`https://${host}:443`, {
      cert,
      key,
      passphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined,
    });
    session.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[apns] session error", err);
      sessionPromise = null;
    });
    session.on("close", () => {
      sessionPromise = null;
    });
    return session;
  })();
  return sessionPromise;
}

async function sendOnce(deviceToken: string): Promise<{ ok: boolean; status: number; reason?: string }> {
  const session = await getSession();
  return new Promise((resolve, reject) => {
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": env.APPLE_PASS_TYPE_IDENTIFIER!,
      "apns-push-type": "background",
      "apns-priority": "5",
      "content-type": "application/json",
    });
    req.setEncoding("utf8");
    let body = "";
    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (status >= 200 && status < 300) {
        resolve({ ok: true, status });
      } else {
        let reason: string | undefined;
        try {
          reason = JSON.parse(body).reason;
        } catch {
          reason = body || undefined;
        }
        resolve({ ok: false, status, reason });
      }
    });
    req.on("error", (err) => reject(err));
    req.end(JSON.stringify({}));
  });
}

// Notify every Apple device registered against a card. iOS will then call our
// PassKit web service to fetch the updated pass — that is where the new tier
// name, points balance or campaign message becomes visible to the user.
export async function pushApplePassUpdate(cardId: string): Promise<void> {
  const devices = await prisma.walletDevice.findMany({
    where: { cardId, platform: "APPLE", pushToken: { not: null } },
  });
  for (const d of devices) {
    if (!d.pushToken) continue;
    try {
      const r = await sendOnce(d.pushToken);
      if (!r.ok) {
        // 410 = device is no longer registered for this topic. Clean up.
        if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") {
          await prisma.walletDevice.delete({ where: { id: d.id } });
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[apns] push failed device=${d.id} status=${r.status} reason=${r.reason}`);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[apns] error device=${d.id}`, err);
    }
  }
}
