-- 0010 — close two schema gaps that broke supabase-mode writes:
--
--   1. posts is missing `price_mode` and `budget_cents`, but the client's
--      postToInsert() (services/supabase/api.ts) sends both on every create.
--      PostgREST rejects the insert with "column does not exist", so NEW POSTS
--      never save. Add the columns; rowToPost + list_posts_for_viewer (which
--      does `select p.*`) pick them up automatically.
--
--   2. public notes read/write against a `post_notes` table that was never
--      created, so addPublicNote/listPublicNotes always error. Create it with
--      open-read / author-only-write RLS, matching the posts model.

-- 1. price_mode / budget_cents on posts ------------------------------------
alter table public.posts
  add column if not exists price_mode   text,
  add column if not exists budget_cents integer not null default 0;

-- 2. post_notes -------------------------------------------------------------
create table if not exists public.post_notes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.users(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_notes_post_idx on public.post_notes (post_id, created_at);

alter table public.post_notes enable row level security;

-- Any signed-in user can read a post's public notes; only the author of a note
-- may create it (author_id is forced to the caller).
drop policy if exists post_notes_read on public.post_notes;
create policy post_notes_read on public.post_notes for select
  using (auth.role() = 'authenticated');

drop policy if exists post_notes_insert on public.post_notes;
create policy post_notes_insert on public.post_notes for insert
  with check (author_id = auth.uid());

drop policy if exists post_notes_delete on public.post_notes;
create policy post_notes_delete on public.post_notes for delete
  using (author_id = auth.uid());
