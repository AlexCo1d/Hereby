-- 0012 — order accept/pending state machine + take-request notifications.
--
-- Brings the supabase backend up to the client's pending-accept design (the
-- mock already implements this; see services/mock/index.ts):
--
--   1. order_status gains `pending`. A take-request is born pending and waits
--      for the post AUTHOR to accept/decline. place_order sets it; accept_order
--      / decline_order transition it.
--   2. Posts gain a lifecycle (`status`), a unique sequential `order_no`, and a
--      `pending_rounds` counter. A single-seat post locks (status='pending')
--      while a request is outstanding; nobody else can take it (enforced
--      naturally by post_seats_taken, which already counts non-cancelled rows).
--   3. A pending request the author ignores for longer than PENDING_DECISION
--      (3h) auto-rejects (default reject). After MAX_PENDING_ROUNDS (2) the post
--      closes as a "no-response" post and the author's rating is docked by
--      RATING_NO_RESPONSE_PENALTY (0.001). Folded into finalize_overdue_orders.
--   4. `order_request` notification to the author on each take (in-app), plus an
--      Edge Function (notify-order-request) that emails them. Delivery is best
--      effort via pg_net and never blocks the order.
--   5. Discover/Events hide closed posts; list_posts_for_viewer surfaces the new
--      post fields; notifications_for_viewer carries orderId.
--
-- NOTE on enum safety: `alter type ... add value` cannot be referenced by the
-- SAME transaction's top-level DML/DDL. All references to the new labels live
-- inside function bodies (evaluated at call time, not during this migration),
-- so this file is safe to apply in one transaction.

-- 1. enum values ------------------------------------------------------------
alter type order_status add value if not exists 'pending' before 'upcoming';
alter type cancel_reason add value if not exists 'author_no_response';

-- 2. post lifecycle type + columns -----------------------------------------
do $$ begin
  create type post_status as enum ('open','pending','matched','completed','cancelled');
exception when duplicate_object then null; end $$;

alter table public.posts
  add column if not exists status post_status not null default 'open';

-- Unique, never-reused order number. Seeded rows are backfilled; new rows pull
-- the next value. Starts at 1000 to match the mock's orderNoSeq.
create sequence if not exists public.post_order_no_seq start 1000;
alter table public.posts add column if not exists order_no bigint;
update public.posts set order_no = nextval('public.post_order_no_seq') where order_no is null;
alter table public.posts alter column order_no set default nextval('public.post_order_no_seq');
do $$ begin
  alter table public.posts add constraint posts_order_no_key unique (order_no);
exception when duplicate_table or duplicate_object then null; end $$;

alter table public.posts
  add column if not exists pending_rounds int not null default 0;

-- 3. notifications: allow order_request rows (no note; carries an order) -----
alter table public.notifications alter column note_id drop not null;
alter table public.notifications
  add column if not exists order_id uuid references public.orders(id) on delete cascade;

