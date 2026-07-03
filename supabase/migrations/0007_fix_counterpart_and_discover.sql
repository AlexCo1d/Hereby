-- 0007 — two correctness fixes found auditing mock↔supabase drift.
--
-- Fix 1: orders_for_viewer built `counterpart` with `to_jsonb(cu.*) - 'email'`.
--        That emits raw snake_case columns (wrong `User` shape → the order
--        screen crashed on counterpart.rating.toFixed) AND leaked the
--        counterpart's private columns (center_lat/lng, campus_id, custom_tags,
--        rating_given…). Every other view uses fn_user_json(); use it here too.
--
-- Fix 2: list_posts_for_viewer's tag filter only matched f_tags against
--        p.category with exact equality. The mock (services/mock/index.ts
--        applyFilter) fuzzy-matches selected tags against the FULL search
--        surface (category + tags + badges + title + description). Port that so
--        Discover tag filtering behaves identically on both backends.

-- ── search-surface helper (mirrors postSearchSurface in services/types.ts) ──
create or replace function public.fn_post_search_surface(p public.posts)
returns text language sql immutable as $$
  select lower(concat_ws(' ',
    p.category,
    array_to_string(p.tags, ' '),
    array_to_string(p.badges, ' '),
    p.title,
    coalesce(p.description, '')
  ));
$$;

-- ── Fix 1: orders_for_viewer — counterpart via fn_user_json ─────────────────
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
    -- counterpart = the OTHER participant relative to the viewer (email + all
    -- other private columns stripped by fn_user_json).
    'counterpart', public.fn_user_json(cu.*),
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

-- ── Fix 2: list_posts_for_viewer — full-surface fuzzy tag filter ────────────
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
            -- mirror mock applyFilter: any selected term matches anywhere in the
            -- search surface, either as a whole-term substring or via
            -- bidirectional word-level containment.
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
