-- 0017 — group activities: direct-join orders, real roster/seat counts, group chat.
--
-- The supabase backend implemented the 1-on-1 pending→accept flow (0012) and a
-- read-only group roster (checkIn.others, 0014), but three things were still
-- missing for multi-person activities/events (format<>'one_on_one' AND seats>1):
--
--   (a) DIRECT JOIN — joining a group post must create a CONFIRMED order
--       immediately (status 'upcoming', NOT 'pending'); the host does NOT
--       accept, and the post does NOT flip to 'matched' — it keeps filling
--       seats and stays 'open' until full (or its start passes). 1-on-1 posts
--       are untouched: they still go pending→accept and lock at 'matched'.
--
--   (b) REAL ROSTER + COUNTS — orders_for_viewer already emits checkIn.others
--       (0014); we widen it so a HOST viewing their own group post also sees
--       the joiners in `others` (0014 excluded o.provider_id, which is fine for
--       a joiner but hid every joiner from the host, whose counterpart is one
--       arbitrary customer). We also expose seatsTaken to the listing (already
--       present via post_seats_taken) and add a `joinedCount` alias on orders so
--       "N/M joined" is derivable without a second fetch.
--
--   (c) GROUP CHAT — the 1-on-1 `threads` table (unique(user_a,user_b)) can't
--       hold an N-person room. Rather than a parallel table set (which would
--       fork messages / thread_reads / sendMessage), we EXTEND `threads` with
--       nullable is_group/post_id/title and add a `thread_members` join table.
--       messages, thread_reads, listMessages, sendMessage and markThreadRead all
--       key on thread_id and keep working verbatim. A new open_group_thread(post)
--       RPC is idempotent (one room per post) and auto-adds the caller.
--
-- All RPCs are SECURITY DEFINER and derive the actor from auth.uid(), matching
-- 0001/0002/0012.

