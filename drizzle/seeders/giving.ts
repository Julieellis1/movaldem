import type { DB } from "@/db/client";
import { settings } from "@/db/schema";

// Phase 4 Item 6 giving settings defaults (PRD 08 §6 Giving group).
//
// Money is integer kobo end-to-end (₦1 = 100 kobo), so giving.min_amount is
// 10000 (= ₦100). giving.max_amount is UNSET by design: the row is absent and
// PaymentService falls back to null (no cap). It is listed here with a null
// value purely so the key is visible/documented — seedGivingSettings skips
// null-valued entries because the settings.value column is NOT NULL jsonb
// (a SQL NULL insert would violate the constraint; JSON null is not what an
// "unset cap" means here).
// Paystack keys are ENV-ONLY (PRD 06 §7, env PAYSTACK_SECRET_KEY /
// PAYSTACK_PUBLIC_KEY) — there is deliberately NO DB secret setting, so
// nothing here can leak a credential to the browser (SEC-07/11).

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export const GIVING_SETTINGS_SEED: { key: string; value: unknown; is_secret: boolean }[] = [
  { key: "giving.min_amount", value: 10000, is_secret: false },
  { key: "giving.max_amount", value: null, is_secret: false },
  { key: "giving.require_phone", value: false, is_secret: false },
  { key: "giving.abandon_after_minutes", value: 60, is_secret: false },
  { key: "giving.receipt_footer", value: "", is_secret: false },
];

export async function seedGivingSettings(tx: Tx) {
  // Batched single INSERT (Neon WebSocket round-trip per statement).
  // onConflictDoNothing (NOT the legacy settings upsert): re-seeding must
  // never overwrite staff-edited values.
  const rows = GIVING_SETTINGS_SEED.filter((r) => r.value !== null);
  if (!rows.length) return;
  await tx
    .insert(settings)
    .values(rows as (typeof settings.$inferInsert)[])
    .onConflictDoNothing({ target: settings.key });
}
