const SECRET_FIELDS = ["paystack_secret_key", "paystack_public_key", "password", "password_hash",
  "smtp_url", "storage_secret", "storage_key", "totp_secret", "app_secret", "token", "token_hash"];
export function redactSecrets(changes: unknown): unknown {
  if (!changes || typeof changes !== "object") return changes;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) =>
          SECRET_FIELDS.includes(k) ? [k, "[REDACTED]"] : [k, walk(val)],
        ),
      );
    }
    return v;
  };
  return walk(changes);
}
