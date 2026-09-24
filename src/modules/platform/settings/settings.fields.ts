// Registry of the settings surfaced in the admin UI (PRD 08 §6). The settings
// page, its client form and the save API all read this so a key can never be
// written from the client without a matching field definition.

export const MASK_MARKER = "••••";

export const SETTINGS_TABS = [
  "General",
  "Branding",
  "Content",
  "SEO",
  "Email",
  "Storage",
  "Security",
  "Privacy",
] as const;
export type SettingTab = (typeof SETTINGS_TABS)[number];

export type SettingFieldType = "text" | "password" | "number" | "boolean";

export type SettingField = {
  key: string;
  label: string;
  tab: SettingTab;
  type: SettingFieldType;
  isSecret?: boolean;
  description?: string;
};

// Only the keys the plan calls out need real fields; the rest are minimal so
// the tab set stays complete without inventing behaviour nothing reads yet.
export const SETTINGS_FIELDS: readonly SettingField[] = [
  { key: "church.name", label: "Church name", tab: "General", type: "text" },
  { key: "branding.tagline", label: "Tagline", tab: "Branding", type: "text" },
  {
    key: "content.require_review",
    label: "Require content review",
    tab: "Content",
    type: "boolean",
  },
  { key: "content.items_per_page", label: "Items per page", tab: "Content", type: "number" },
  { key: "seo.title_suffix", label: "Title suffix", tab: "SEO", type: "text" },
  {
    key: "smtp_url",
    label: "SMTP URL",
    tab: "Email",
    type: "password",
    isSecret: true,
    description: "Write-only: leave blank to keep the current value.",
  },
  { key: "mail_from", label: "Mail from", tab: "Email", type: "text" },
  { key: "storage_endpoint", label: "Storage endpoint", tab: "Storage", type: "text" },
  { key: "storage_bucket", label: "Storage bucket", tab: "Storage", type: "text" },
  {
    key: "storage_key",
    label: "Storage key",
    tab: "Storage",
    type: "password",
    isSecret: true,
    description: "Write-only: leave blank to keep the current value.",
  },
  {
    key: "storage_secret",
    label: "Storage secret",
    tab: "Storage",
    type: "password",
    isSecret: true,
    description: "Write-only: leave blank to keep the current value.",
  },
  { key: "audit.retention_months", label: "Audit retention (months)", tab: "Security", type: "number" },
  { key: "privacy.contact_email", label: "Privacy contact email", tab: "Privacy", type: "text" },
];

export function findSettingField(key: string): SettingField | undefined {
  return SETTINGS_FIELDS.find((f) => f.key === key);
}

// Write-only secrets (SEC-11): an empty submit, or one that still holds the
// masked placeholder, means "unchanged" and must not overwrite the stored value.
export function isSecretUnchanged(value: unknown): boolean {
  const v = typeof value === "string" ? value.trim() : "";
  return !v || v.includes(MASK_MARKER);
}

// "on" is what a checked checkbox submits in a native form post.
export function coerceSettingValue(field: SettingField, value: unknown): unknown {
  if (field.type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (field.type === "boolean") return value === true || value === "true" || value === "on";
  return String(value ?? "");
}