-- 4. place_order — born pending; lock single-seat post; notify author --------
create or replace function public.place_order(p_post_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_post   public.posts;
  v_taken  int;
  v_order  uuid;
  v_taker  public.users;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then raise exception 'Post not found'; end if;
  if v_post.author_id = auth.uid() then raise exception 'Cannot order your own post'; end if;
  if v_post.status in ('cancelled','completed') then raise exception 'This post is closed.'; end if;
  -- Seat cap. Because post_seats_taken counts non-cancelled orders (pending
  -- included), a single-seat post with an outstanding request is already
  -- "full" here — that's the pending lock, no extra check needed.
  select coalesce(seats_taken, 0) into v_taken from public.post_seats_taken where post_id = p_post_id;
  if coalesce(v_taken, 0) >= v_post.seats then
    if v_post.seats = 1 and v_post.status = 'pending' then
      raise exception 'Someone already requested this — waiting on the author.';
    end if;
    raise exception 'This post is already full.';
  end if;

  insert into public.orders (post_id, provider_id, customer_id, post_title_snapshot,
                             start_at, end_at, status, payment_status, fee_policy_version)
  values (v_post.id, v_post.author_id, auth.uid(), v_post.title,
          v_post.start_at, v_post.end_at, 'pending',
          (case when v_post.price_cents_per_hour > 0 then 'authorized' else 'not_required' end)::payment_status,
          '0.mvp')
  returning id into v_order;

  -- Lock a single-seat post while the author decides.
  if v_post.seats = 1 then
    update public.posts set status = 'pending' where id = v_post.id;
  end if;

  -- Notify the author (in-app). The Edge Function trigger emails them too.
  select * into v_taker from public.users where id = auth.uid();
  insert into public.notifications
    (user_id, kind, actor_id, post_id, order_id, excerpt)
  values (v_post.author_id, 'order_request', auth.uid(), v_post.id, v_order,
          coalesce(v_taker.name,'Someone') || ' wants to join · tap to accept or decline');

  return v_order;
end; $$;

-- 5. accept_order — author only; pending → upcoming; post → matched ---------
create or replace function public.accept_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.provider_id <> auth.uid() then raise exception 'Only the post author can accept.'; end if;
  if v_order.status <> 'pending' then raise exception 'This request is no longer pending.'; end if;
  update public.orders set status = 'upcoming' where id = p_order_id;
  update public.posts set status = 'matched' where id = v_order.post_id;
end; $$;

-- 6. decline_order — either participant; pending → cancelled; post re-opens --
create or replace function public.decline_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.provider_id <> auth.uid() and v_order.customer_id <> auth.uid() then
    raise exception 'Not your order.';
  end if;
  if v_order.status <> 'pending' then raise exception 'This request is no longer pending.'; end if;
  update public.orders set
    status = 'cancelled', auto_cancelled = false, cancel_reason = 'other',
    fee_amount_cents = 0, refund_issued = true, refund_amount_cents = 0,
    payment_status = case when payment_status = 'authorized' then 'refunded' else payment_status end
    where id = p_order_id;
  -- A manual decline re-opens the post (it is NOT a no-response round).
  update public.posts set status = 'open' where id = v_order.post_id and status = 'pending';
end; $$;

-- 7. finalize_overdue_orders — now also default-rejects stale pending -------
-- PENDING_DECISION = 3h, MAX_PENDING_ROUNDS = 2, RATING_NO_RESPONSE_PENALTY =
-- 0.001 (mirrors services/types.ts). Kept in the same cron so one schedule
-- drives every server-side transition.
create or replace function public.finalize_overdue_orders()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
  self_there bool; other_there bool; v_rounds int;
begin
  -- (a) Default-reject pending requests the author left unanswered > 3h.
  for r in
    select * from public.orders
    where status = 'pending' and now() > placed_at + interval '3 hours'
  loop
    update public.orders set
      status = 'cancelled', auto_cancelled = true, cancel_reason = 'author_no_response',
      fee_amount_cents = 0, refund_issued = true, refund_amount_cents = 0,
      payment_status = case when payment_status = 'authorized' then 'refunded' else payment_status end
      where id = r.id;
    update public.posts set pending_rounds = pending_rounds + 1
      where id = r.post_id
      returning pending_rounds into v_rounds;
    if v_rounds >= 2 then
      -- Abandoned "no-response" post: close it and dock the author's rating.
      update public.posts set status = 'cancelled' where id = r.post_id;
      update public.users set rating_received = greatest(0, rating_received - 0.001)
        where id = r.provider_id;
    else
      update public.posts set status = 'open' where id = r.post_id;
    end if;
    v_count := v_count + 1;
  end loop;

  -- (b) Finalize past-end active orders (unchanged from 0001).
  for r in
    select * from public.orders
    where status in ('upcoming','checking_in','in_progress')
      and now() > end_at + interval '30 minutes'
  loop
    self_there  := (r.checkin_provider->>'location'='confirmed'
                    or r.checkin_provider->>'qr'='confirmed'
                    or r.checkin_provider->>'peer'='confirmed');
    other_there := (r.checkin_customer->>'location'='confirmed'
                    or r.checkin_customer->>'qr'='confirmed'
                    or r.checkin_customer->>'peer'='confirmed');
    if self_there and other_there then
      update public.orders set status='completed',
        payment_status = case when payment_status='authorized' then 'captured' else payment_status end
        where id=r.id;
    elsif self_there and not other_there then
      update public.orders set status='no_show', no_show_user_id=r.customer_id,
        fee_kind='no_show', fee_charged_to_user_id=r.customer_id, fee_amount_cents=0 where id=r.id;
    elsif other_there and not self_there then
      update public.orders set status='no_show', no_show_user_id=r.provider_id,
        fee_kind='no_show', fee_charged_to_user_id=r.provider_id, fee_amount_cents=0 where id=r.id;
    else
      update public.orders set status='cancelled', auto_cancelled=true,
        cancel_reason='mutual_no_show', refund_issued=true, refund_amount_cents=0,
        payment_status = case when payment_status='authorized' then 'refunded' else payment_status end
        where id=r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

-- 8. list_posts_for_viewer — hide closed posts; surface new post fields ------
-- Identical to 0009 except for one added WHERE predicate (closed posts hidden).
-- to_jsonb(s) automatically carries the new status / order_no / pending_rounds
-- columns out to the client (rowToPost maps them).
create or replace function public.list_posts_for_viewer(p_filter jsonb default '{}')
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f_tags        text[] := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_filter->'tags')), '{}');
  f_formats     text[] := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_filter->'formats')), '{}');
  f_viewertags  text[] := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_filter->'viewerInterestIds')), '{}');
  f_skilllevels int[]  := coalesce((select array_agg((value)::int) from jsonb_array_elements_text(p_filter->'skillLevels')), '{}');
  f_minseats    int    := (p_filter->>'minSeats')::int;
  f_maxseats    int    := (p_filter->>'maxSeats')::int;
  f_winstart    timestamptz := (p_filter->>'windowStart')::timestamptz;
  f_winend      timestamptz := (p_filter->>'windowEnd')::timestamptz;
  f_kind        text   := p_filter->>'kind';
  f_query       text   := lower(coalesce(p_filter->>'query',''));
  f_exclude     text   := p_filter->>'excludeAuthorId';
  f_onlyevents  bool   := coalesce((p_filter->>'onlyEvents')::bool, false);
  f_usematch    bool   := coalesce((p_filter->>'useMatchScore')::bool, false);
  f_clat        double precision := (p_filter->'center'->>'lat')::double precision;
  f_clng        double precision := (p_filter->'center'->>'lng')::double precision;
  f_radius      double precision := (p_filter->>'radiusMiles')::double precision;
