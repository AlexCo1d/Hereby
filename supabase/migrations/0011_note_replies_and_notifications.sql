-- 0011 — messaging feature: public-note replies, image messages, and a
-- notifications system driving the Message tab's orange unread dots.
--
--   1. post_notes.reply_to_note_id — a note may quote-reply another note.
--   2. messages.image_url + relax text NOT NULL — image-only chat messages.
--   3. notifications table + trigger — replying to someone's note notifies its
--      author (cross-user). RLS: a user reads/updates only their own rows.
--   4. RPCs notifications_for_viewer() / get_unread_counts() — shape the client
--      Notification model + the two badge counts in one round-trip each.
--   5. chat-images Storage bucket (public read) + write policy.
--   6. Realtime: publish notifications / messages / post_notes so a cross-user
--      event lights the dot without a manual reload.

-- 1. reply_to_note_id on post_notes ----------------------------------------
alter table public.post_notes
  add column if not exists reply_to_note_id uuid
    references public.post_notes(id) on delete set null;

-- 2. image messages ---------------------------------------------------------
alter table public.messages
  add column if not exists image_url text;
-- Image-only messages carry empty text, so text can no longer be NOT NULL.
alter table public.messages
  alter column text drop not null;
alter table public.messages
  alter column text set default '';

-- 3. notifications ----------------------------------------------------------
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade, -- recipient
  kind           text not null default 'public_note_reply',
  read           boolean not null default false,
  created_at     timestamptz not null default now(),
  actor_id       uuid not null references public.users(id) on delete cascade, -- who replied
  post_id        uuid not null references public.posts(id) on delete cascade,
  note_id        uuid not null references public.post_notes(id) on delete cascade, -- the reply
  parent_note_id uuid references public.post_notes(id) on delete set null,        -- replied-to
  excerpt        text not null default ''
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, read, created_at desc);

alter table public.notifications enable row level security;

-- A user only ever sees / mutates their own notifications. Inserts happen via
-- the SECURITY DEFINER trigger below, so no insert policy is exposed.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select
  using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Swipe-to-delete + "clear read": a user may remove only their own rows.
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete
  using (user_id = auth.uid());

-- Trigger: when a note quote-replies another, notify the parent note's author
-- (unless they're replying to themselves).
create or replace function public.notify_note_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent_author uuid;
  post_title    text;
begin
  if new.reply_to_note_id is null then
    return new;
  end if;
  select author_id into parent_author
    from public.post_notes where id = new.reply_to_note_id;
  if parent_author is null or parent_author = new.author_id then
    return new; -- self-reply or dangling parent: no notification
  end if;
  select title into post_title from public.posts where id = new.post_id;
  insert into public.notifications
    (user_id, kind, actor_id, post_id, note_id, parent_note_id, excerpt)
  values (
    parent_author, 'public_note_reply', new.author_id, new.post_id,
    new.id, new.reply_to_note_id, left(new.text, 140)
  );
  return new;
end; $$;

drop trigger if exists trg_notify_note_reply on public.post_notes;
create trigger trg_notify_note_reply after insert on public.post_notes
  for each row execute function public.notify_note_reply();

-- 4. RPCs -------------------------------------------------------------------
-- notifications_for_viewer → setof jsonb (Notification), newest first.
create or replace function public.notifications_for_viewer()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', n.id,
    'userId', n.user_id,
    'kind', n.kind,
    'read', n.read,
    'createdAt', n.created_at,
    'actor', jsonb_build_object(
      'id', a.id, 'name', a.name, 'avatarUrl', a.avatar_url
    ),
    'postId', n.post_id,
    'postTitle', coalesce(p.title, ''),
    'noteId', n.note_id,
    'parentNoteId', n.parent_note_id,
    'excerpt', n.excerpt
  )
  from public.notifications n
  join public.users a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  where n.user_id = auth.uid()
  order by n.created_at desc;
$$;

-- get_unread_counts → jsonb { chat, notifications }. `chat` counts threads
-- with any unread message (mirrors threads_for_viewer's per-thread unread).
create or replace function public.get_unread_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'chat', (
      select count(*) from public.threads t
      left join public.thread_reads tr
        on tr.thread_id = t.id and tr.user_id = auth.uid()
      where (t.user_a = auth.uid() or t.user_b = auth.uid())
        and coalesce(tr.deleted, false) = false
        and exists (
          select 1 from public.messages m
          where m.thread_id = t.id
            and m.from_user_id <> auth.uid()
            and m.sent_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
        )
    ),
    'notifications', (
      select count(*) from public.notifications n
      where n.user_id = auth.uid() and n.read = false
    )
  );
$$;

-- 5. chat-images Storage bucket --------------------------------------------
insert into storage.buckets (id, name, public)
  values ('chat-images', 'chat-images', true)
  on conflict (id) do nothing;

-- Public read (bucket is public); any authenticated user may upload into it.
drop policy if exists chat_images_read on storage.objects;
create policy chat_images_read on storage.objects for select
  using (bucket_id = 'chat-images');
drop policy if exists chat_images_insert on storage.objects;
create policy chat_images_insert on storage.objects for insert
  with check (bucket_id = 'chat-images' and auth.role() = 'authenticated');

-- 6. Realtime publication ---------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_notes'
    ) then
      alter publication supabase_realtime add table public.post_notes;
    end if;
  end if;
end $$;
