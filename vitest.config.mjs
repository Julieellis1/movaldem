import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REQUIRED = {
  DATABASE_URL: "postgres://u:p@host/db",
  APP_URL: "http://localhost:3000",
  APP_SECRET: "a".repeat(32),
  IP_HASH_SALT: "a".repeat(16),
  CRON_SECRET: "a".repeat(16),
};

Object.assign(process.env, REQUIRED);

// React-email templates are .tsx, and vitest's node environment has no JSX
// transform of its own, so JSX has to be lowered before rolldown parses it.
// `vite` is only reachable inside vitest's own pnpm virtual store.
const require = createRequire(import.meta.url);
const { transformWithEsbuild } = require(
  require.resolve("vitest/package.json").replace(/node_modules[\\/]+vitest[\\/]+package\.json$/, "node_modules/vite/dist/node/index.js"),
);

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
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
