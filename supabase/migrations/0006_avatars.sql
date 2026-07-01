-- Avatars: a public Storage bucket + a default generated avatar, and stop the
-- new-user trigger from using the email prefix as the display name (users pick
-- their own name during onboarding).

-- ── Storage bucket ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read; each user may write ONLY within their own folder (avatars/<uid>/…).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── New-user default: blank name (onboarding sets it) + a generated avatar ──
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name, email, campus_id, edu_verified, avatar_url)
  values (
    new.id,
    '',                                  -- no email-prefix name; onboarding sets it
    new.email,
    coalesce(substring(new.email from '@([^.]+)\.edu$'), 'general'),
    (new.email ~* '\.edu$'),
    'https://api.dicebear.com/7.x/avataaars/png?radius=50&seed=' || new.id
  ) on conflict (id) do nothing;
  return new;
end; $$;
