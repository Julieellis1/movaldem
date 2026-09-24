// Integration-suite setup, registered through `setupFiles` in vitest.config.mjs.
//
// Fail fast with an actionable message when the integration DB env is missing,
// instead of a confusing "nonexistent host" from the driver.
//
// This file deliberately does not mutate the database. Truncating between files
// was implemented and reverted: with `pool: "forks"` + `singleFork` the hook
// body can land between a test's write and its read, which deletes the very
// rows under assertion. The suite is already serial, and CI runs against a
// freshly migrated + seeded TEST_DATABASE_URL with `pnpm test` ahead of
// `pnpm e2e`, so no other workload shares the tables during the run.
const REQUIRED = ["DATABASE_URL", "APP_SECRET", "IP_HASH_SALT", "CRON_SECRET"] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `Integration tests need ${missing.join(", ")}. Copy .env.example to .env.local, or set them in CI.`,
  );
}

export {};