begin
  return query
  with base as (
    select p.*,
      coalesce(st.seats_taken, 0) as seats_taken,
      (select a from public.users a where a.id = p.author_id) as author
    from public.posts p
    left join public.post_seats_taken st on st.post_id = p.id
    where p.status not in ('cancelled','completed')  -- hide closed posts
      and (cardinality(f_tags) = 0 or exists (
            select 1 from unnest(f_tags) term
            where position(lower(term) in public.fn_post_search_surface(p)) > 0
               or exists (
                 select 1
                 from regexp_split_to_table(lower(term), '[^a-z0-9]+') tw
                 cross join regexp_split_to_table(public.fn_post_search_surface(p), '[^a-z0-9]+') sw
                 where tw <> '' and sw <> ''
                   and (position(tw in sw) > 0 or position(sw in tw) > 0)
               )))
      and (cardinality(f_formats) = 0 or p.format::text = any(f_formats))
      and (cardinality(f_skilllevels) = 0
           or p.skill_mode is null or p.skill_mode = 'any'
           or (p.skill_level is not null and p.skill_level = any(f_skilllevels)))
      and (f_minseats is null or p.seats >= f_minseats)
      and (f_maxseats is null or p.seats <= f_maxseats)
      and (f_winstart is null or f_winend is null
           or (p.start_at < f_winend and p.end_at > f_winstart))
      and (f_kind is null or p.kind::text = f_kind)
      and (f_exclude is null or p.author_id::text <> f_exclude)
      and (not f_onlyevents or p.format <> 'one_on_one')
      and (f_query = '' or lower(p.title) like '%'||f_query||'%'
                        or lower(coalesce(p.description,'')) like '%'||f_query||'%'
                        or lower(p.category) like '%'||f_query||'%'
                        or exists (select 1 from unnest(p.tags) tg where lower(tg) like '%'||f_query||'%'))
      and (not (f_usematch and f_clat is not null and f_radius is not null)
           or public.fn_distance_miles(p.lat, p.lng, f_clat, f_clng) <= f_radius)
  ),
  scored as (
    select b.*,
      case when f_usematch and f_clat is not null and f_radius is not null then
        (case when cardinality(f_viewertags) = 0 then 1
              when (b.tags && f_viewertags)
                   or exists (select 1 from unnest(f_viewertags) vt where lower(vt) = lower(b.category)) then 1
              else 0 end)
        * greatest(0, least(1, exp(-public.fn_distance_miles(b.lat, b.lng, f_clat, f_clng) / f_radius)))
        * (case when (b.author).rating_received_count = 0 then 0.6
                else greatest(0, least(1, (b.author).rating_received / 5)) end)
      else null end as match_score
    from base b
  )
  select to_jsonb(s) - 'author'
  from scored s
  order by (s.match_score is not null) desc, s.match_score desc nulls last, s.posted_at desc;
end; $$;

-- 9. notifications_for_viewer — carry orderId (order_request jump target) ----
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
    'orderId', n.order_id,
    'excerpt', n.excerpt
  )
  from public.notifications n
  join public.users a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  where n.user_id = auth.uid()
  order by n.created_at desc;
$$;

-- 10. Email on take-request via Edge Function (best-effort, non-blocking) ----
-- Requires (configure once per project):
--   • create extension if not exists pg_net;
--   • Vault secrets `project_url` and `service_role_key`;
--   • the notify-order-request Edge Function deployed with a RESEND_API_KEY.
-- The trigger fires an async HTTP POST; a missing config or failed send never
-- blocks the notification insert (the in-app notification is the source of
-- truth). Guarded so the migration still applies where pg_net isn't installed.
create or replace function public.notify_order_request_email() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url  text;
  v_key  text;
begin
  if new.kind <> 'order_request' then return new; end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_url is null or v_key is null then return new; end if;
    perform net.http_post(
      url := v_url || '/functions/v1/notify-order-request',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('notificationId', new.id, 'orderId', new.order_id)
    );
  exception when others then
    -- pg_net not installed / vault empty / transient error: swallow so the
    -- in-app notification still lands.
    null;
  end;
  return new;
end; $$;

drop trigger if exists trg_notify_order_request_email on public.notifications;
create trigger trg_notify_order_request_email after insert on public.notifications
  for each row execute function public.notify_order_request_email();
