import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// `vite` is not a direct dependency, so pnpm's strict node_modules does not
// expose it at the project root. Resolve it through vitest's own closure.
const require = createRequire(import.meta.url);
const VITE_NODE = require
  .resolve("vitest/package.json")
  .replace(/node_modules[\\/]+vitest[\\/]+package\.json$/, "node_modules/vite/dist/node/index.js");
const { transformWithEsbuild, loadEnv } = require(VITE_NODE);

// Vitest (unlike Next.js) does not read .env.local, so integration tests would
// otherwise fall back to the placeholder DATABASE_URL below and fail against a
// nonexistent host. Load the project's .env files with an empty prefix so every
// variable (not just VITE_*) lands in process.env, then keep placeholders as a
// last resort for CI, where env vars come from the platform.
const envFiles = loadEnv("test", process.cwd(), "");
for (const [k, v] of Object.entries(envFiles)) {
  if (!process.env[k]) process.env[k] = v;
}

const REQUIRED = {
  DATABASE_URL: "postgres://u:p@host/db",
  APP_URL: "http://localhost:3000",
  APP_SECRET: "a".repeat(32),
  IP_HASH_SALT: "a".repeat(16),
  CRON_SECRET: "a".repeat(16),
};

// Inject placeholders only for vars the environment doesn't already provide
// (e.g. the real DATABASE_URL from .env.local via the runner).
for (const [k, v] of Object.entries(REQUIRED)) {
  if (!process.env[k]) process.env[k] = v;
}

// React-email templates are .tsx, and vitest's node environment has no JSX
// transform of its own, so JSX has to be lowered before rolldown parses it.
const jsx = {
  name: "tsx-jsx",
  enforce: "pre",
  async transform(code, id) {
    if (!/\.[jt]sx$/.test(id)) return null;
    return transformWithEsbuild(code, id, { loader: "tsx", jsx: "automatic", jsxImportSource: "react" });
  },
};

export default defineConfig({
  plugins: [jsx],
  test: {
    include: ["tests/**/*.test.ts"],
    // Fail fast with an actionable message when the integration DB env is
    // missing, instead of a confusing "nonexistent host" from the driver.
    setupFiles: ["./tests/integration/setup.ts"],
    // The suite's first tests in each fork pay for the cold module graph
    // (Next.js runtime, drizzle, better-auth), which alone can exceed the 5s
    // default on slower machines. Integration tests also hit a remote Neon DB.
    testTimeout: 30000,
    // Integration tests share one Neon DB, so parallel file workers race on
    // the same rows: the queue worker drains the notifications another file
    // just enqueued, and the audit log is append-only. `singleFork` is a no-op
    // in Vitest 5, so serial execution is requested explicitly here.
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
