import { customAlphabet } from "nanoid";

// Crockford-style base32 (no I/L/O/U) so codes are easy to read aloud.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const code16 = customAlphabet(ALPHABET, 16);
const code12 = customAlphabet(ALPHABET, 12);

// Customer-friendly gift card code: CHUI-XXXX-XXXX-XXXX
export function generateGiftCardCode(prefix = "CHUI"): string {
  const raw = code12();
  return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// Opaque NFC serial broadcast by the wallet pass. Treat as a public id.
export function generateNfcSerial(): string {
  return code16();
}
