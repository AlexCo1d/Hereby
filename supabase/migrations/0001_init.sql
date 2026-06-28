-- Hereby Phase 2 schema — mirrors services/types.ts and API_CONTRACT.md.
-- Money is integer cents. Timestamps are timestamptz. Viewer-relative fields
-- (counterpart, is_my_post, check-in self/counterpart, no_show_side) are
-- resolved by the orders_for_viewer view, never stored.
--
-- Apply with: supabase db push   (or paste into the SQL editor).

-- ─────────────────────────────────────────────────────────────────────────
-- Extensions
-- gen_random_uuid() is core since PG13 — no extension needed. Distance is
-- plain haversine (see fn_distance_miles) which works everywhere. Phase 3 can
-- add PostGIS for an indexed geofence at scale; until then haversine is fine
-- for campus-sized result sets.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────
create type post_kind   as enum ('offer', 'seek');
create type post_format as enum ('one_on_one', 'activity', 'event');
create type order_status as enum
  ('upcoming', 'checking_in', 'in_progress', 'completed', 'no_show', 'cancelled');
create type checkin_channel as enum ('location', 'qr', 'peer');
create type checkin_status  as enum ('pending', 'confirmed');
create type cancel_reason   as enum ('weather', 'personal', 'other', 'mutual_no_show');
create type fee_kind        as enum ('cancellation', 'no_show');
create type payment_status  as enum
  ('not_required', 'authorized', 'captured', 'refunded', 'failed');
create type dispute_resolution as enum
  ('reversed_to_completed', 'upheld_no_show', 'dismissed');

-- ─────────────────────────────────────────────────────────────────────────
-- users  (1:1 with auth.users; public profile fields only)
-- ─────────────────────────────────────────────────────────────────────────
create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null,
  avatar_url      text not null default '',
  level           text,
  bio             text,
  campus_id       text not null default 'general',
  edu_verified    boolean not null default false,
  -- email lives ONLY here (self-readable); never exposed in the public view.
  email           text,
  interest_ids    text[] not null default '{}',
  custom_tags     text[] not null default '{}',
  radius_miles    numeric not null default 5,
  center_lat      double precision,
  center_lng      double precision,
  rating_received       numeric not null default 0,
  rating_received_count integer not null default 0,
  rating_given          numeric not null default 0,
  rating_given_count    integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- posts
-- ─────────────────────────────────────────────────────────────────────────
create table public.posts (
  id                    uuid primary key default gen_random_uuid(),
  author_id             uuid not null references public.users(id) on delete cascade,
  kind                  post_kind not null default 'offer',
  format                post_format not null default 'one_on_one',
  title                 text not null,
  category              text not null,
  description           text,
  tags                  text[] not null default '{}',          -- ≤ 10, GIN-indexed
  price_cents_per_hour  integer not null default 0,
  cancellation_fee_cents integer not null default 0,
  seats                 integer not null default 1 check (seats >= 1),
  start_at              timestamptz not null,
  end_at                timestamptz not null,
  lat                   double precision not null,
  lng                   double precision not null,
  location_name         text,
  badges                text[] not null default '{}',
  comments_count        integer not null default 0,
  cover_image_url       text,
  posted_at             timestamptz not null default now()
);
create index posts_tags_idx      on public.posts using gin (tags);
create index posts_author_idx    on public.posts (author_id);
create index posts_format_idx    on public.posts (format);