-- ─────────────────────────────────────────────────────────────────────────
-- (a) place_order — branch group vs 1-on-1.
--
-- Chosen approach: MODIFY the existing place_order rather than add a second
-- RPC. The client already calls place_order for every CTA (supabaseApi.createOrder
-- → rpc("place_order")), and the mock's placeOrder likewise branches internally,
-- so a single entry point that branches on isGroup keeps both data sources and
-- the frontend call-site identical (no api.ts change needed for join).
--
-- Group rule: born 'upcoming' (confirmed, no host accept), post stays 'open',
-- no order_request notification (there is nothing for the host to accept). Seat
-- cap still enforced via post_seats_taken (counts non-cancelled rows). 1-on-1
-- branch is byte-for-byte 0012.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.place_order(p_post_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_post    public.posts;
  v_taken   int;
  v_order   uuid;
  v_taker   public.users;
  v_isgroup boolean;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then raise exception 'Post not found'; end if;
  if v_post.author_id = auth.uid() then raise exception 'Cannot order your own post'; end if;
  if v_post.status in ('cancelled','completed') then raise exception 'This post is closed.'; end if;

  -- Group = multi-person activity/event (mirrors isGroupPost in services/types.ts).
  v_isgroup := (v_post.format <> 'one_on_one' and v_post.seats > 1);

  -- Seat cap. post_seats_taken counts non-cancelled orders (pending included),
  -- so a single-seat post with an outstanding request is already "full" here —
  -- that's the 1-on-1 pending lock, no extra check needed.
  select coalesce(seats_taken, 0) into v_taken from public.post_seats_taken where post_id = p_post_id;
  if coalesce(v_taken, 0) >= v_post.seats then
    if v_post.seats = 1 and v_post.status = 'pending' then
      raise exception 'Someone already requested this — waiting on the author.';
    end if;
    raise exception 'This post is already full.';
  end if;

  if v_isgroup then
    -- DIRECT JOIN: confirmed immediately. No host accept, post stays open.
    insert into public.orders (post_id, provider_id, customer_id, post_title_snapshot,
                               start_at, end_at, status, payment_status, fee_policy_version)
    values (v_post.id, v_post.author_id, auth.uid(), v_post.title,
            v_post.start_at, v_post.end_at, 'upcoming',
            (case when v_post.price_cents_per_hour > 0 then 'authorized' else 'not_required' end)::payment_status,
            '0.mvp')
    returning id into v_order;
    -- Intentionally: no post.status change (group posts keep filling seats),
    -- and no order_request notification (nothing to accept).
    return v_order;
  end if;

  -- 1-ON-1: born pending; lock the single-seat post; notify the author. (0012)
  insert into public.orders (post_id, provider_id, customer_id, post_title_snapshot,
                             start_at, end_at, status, payment_status, fee_policy_version)
  values (v_post.id, v_post.author_id, auth.uid(), v_post.title,
          v_post.start_at, v_post.end_at, 'pending',
          (case when v_post.price_cents_per_hour > 0 then 'authorized' else 'not_required' end)::payment_status,
          '0.mvp')
  returning id into v_order;

  if v_post.seats = 1 then
    update public.posts set status = 'pending' where id = v_post.id;
  end if;

  select * into v_taker from public.users where id = auth.uid();
  insert into public.notifications
    (user_id, kind, actor_id, post_id, order_id, excerpt)
  values (v_post.author_id, 'order_request', auth.uid(), v_post.id, v_order,
          coalesce(v_taker.name,'Someone') || ' wants to join · tap to accept or decline');

  return v_order;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- (b) orders_for_viewer — real group roster for BOTH host and joiner.
--
-- 0014 added checkIn.others but excluded o.provider_id from the roster, which
-- is right for a joiner (the host is their `counterpart`) but WRONG for the
-- host: when the viewer IS the provider, their `counterpart` is one arbitrary
-- customer and the rest of the joiners were dropped. Fix: the exclusion set is
-- now "not the viewer, and not the row's counterpart" — computed once — so the
-- host sees every joiner except the one already surfaced as counterpart, and a
-- joiner still sees every other joiner (host excluded, host is counterpart).
--
-- Also adds top-level `joinedCount` (non-cancelled orders on the post) so the
-- client can render "N/M joined" straight off the order. Row shape is otherwise
-- identical to 0014.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.orders_for_viewer()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id,
    'postId', o.post_id,
    'placedAt', o.placed_at,
    'postTitleSnapshot', o.post_title_snapshot,
    'startAt', o.start_at,
    'endAt', o.end_at,
    'status', o.status,
    'reviewed', o.reviewed,
    'isMyPost', (o.provider_id = auth.uid()),
    'counterpart', public.fn_user_json(cu.*),
    -- How many people have committed to this post (host not counted; one order
    -- per joiner). Lets the client show "N/M joined" without a second query.
    'joinedCount', (
      select count(*)::int from public.orders oc
      where oc.post_id = o.post_id and oc.status <> 'cancelled'
    ),
    'checkIn', jsonb_build_object(
      'self', case when o.provider_id = auth.uid() then o.checkin_provider else o.checkin_customer end,
      'counterpart', case when o.provider_id = auth.uid() then o.checkin_customer else o.checkin_provider end,
      -- Every OTHER committed customer on this post, minus the viewer and minus
      -- whoever is already shown as `counterpart` (the host for a joiner, or the
      -- one surfaced customer for the host). joined-order first.
      'others', coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'user', public.fn_user_json(ocu.*),
                   'checkIn', o2.checkin_customer
                 )
                 order by o2.placed_at
               )
        from public.orders o2
        join public.users ocu on ocu.id = o2.customer_id
        where o2.post_id = o.post_id
          and o2.id <> o.id
          and o2.customer_id <> auth.uid()
          and o2.customer_id <> cu.id            -- exclude the counterpart shown above
          and o2.customer_id <> o.provider_id     -- never list the host as a customer row
          and o2.status <> 'cancelled'
      ), '[]'::jsonb)
    ),
    'noShowSide', case
        when o.no_show_user_id is null then null
        when o.no_show_user_id = auth.uid() then 'self' else 'counterpart' end,
    'cancelledByUserId', o.cancelled_by_user_id,
    'autoCancelled', o.auto_cancelled,
    'cancelReason', o.cancel_reason,
    'feeAmountCents', o.fee_amount_cents,
    'feeChargedToUserId', o.fee_charged_to_user_id,
    'feeKind', o.fee_kind,
    'refundIssued', o.refund_issued,
    'refundAmountCents', o.refund_amount_cents,
    'feePolicyVersion', o.fee_policy_version,
    'paymentIntentId', o.payment_intent_id,
    'paymentStatus', o.payment_status,
    'chargedAmountCents', o.charged_amount_cents,
    'lastNudgeAt', o.last_nudge_at,
    'lastNudgeFrom', case
        when o.last_nudge_user_id is null then null
        when o.last_nudge_user_id = auth.uid() then 'self' else 'counterpart' end,
    'disputeOpenedAt', o.dispute_opened_at,
    'disputeOpenedByUserId', o.dispute_opened_by_user_id,
    'disputeReason', o.dispute_reason,
    'disputeEvidenceUrls', o.dispute_evidence_urls,
    'disputeResolvedAt', o.dispute_resolved_at,
    'disputeResolvedByUserId', o.dispute_resolved_by_user_id,
    'disputeResolution', o.dispute_resolution
  )
  from public.orders o
  join public.users cu
    on cu.id = case when o.provider_id = auth.uid() then o.customer_id else o.provider_id end
  where o.provider_id = auth.uid() or o.customer_id = auth.uid()
  order by o.start_at desc;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- (c) Group chat — extend `threads`, add `thread_members`.
