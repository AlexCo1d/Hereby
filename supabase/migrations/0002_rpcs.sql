-- Hereby Phase 2 — remaining RPCs. Ports the logic from
-- services/mock/index.ts into plpgsql so the supabaseApi runs the full flow.
-- All are SECURITY DEFINER and derive the actor from auth.uid().

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────

-- Haversine distance in miles (no PostGIS needed).
create or replace function public.fn_distance_miles(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 2 * 3958.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Is a per-party check-in jsonb "present" (≥1 channel confirmed)?
create or replace function public.fn_party_present(p jsonb)
returns boolean language sql immutable as $$
  select p->>'location' = 'confirmed'
      or p->>'qr'       = 'confirmed'
      or p->>'peer'     = 'confirmed';
$$;

-- Public user JSON (email stripped) — matches the `User` type.
create or replace function public.fn_user_json(u public.users)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url,
    'level', u.level, 'rating', u.rating_received,
    'ratingCount', u.rating_received_count, 'bio', u.bio,
    'eduVerified', u.edu_verified, 'interests', u.interest_ids
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- list_posts_for_viewer(p_filter jsonb) → setof jsonb (snake_case post rows
-- + seats_taken + match_score, so supabaseApi.rowToPost reads them directly).
-- Filter keys mirror DiscoverFilter (camelCase in the jsonb).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.list_posts_for_viewer(p_filter jsonb default '{}')
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f_tags        text[] := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_filter->'tags')), '{}');
  f_formats     text[] := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_filter->'formats')), '{}');
  f_viewertags  text[] := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_filter->'viewerInterestIds')), '{}');
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
    where (cardinality(f_tags) = 0 or exists (
            select 1 from unnest(f_tags) t where lower(t) = lower(p.category)))
      and (cardinality(f_formats) = 0 or p.format::text = any(f_formats))
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
        -- tagMatch × distanceDecay × ratingTerm  (spec 0.8)
        (case when cardinality(f_viewertags) = 0 then 1
              when (b.tags && f_viewertags) or (lower((b.author).level) = any(f_viewertags))
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

-- ─────────────────────────────────────────────────────────────────────────
-- Check-in: write the viewer's side; qr is mutual. Recompute status.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.advance_check_in(p_order_id uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; is_provider bool; both_present bool;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if auth.uid() not in (o.provider_id, o.customer_id) then raise exception 'Not a participant'; end if;
  is_provider := (auth.uid() = o.provider_id);

  if is_provider then
    o.checkin_provider := jsonb_set(o.checkin_provider, array[p_channel], '"confirmed"');
  else
    o.checkin_customer := jsonb_set(o.checkin_customer, array[p_channel], '"confirmed"');
  end if;
  -- qr is mutual — flip the other side too.
  if p_channel = 'qr' then
    o.checkin_provider := jsonb_set(o.checkin_provider, '{qr}', '"confirmed"');
    o.checkin_customer := jsonb_set(o.checkin_customer, '{qr}', '"confirmed"');
  end if;

  if o.status in ('upcoming','checking_in') then
    both_present := public.fn_party_present(o.checkin_provider) and public.fn_party_present(o.checkin_customer);
    o.status := case when both_present then 'in_progress' else 'checking_in' end;
  end if;

  update public.orders set checkin_provider = o.checkin_provider,
    checkin_customer = o.checkin_customer, status = o.status where id = p_order_id;
end; $$;

create or replace function public.reset_check_in(p_order_id uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; is_provider bool;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  is_provider := (auth.uid() = o.provider_id);
  if is_provider then
    o.checkin_provider := jsonb_set(o.checkin_provider, array[p_channel], '"pending"');
  else
    o.checkin_customer := jsonb_set(o.checkin_customer, array[p_channel], '"pending"');
  end if;
  if p_channel = 'qr' then
    o.checkin_provider := jsonb_set(o.checkin_provider, '{qr}', '"pending"');
    o.checkin_customer := jsonb_set(o.checkin_customer, '{qr}', '"pending"');
  end if;
  update public.orders set checkin_provider = o.checkin_provider,
    checkin_customer = o.checkin_customer where id = p_order_id;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- cancel_order — 12h free-cancel window, weather exempt (spec 0.4).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_order(p_order_id uuid, p_reason cancel_reason)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; inside_fee bool; exempt bool;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if auth.uid() not in (o.provider_id, o.customer_id) then raise exception 'Not a participant'; end if;

  inside_fee := (o.start_at - now()) < interval '12 hours';
  exempt := p_reason in ('weather','mutual_no_show');

  update public.orders set
    status = 'cancelled',
    cancelled_by_user_id = auth.uid(),
    auto_cancelled = false,
    cancel_reason = p_reason,
    fee_policy_version = coalesce(o.fee_policy_version, '0.mvp'),
    fee_amount_cents = 0,
    fee_kind = case when inside_fee and not exempt then 'cancellation'::fee_kind else null end,
    fee_charged_to_user_id = case when inside_fee and not exempt then auth.uid() else null end,
    refund_issued = (not (inside_fee and not exempt)),
    refund_amount_cents = case when (inside_fee and not exempt) then null else 0 end,
    payment_status = case when o.payment_status = 'authorized' and not (inside_fee and not exempt)
                          then 'refunded' else o.payment_status end
  where id = p_order_id;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- complete_order — finalize one order with the spec-0.4 decision tree.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.complete_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; sp bool; cp bool;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  sp := public.fn_party_present(o.checkin_provider);
  cp := public.fn_party_present(o.checkin_customer);

  if sp and cp then
    update public.orders set status='completed', no_show_user_id=null, fee_amount_cents=0,
      fee_kind=null, fee_charged_to_user_id=null,
      payment_status = case when payment_status='authorized' then 'captured' else payment_status end
      where id=p_order_id;
  elsif sp and not cp then
    update public.orders set status='no_show', no_show_user_id=o.customer_id,
      fee_kind='no_show', fee_charged_to_user_id=o.customer_id, fee_amount_cents=0 where id=p_order_id;
  elsif cp and not sp then
    update public.orders set status='no_show', no_show_user_id=o.provider_id,
      fee_kind='no_show', fee_charged_to_user_id=o.provider_id, fee_amount_cents=0 where id=p_order_id;
  else
    update public.orders set status='cancelled', auto_cancelled=true, cancel_reason='mutual_no_show',
      refund_issued=true, refund_amount_cents=0,
      payment_status = case when payment_status='authorized' then 'refunded' else payment_status end
      where id=p_order_id;
  end if;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- open_dispute — spec 0.6, 24h window from end_at + 30min.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.open_dispute(p_order_id uuid, p_reason text, p_evidence_urls text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'no_show' then raise exception 'Only no-show orders can be disputed.'; end if;
  if o.dispute_opened_at is not null then raise exception 'This order already has an open appeal.'; end if;
  if now() >= o.end_at + interval '30 minutes' + interval '24 hours' then
    raise exception 'The 24-hour appeal window has closed.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Please describe what happened.'; end if;

  update public.orders set
    dispute_opened_at = now(), dispute_opened_by_user_id = auth.uid(),
    dispute_reason = p_reason, dispute_evidence_urls = p_evidence_urls
  where id = p_order_id;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ping_counterpart — throttle ≤1 / 5 min.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.ping_counterpart(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if auth.uid() not in (o.provider_id, o.customer_id) then raise exception 'Not a participant'; end if;
  if o.last_nudge_at is not null and now() - o.last_nudge_at < interval '5 minutes' then
    raise exception 'Already pinged recently. Try again in a few minutes.'; end if;
  update public.orders set last_nudge_at = now(), last_nudge_user_id = auth.uid() where id = p_order_id;
  -- TODO(Phase 2): enqueue APNs/FCM push to the other participant here.
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Chat
-- ─────────────────────────────────────────────────────────────────────────

-- threads_for_viewer → setof jsonb (ChatThread). Chat is fully open (spec
-- 0.9.a relaxation): all the viewer's non-deleted threads, newest first.
create or replace function public.threads_for_viewer()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id,
    'counterpart', public.fn_user_json(cu.*),
    'lastMessage', t.last_message,
    'lastMessageAt', t.last_message_at,
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
  where (t.user_a = auth.uid() or t.user_b = auth.uid())
    and coalesce(tr.deleted, false) = false
  order by t.last_message_at desc;
$$;

-- open_thread_with(p_with) → uuid. Get-or-create a 1:1 thread. Pair ordered
-- deterministically to satisfy the unique(user_a,user_b) constraint.
create or replace function public.open_thread_with(p_with uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; tid uuid;
begin
  if p_with = auth.uid() then raise exception 'Cannot open a thread with yourself'; end if;
  a := least(auth.uid(), p_with); b := greatest(auth.uid(), p_with);
  select id into tid from public.threads where user_a = a and user_b = b;
  if tid is null then
    insert into public.threads (user_a, user_b) values (a, b) returning id into tid;
  end if;
  -- Un-delete for the viewer if they'd previously swiped it away.
  update public.thread_reads set deleted = false where thread_id = tid and user_id = auth.uid();
  return tid;
end; $$;