-- ─────────────────────────────────────────────────────────────────────────
-- orders  (one row per seat taken; stores canonical, NON-viewer-relative data)
-- ─────────────────────────────────────────────────────────────────────────
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.posts(id) on delete cascade,
  -- canonical participant ids (the view derives counterpart / is_my_post / self)
  provider_id         uuid not null references public.users(id),   -- post author
  customer_id         uuid not null references public.users(id),   -- the taker
  placed_at           timestamptz not null default now(),
  post_title_snapshot text not null,
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  status              order_status not null default 'upcoming',
  reviewed            boolean not null default false,

  -- per-party check-in (NOT viewer-relative here — keyed by role)
  checkin_provider    jsonb not null default '{"location":"pending","qr":"pending","peer":"pending"}',
  checkin_customer    jsonb not null default '{"location":"pending","qr":"pending","peer":"pending"}',

  -- cancellation
  cancelled_by_user_id uuid references public.users(id),
  auto_cancelled       boolean not null default false,
  cancel_reason        cancel_reason,

  -- no-show attribution (stores the absent USER id; view maps to self/counterpart)
  no_show_user_id      uuid references public.users(id),

  -- fee scaffold (spec 0.4 — $0 in MVP)
  fee_amount_cents      integer,
  fee_charged_to_user_id uuid references public.users(id),
  fee_kind              fee_kind,
  refund_issued         boolean,
  refund_amount_cents   integer,
  fee_policy_version    text,

  -- payment scaffold (Phase 2 Stripe)
  payment_intent_id     text,
  payment_status        payment_status,
  charged_amount_cents  integer,

  -- nudge scaffold
  last_nudge_at         timestamptz,
  last_nudge_user_id    uuid references public.users(id),

  -- dispute scaffold (spec 0.6, 24h window)
  dispute_opened_at        timestamptz,
  dispute_opened_by_user_id uuid references public.users(id),
  dispute_reason           text,
  dispute_evidence_urls    text[],
  dispute_resolved_at      timestamptz,
  dispute_resolved_by_user_id uuid references public.users(id),
  dispute_resolution       dispute_resolution
);
create index orders_provider_idx on public.orders (provider_id);
create index orders_customer_idx on public.orders (customer_id);
create index orders_post_idx     on public.orders (post_id);
-- prevent the same customer taking the same post twice
create unique index orders_one_per_customer_per_post
  on public.orders (post_id, customer_id) where status <> 'cancelled';

