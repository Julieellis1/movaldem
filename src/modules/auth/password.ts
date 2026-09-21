import { hash, verify } from "@node-rs/argon2";
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, { algorithm: 2 /* argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain);
}
