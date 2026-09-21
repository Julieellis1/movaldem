import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Neon WebSocket driver: supports the interactive transactions the platform
// services need (seed, audit, queue worker). The neon-http driver cannot —
// see drizzle-orm/neon-http/session.js ("No transactions support"). Neon's
// WebSocket Pool is designed for serverless (Vercel) deployments.
const pool = new Pool({ connectionString: env().DATABASE_URL });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
