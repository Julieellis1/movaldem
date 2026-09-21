import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const REQUIRED = {
  DATABASE_URL: "postgres://u:p@host/db",
  APP_URL: "http://localhost:3000",
  APP_SECRET: "a".repeat(32),
  IP_HASH_SALT: "a".repeat(16),
  CRON_SECRET: "a".repeat(16),
};

Object.assign(process.env, REQUIRED);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