--
-- 1-on-1 threads keep user_a/user_b (unique constraint intact). Group rooms set
-- is_group=true, post_id=<the activity>, title=<activity title>, leave
-- user_a/user_b holding the HOST (host = user_a) so threads_for_viewer's
-- existing `counterpart = the-other-of-a/b` still yields a sensible host for
-- group rows too, and 1-on-1 code paths never see NULLs.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.threads
  add column if not exists is_group boolean not null default false;
alter table public.threads
  add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.threads
  add column if not exists title text;

-- One group room per post (partial unique — only group rows participate; 1-on-1
-- rows have NULL post_id and are unaffected).
create unique index if not exists threads_one_group_per_post
  on public.threads (post_id) where is_group;

-- Explicit membership for N-person rooms. 1-on-1 threads don't use this table
-- (their membership is user_a/user_b); group rooms list every participant here.
create table if not exists public.group_thread_members (
  thread_id  uuid not null references public.threads(id) on delete cascade,
  user_id    uuid not null references public.users(id)  on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists group_thread_members_user_idx
  on public.group_thread_members (user_id);

alter table public.group_thread_members enable row level security;

-- A member reads their own membership rows; membership is written only through
-- open_group_thread() (SECURITY DEFINER), so no insert policy is granted.
drop policy if exists group_thread_members_read on public.group_thread_members;
create policy group_thread_members_read on public.group_thread_members for select
  using (user_id = auth.uid()
    or exists (select 1 from public.group_thread_members m
               where m.thread_id = group_thread_members.thread_id and m.user_id = auth.uid()));

-- Extend the chat RLS so a group member can read/write the shared thread and its
-- messages. The 0001 policies (threads_rw / messages_rw) only cover user_a/user_b;
-- these ADD the group-membership path without dropping the 1-on-1 policies.
drop policy if exists threads_group_rw on public.threads;
create policy threads_group_rw on public.threads for all
  using (is_group and exists (
    select 1 from public.group_thread_members m
    where m.thread_id = threads.id and m.user_id = auth.uid()))
  with check (is_group and exists (
    select 1 from public.group_thread_members m
    where m.thread_id = threads.id and m.user_id = auth.uid()));

drop policy if exists messages_group_rw on public.messages;
create policy messages_group_rw on public.messages for all
  using (exists (
    select 1 from public.threads t
    join public.group_thread_members m on m.thread_id = t.id
    where t.id = messages.thread_id and t.is_group and m.user_id = auth.uid()))
  with check (from_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- open_group_thread(p_post) → uuid. Get-or-create the room for a group post and
-- add the caller as a member. Idempotent (one room per post; re-adding a member
-- is a no-op). Only participants (host or a committed joiner) may open it.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.open_group_thread(p_post uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_post public.posts;
  v_is_participant boolean;
  tid uuid;
begin
  select * into v_post from public.posts where id = p_post;
  if not found then raise exception 'Post not found'; end if;

  -- Caller must be the host or hold a non-cancelled order on this post.
  v_is_participant := (v_post.author_id = auth.uid())
    or exists (select 1 from public.orders o
               where o.post_id = p_post and o.customer_id = auth.uid() and o.status <> 'cancelled');
  if not v_is_participant then raise exception 'Join the activity to open its chat.'; end if;

  -- Get-or-create the room. Host is stored as user_a (and user_b) so the
  -- existing 1-on-1 counterpart logic yields the host for group rows too.
  select id into tid from public.threads where post_id = p_post and is_group;
  if tid is null then
    insert into public.threads (user_a, user_b, is_group, post_id, title, last_message)
    values (v_post.author_id, v_post.author_id, true, p_post, v_post.title, '')
    returning id into tid;
    -- Seed the host as the first member.
    insert into public.group_thread_members (thread_id, user_id)
    values (tid, v_post.author_id)
    on conflict do nothing;
  end if;

  -- Add the caller (idempotent) and un-delete their view if they'd swiped it.
  insert into public.group_thread_members (thread_id, user_id)
  values (tid, auth.uid()) on conflict do nothing;
  update public.thread_reads set deleted = false where thread_id = tid and user_id = auth.uid();

  return tid;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- threads_for_viewer — now returns 1-on-1 AND group rooms.
--
-- Group rows carry isGroup=true, title, and members[] (every participant except
-- the viewer). `counterpart` still points at the host so the client's 1-on-1
-- fields keep rendering. linkedOrderIds for a group row are the viewer's own
-- order(s) on that post. create-or-replace of 0002's function: 1-on-1 branch is
-- unchanged, a UNION ALL adds the group branch.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.threads_for_viewer()
returns setof jsonb language sql stable security definer set search_path = public as $$
  -- 1-on-1 threads (unchanged from 0002).
  select jsonb_build_object(
    'id', t.id,
    'counterpart', public.fn_user_json(cu.*),
    'lastMessage', t.last_message,
    'lastMessageAt', t.last_message_at,
    'isGroup', false,
    'unread', (
      select count(*) from public.messages m
      where m.thread_id = t.id
        and m.from_user_id <> auth.uid()
        and m.sent_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
    ),
    'linkedOrderIds', coalesce((
      select array_agg(o.id) from public.orders o
      where (o.provider_id = t.user_a and o.customer_id = t.user_b)
         or (o.provider_id = t.user_b and o.customer_id = t.user_a)
    ), '{}')
  )
  from public.threads t
  join public.users cu on cu.id = case when t.user_a = auth.uid() then t.user_b else t.user_a end
  left join public.thread_reads tr on tr.thread_id = t.id and tr.user_id = auth.uid()
  where t.is_group = false
    and (t.user_a = auth.uid() or t.user_b = auth.uid())
    and coalesce(tr.deleted, false) = false

  union all

  -- Group rooms the viewer is a member of.
  select jsonb_build_object(
    'id', t.id,
    -- counterpart = the host, so 1-on-1 client code keeps working.
    'counterpart', public.fn_user_json(host.*),
    'lastMessage', t.last_message,
    'lastMessageAt', t.last_message_at,
    'isGroup', true,
    'title', coalesce(t.title, 'Group activity'),
    -- Every participant except the viewer (host first, then join order).
    'members', coalesce((
      select jsonb_agg(public.fn_user_json(mu.*) order by
               case when mu.id = t.user_a then 0 else 1 end, gm.joined_at)
      from public.group_thread_members gm
      join public.users mu on mu.id = gm.user_id
      where gm.thread_id = t.id and gm.user_id <> auth.uid()
    ), '[]'::jsonb),
    'unread', (
      select count(*) from public.messages m
      where m.thread_id = t.id
        and m.from_user_id <> auth.uid()
        and m.sent_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
    ),
    -- The viewer's own non-cancelled order(s) on this activity (empty for the host).
    'linkedOrderIds', coalesce((
      select array_agg(o.id) from public.orders o
      where o.post_id = t.post_id
        and (o.customer_id = auth.uid() or o.provider_id = auth.uid())
        and o.status <> 'cancelled'
    ), '{}')
  )
  from public.threads t
  join public.group_thread_members gm0 on gm0.thread_id = t.id and gm0.user_id = auth.uid()
  join public.users host on host.id = t.user_a
  left join public.thread_reads tr on tr.thread_id = t.id and tr.user_id = auth.uid()
  where t.is_group = true
    and coalesce(tr.deleted, false) = false

  order by 1;
$$;
-- NOTE: the trailing `order by 1` sorts by the jsonb result and is only a
-- tiebreaker placeholder — the client already sorts by lastMessageAt. If a
-- strict recency order is desired server-side, wrap both branches in a subquery
-- selecting last_message_at and order by that; kept simple here to match the
-- single-expression style of the other *_for_viewer functions.

-- ─────────────────────────────────────────────────────────────────────────
-- get_unread_counts — include group rooms in the chat badge.
-- create-or-replace of 0011: the 1-on-1 count is unchanged; a second count of
-- unread group rooms is added.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_unread_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'chat', (
      -- 1-on-1 rooms with unread.
      select count(*) from public.threads t
      left join public.thread_reads tr
        on tr.thread_id = t.id and tr.user_id = auth.uid()
      where t.is_group = false
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
        and coalesce(tr.deleted, false) = false
        and exists (
          select 1 from public.messages m
          where m.thread_id = t.id
            and m.from_user_id <> auth.uid()
            and m.sent_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
        )
    ) + (
      -- group rooms with unread.
      select count(*) from public.threads t
      join public.group_thread_members gm on gm.thread_id = t.id and gm.user_id = auth.uid()
      left join public.thread_reads tr
        on tr.thread_id = t.id and tr.user_id = auth.uid()
      where t.is_group = true
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

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime: publish group_thread_members so a new joiner's room appears live
-- (messages / threads are already published in 0011).
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_thread_members'
    ) then
      alter publication supabase_realtime add table public.group_thread_members;
    end if;
  end if;
end $$;
