/**
 * Hashes an admin password for ADMIN_PASSWORD_HASH.
 * Usage: npm run admin:hash -- "your-strong-password"
 */
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run admin:hash -- "your-strong-password"');
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use at least 12 characters — this account can issue refunds.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
console.log(`\nADMIN_PASSWORD_HASH="${salt}:${hash}"\n`);
