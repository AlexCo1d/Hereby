-- Skill-level matching requirement on a post. `skill_mode` says how the
-- candidate's level (from users.tag_levels, 1..4) is compared to `skill_level`:
--   any (default) = no requirement; exact / min (>=) / max (<=).
alter table public.posts
  add column if not exists skill_level integer,
  add column if not exists skill_mode  text not null default 'any'
    check (skill_mode in ('any', 'exact', 'min', 'max'));
