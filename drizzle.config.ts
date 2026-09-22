import { defineConfig } from "drizzle-kit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "./src/lib/env";

// drizzle-kit (unlike Next.js) does not read .env.local, so the env loader
// would throw before the config is even built. Populate process.env from it
// first; real process vars still win.
for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (!m || line.trim().startsWith("#")) continue;
  const value = m[2].replace(/^['"]|['"]$/g, "");
  if (!process.env[m[1]]) process.env[m[1]] = value;
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: env().DATABASE_URL },
  strict: true,
  verbose: true,
});
