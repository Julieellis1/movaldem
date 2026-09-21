export const ROLE_KEYS = {
  member: "Member",
  content_manager: "Content Manager",
  quiz_manager: "Quiz Manager",
  admin: "Admin",
  super_admin: "Super Admin",
} as const;
export type RoleKey = keyof typeof ROLE_KEYS;
