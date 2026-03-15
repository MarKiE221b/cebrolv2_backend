import bcrypt from "bcryptjs";

const DEFAULT_ROUNDS = 12;

export async function hashPassword(plainTextPassword) {
  const password = String(plainTextPassword ?? "");
  if (!password) throw new Error("Password is required");
  return bcrypt.hash(password, DEFAULT_ROUNDS);
}

export async function verifyPassword(plainTextPassword, passwordHash) {
  if (!plainTextPassword || !passwordHash) return false;
  return bcrypt.compare(String(plainTextPassword), String(passwordHash));
}
