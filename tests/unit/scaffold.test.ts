// tests/unit/scaffold.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, "..", "..");

const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf-8"));
const gitignore = readFileSync(join(REPO, ".gitignore"), "utf-8");
const envExample = readFileSync(join(REPO, ".env.example"), "utf-8");
const pageTsx = readFileSync(join(REPO, "src", "app", "page.tsx"), "utf-8");
const layoutTsx = readFileSync(join(REPO, "src", "app", "layout.tsx"), "utf-8");

describe("scaffold", () => {
  describe("package.json", () => {
    it("pins next to 15.5.25", () => {
      expect(pkg.dependencies.next).toBe("15.5.25");
    });
    it("has better-auth", () => {
      expect(pkg.dependencies["better-auth"]).toBeDefined();
    });
    it("has drizzle-orm", () => {
      expect(pkg.dependencies["drizzle-orm"]).toBeDefined();
    });
    it("has zod", () => {
      expect(pkg.dependencies.zod).toBeDefined();
    });
  });

  describe("src/app/page.tsx", () => {
    it("sends staff to /admin and renders the homepage for everyone else (C14)", () => {
      expect(pageTsx).toContain("getHomeAudience");
      expect(pageTsx).toContain('redirect("/admin")');
      expect(pageTsx).not.toMatch(/return redirect\("\/login"\)/);
    });
  });

  describe("src/app/layout.tsx", () => {
    it("exists and exports a layout", () => {
      expect(layoutTsx).toContain("function RootLayout");
    });
  });

  describe(".gitignore", () => {
    const entries = ["node_modules", ".next", ".env.local", ".env.*.local", "storage/", "*.log", ".vercel", "playwright-report", "test-results"];
    for (const entry of entries) {
      it(`covers ${entry}`, () => {
        expect(gitignore).toContain(entry);
      });
    }
  });

  describe(".env.example", () => {
    const vars = [
      "DATABASE_URL", "APP_URL", "APP_SECRET", "PAYSTACK_SECRET_KEY",
      "PAYSTACK_PUBLIC_KEY", "STORAGE_DRIVER", "STORAGE_BUCKET",
      "STORAGE_ENDPOINT", "STORAGE_KEY", "STORAGE_SECRET", "CDN_BASE_URL",
      "SMTP_URL", "MAIL_FROM", "IP_HASH_SALT", "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN", "CRON_SECRET",
    ];
    for (const v of vars) {
      it(`lists ${v}`, () => {
        expect(envExample).toContain(`${v}=`);
      });
    }
  });

  describe("@/ alias", () => {
    // Importing @/app/page pulls in the Next.js runtime on a cold module
    // graph, which can take longer than the default timeout on slower
    // machines. It is a smoke test for the alias, not a perf assertion.
    it("resolves and imports @/app/page", async () => {
      const { default: Page } = await import("@/app/page");
      expect(Page).toBeDefined();
    }, 60000);
  });
});
