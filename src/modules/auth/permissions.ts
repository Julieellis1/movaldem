export const RESOURCES = [
  "sermons", "bible_studies", "sunday_school", "series", "events", "programmes",
  "gallery", "media", "pages", "quiz_categories", "questions", "quizzes",
  "quiz_imports", "attempts", "leaderboards", "quiz_reports", "projects",
  "transactions", "giving_reports", "members", "staff", "roles",
  "contact_messages", "settings", "paystack", "audit_logs",
] as const;
export type Resource = (typeof RESOURCES)[number];
export const ACTIONS = ["create", "read", "update", "delete", "publish", "export"] as const;
export type Action = (typeof ACTIONS)[number];
export type PermissionKey = `${Resource}.${Action}` | `${Resource}.reverify` | `${Resource}.cancel` | `${Resource}.recalculate` | `${Resource}.suspend` | `${Resource}.invite`;

export const PERMISSIONS: { key: PermissionKey; description: string }[] = [];
for (const r of RESOURCES) for (const a of ACTIONS) {
  if (r === "transactions" && a === "publish") continue;
  PERMISSIONS.push({ key: `${r}.${a}` as PermissionKey, description: `${a} ${r}` });
}
["transactions.reverify", "attempts.cancel", "leaderboards.recalculate", "members.suspend", "staff.invite"].forEach((k) =>
  PERMISSIONS.push({ key: k as PermissionKey, description: k }),
);