-- ─────────────────────────────────────────────────────────────────────────
-- ratings  (private per-order; aggregates roll up to users via trigger)
-- ─────────────────────────────────────────────────────────────────────────
create table public.ratings (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  from_user_id  uuid not null references public.users(id),
  to_user_id    uuid not null references public.users(id),
  stars         smallint not null check (stars between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  unique (order_id, from_user_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- chat: threads, participants, messages, read state
-- ─────────────────────────────────────────────────────────────────────────
create table public.threads (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references public.users(id),
  user_b      uuid not null references public.users(id),
  last_message    text not null default '',
  last_message_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_a, user_b)
);
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  from_user_id uuid not null references public.users(id),
  text        text not null,
  sent_at     timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, sent_at);
-- per-viewer read state + soft delete (so delete is per-user, spec 0.9.a)
create table public.thread_reads (
  thread_id   uuid not null references public.threads(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  last_read_at timestamptz not null default now(),
  deleted     boolean not null default false,
  primary key (thread_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Helper view: seats taken per post (non-cancelled orders)
-- ─────────────────────────────────────────────────────────────────────────
create view public.post_seats_taken as
  select post_id, count(*)::int as seats_taken
  from public.orders
  where status <> 'cancelled'
  group by post_id;

-- ─────────────────────────────────────────────────────────────────────────
-- Viewer-relative orders view — the heart of the per-request mapping.
-- Call as: select * from orders_for_viewer where viewer_id = auth.uid()
-- (implemented as a SECURITY DEFINER function so auth.uid() is injected).
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
    -- counterpart = the OTHER participant relative to the viewer
    'counterpart', to_jsonb(cu.*) - 'email',
    -- check-in self/counterpart swap by role
    'checkIn', jsonb_build_object(
      'self', case when o.provider_id = auth.uid() then o.checkin_provider else o.checkin_customer end,
      'counterpart', case when o.provider_id = auth.uid() then o.checkin_customer else o.checkin_provider end
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
-- RPC: place_order — seat-cap + self-order checks under one transaction
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.place_order(p_post_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_post   public.posts;
  v_taken  int;
  v_order  uuid;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then raise exception 'Post not found'; end if;
  if v_post.author_id = auth.uid() then raise exception 'Cannot order your own post'; end if;
  select coalesce(seats_taken, 0) into v_taken from public.post_seats_taken where post_id = p_post_id;
  if coalesce(v_taken, 0) >= v_post.seats then raise exception 'This post is already full.'; end if;

  insert into public.orders (post_id, provider_id, customer_id, post_title_snapshot,
                             start_at, end_at, payment_status, fee_policy_version)
  values (v_post.id, v_post.author_id, auth.uid(), v_post.title,
          v_post.start_at, v_post.end_at,
          (case when v_post.price_cents_per_hour > 0 then 'authorized' else 'not_required' end)::payment_status,
          '0.mvp')
  returning id into v_order;
  return v_order;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- RPC: finalize_overdue_orders — the server cron replacing sweepAutoComplete.
-- Schedule with pg_cron: select cron.schedule('finalize','*/5 * * * *',
--   $$select public.finalize_overdue_orders()$$);
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.finalize_overdue_orders()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
  self_there bool; other_there bool;
begin
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

-- ─────────────────────────────────────────────────────────────────────────
-- Rating aggregate triggers (spec 0.7)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.apply_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- recipient inbound aggregate
  update public.users u set
    rating_received = ((u.rating_received * u.rating_received_count) + new.stars) / (u.rating_received_count + 1),
    rating_received_count = u.rating_received_count + 1
    where u.id = new.to_user_id;
  -- rater's PUBLIC given aggregate
  update public.users u set
    rating_given = ((u.rating_given * u.rating_given_count) + new.stars) / (u.rating_given_count + 1),
    rating_given_count = u.rating_given_count + 1
    where u.id = new.from_user_id;
  update public.orders set reviewed = true where id = new.order_id;
  return new;
end; $$;
create trigger trg_apply_rating after insert on public.ratings
  for each row execute function public.apply_rating();

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
alter table public.users    enable row level security;
alter table public.posts    enable row level security;
alter table public.orders   enable row level security;
alter table public.ratings  enable row level security;
alter table public.threads  enable row level security;
alter table public.messages enable row level security;
alter table public.thread_reads enable row level security;

-- users: anyone signed in can read public profiles; only self can write.
-- (Email is excluded from the public payload at the view/query layer.)
create policy users_read   on public.users for select using (auth.role() = 'authenticated');
create policy users_update on public.users for update using (id = auth.uid());

-- posts: read all (campus scoping can be added later); write only your own.
create policy posts_read   on public.posts for select using (auth.role() = 'authenticated');
create policy posts_insert on public.posts for insert with check (author_id = auth.uid());
create policy posts_update on public.posts for update using (author_id = auth.uid());
create policy posts_delete on public.posts for delete using (author_id = auth.uid());

-- orders: only the two participants can read/update their order.
create policy orders_read   on public.orders for select
  using (provider_id = auth.uid() or customer_id = auth.uid());
create policy orders_update on public.orders for update
  using (provider_id = auth.uid() or customer_id = auth.uid());
-- inserts go through place_order() (SECURITY DEFINER), so no direct insert policy.

-- ratings: a participant can rate their own order; both participants can read.
create policy ratings_insert on public.ratings for insert
  with check (from_user_id = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id
      and (o.provider_id = auth.uid() or o.customer_id = auth.uid())));
create policy ratings_read on public.ratings for select
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- chat: a participant can read/write their threads + messages.
create policy threads_rw on public.threads for all
  using (user_a = auth.uid() or user_b = auth.uid())
  with check (user_a = auth.uid() or user_b = auth.uid());
create policy messages_rw on public.messages for all
  using (exists (select 1 from public.threads t where t.id = thread_id
    and (t.user_a = auth.uid() or t.user_b = auth.uid())))
  with check (from_user_id = auth.uid());
create policy thread_reads_rw on public.thread_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- New-auth-user → public.users row
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name, email, campus_id, edu_verified)
  values (
    new.id,
    coalesce(split_part(new.email, '@', 1), 'Student'),
    new.email,
    coalesce(substring(new.email from '@([^.]+)\.edu$'), 'general'),
    (new.email ~* '\.edu$')
  ) on conflict (id) do nothing;
  return new;
end; $$;
create trigger trg_handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();
