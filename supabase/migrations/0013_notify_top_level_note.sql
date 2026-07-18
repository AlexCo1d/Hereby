-- 0013 — notify the POST AUTHOR when someone leaves a top-level public note.
--
-- Before this, notify_note_reply() bailed out on any note with no
-- reply_to_note_id, so a plain (non-reply) note on a post fired NO
-- notification — the author never learned someone left a note. This rewrites
-- the trigger to cover BOTH cases:
--   • reply note  → notify the parent note's author  (kind public_note_reply)
--   • top-level   → notify the post's author         (kind public_note_posted)
-- In each case a self-notification (acting on your own note / your own post) is
-- suppressed.

create or replace function public.notify_note_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  recipient  uuid;
  n_kind     text;
begin
  if new.reply_to_note_id is not null then
    -- Reply: notify the parent note's author.
    select author_id into recipient
      from public.post_notes where id = new.reply_to_note_id;
    n_kind := 'public_note_reply';
  else
    -- Top-level note: notify the post's author.
    select author_id into recipient
      from public.posts where id = new.post_id;
    n_kind := 'public_note_posted';
  end if;

  -- No recipient (dangling reference) or acting on your own note/post: skip.
  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  insert into public.notifications
    (user_id, kind, actor_id, post_id, note_id, parent_note_id, excerpt)
  values (
    recipient, n_kind, new.author_id, new.post_id,
    new.id, new.reply_to_note_id, left(new.text, 140)
  );
  return new;
end; $$;
