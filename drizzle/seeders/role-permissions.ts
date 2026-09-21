import type { RoleKey } from "./roles";

// Matrix per PRD 03 §2. `*` = all actions for that resource.
export const ROLE_MATRIX: Record<RoleKey, string[]> = {
  member: [],
  content_manager: [
    "sermons.*", "bible_studies.*", "sunday_school.*", "series.*", "events.*",
    "programmes.*", "gallery.create", "gallery.read", "gallery.update", "gallery.delete",
    "media.*", "pages.create", "pages.read", "pages.update",
  ],
  quiz_manager: [
    "media.create", "media.read", "media.update",
    "quiz_categories.*", "questions.*", "quizzes.*", "quiz_imports.*",
    "attempts.read", "attempts.cancel", "leaderboards.read", "leaderboards.recalculate",
    "quiz_reports.*", "settings.read", "settings.update",
  ],
  admin: [
    "sermons.*", "bible_studies.*", "sunday_school.*", "series.*", "events.*", "programmes.*",
    "gallery.*", "media.*", "pages.*",
    "quiz_categories.*", "questions.*", "quizzes.*", "quiz_imports.*",
    "attempts.read", "attempts.cancel", "leaderboards.read", "leaderboards.recalculate", "quiz_reports.*",
    "projects.*", "transactions.read", "transactions.export", "transactions.reverify",
    "giving_reports.*", "members.read", "members.update", "members.suspend",
    "contact_messages.read", "contact_messages.update", "contact_messages.delete",
    "settings.read", "settings.update",
  ],
  super_admin: ["*"],
};
