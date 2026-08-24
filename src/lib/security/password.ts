import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters");
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
