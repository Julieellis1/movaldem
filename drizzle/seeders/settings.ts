export const SETTINGS_SEED: { key: string; value: unknown; is_secret: boolean }[] = [
  { key: "church.name", value: "Mountain of Victory at the Last Day Evangelical Ministry", is_secret: false },
  { key: "content.require_review", value: false, is_secret: false },
  { key: "content.items_per_page", value: 12, is_secret: false },
  { key: "quiz.require_verified_email", value: true, is_secret: false },
  { key: "quiz.grace_seconds", value: 5, is_secret: false },
  { key: "leaderboard.attempt_counting", value: "best_per_quiz", is_secret: false },
  { key: "leaderboard.min_attempts", value: 1, is_secret: false },
  { key: "leaderboard.default_display", value: "abbreviated", is_secret: false },
  { key: "leaderboard.force_abbreviated", value: false, is_secret: false },
  { key: "leaderboard.page_size", value: 50, is_secret: false },
  // Giving keys live in ./giving.ts (GIVING_SETTINGS_SEED, Phase 4 Item 6) —
  // do not duplicate them here; the legacy upsert below would overwrite
  // staff-edited values on re-seed while the giving seeder preserves them.
  { key: "audit.retention_months", value: 24, is_secret: false },
];
