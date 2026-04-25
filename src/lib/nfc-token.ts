import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

// What goes inside the wallet pass and is broadcast over NFC by Apple VAS /
// Google Smart Tap at the merchant terminal. It is signed so a terminal cannot
// be tricked into trusting a forged tap, and it carries an expiry so a snooped
// payload becomes useless quickly.
//
// `kind` distinguishes loyalty cards from gift cards because the same terminal
// endpoint dispatches both.

export type NfcTokenPayload = {
  kind: "loyalty" | "gift";
  tenantId: string;
  serial: string; // matches LoyaltyCard.nfcSerial or GiftCard.nfcSerial
};

const secret = new TextEncoder().encode(env.NFC_TOKEN_SECRET);
const ISSUER = "chui-loyalty";

export async function signNfcToken(
  payload: NfcTokenPayload,
  ttlSeconds = 60 * 60 * 24 * 365, // long-lived; the pass itself is the credential
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function verifyNfcToken(token: string): Promise<NfcTokenPayload> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
  if (
    typeof payload.kind !== "string" ||
    typeof payload.tenantId !== "string" ||
    typeof payload.serial !== "string"
  ) {
    throw new Error("Malformed NFC token");
  }
  if (payload.kind !== "loyalty" && payload.kind !== "gift") {
    throw new Error("Unknown NFC token kind");
  }
  return {
    kind: payload.kind,
    tenantId: payload.tenantId,
    serial: payload.serial,
  };
}
