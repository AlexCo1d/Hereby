-- Per-user onboarding flag. Without this, the client's single global
-- `hasFinishedOnboarding` persisted flag leaks across users/backends — a fresh
-- sign-in could skip the area/interests step because a previous (mock) session
-- had set it true. Now onboarding completion is durable per user.
alter table public.users
  add column if not exists onboarded boolean not null default false;
