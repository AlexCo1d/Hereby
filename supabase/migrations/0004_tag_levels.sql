-- Per-tag skill level (spec: tag leveling). Maps a tag key → level 1..4:
--   1 beginner / entry-level, 2 intermediate, 3 advanced / proficient,
--   4 expert / master. A missing key means level 1 (beginner) by default.
-- Key = interest id for preset interests (e.g. "tennis"), or the custom-tag
-- label for free-text tags (e.g. "Pickleball"). Stored as jsonb so the shape
-- stays flexible and the whole map round-trips in one write.
alter table public.users
  add column if not exists tag_levels jsonb not null default '{}'::jsonb;
