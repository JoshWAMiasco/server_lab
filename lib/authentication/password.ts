import { hash, verify, type Algorithm } from "@node-rs/argon2";

/* `Algorithm` is a const enum, which isolatedModules cannot read; 2 is Argon2id. */
const ARGON2_IDENTIFIER_ALGORITHM = 2 as Algorithm;

const ARGON2_OPTIONS = { algorithm: ARGON2_IDENTIFIER_ALGORITHM, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;

export const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Hashes a password with argon2id (64 MiB, t=3, p=1).
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Checks a password against a stored argon2 hash; never throws on a malformed hash.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
