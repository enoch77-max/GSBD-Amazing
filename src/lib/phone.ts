/**
 * Shared Bangladeshi mobile-number helpers — imported by the storefront,
 * the owner console and the backend, so the rule can never drift.
 */

/** 01XXXXXXXXX where the third digit is 3-9 (all current operator prefixes). */
export const BD_PHONE_RE = /^01[3-9]\d{8}$/;

export function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[\s\-()]/g, "");
}

export function isValidBDPhone(value: unknown): boolean {
  return BD_PHONE_RE.test(normalizePhone(value));
}

/** 8801XXXXXXXXX form used by couriers and SMS gateways. */
export function toMsisdn(value: unknown): string {
  const digits = normalizePhone(value);
  if (digits.startsWith("8801")) return digits;
  if (digits.startsWith("01")) return `88${digits}`;
  return digits;
}
