import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_KEY: z.string().optional(),
  STORAGE_SECRET: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  IP_HASH_SALT: z.string().min(16),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof schema>;

// Next.js loads `.env.local` for us, but the non-Next entry points
// (`pnpm db:seed`, `pnpm db:create-superadmin`, vitest) run under plain Node and
// would otherwise fail validation on a developer's machine. Existing process
// env always wins, so CI (which supplies variables directly) is unaffected.
function loadDotEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    // No .env.local (CI, or a deploy with real env vars) — validate as-is.
  }
}

export function loadEnv(): Env {
  loadDotEnvLocal();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${keys}`);
  }
  return parsed.data;
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
