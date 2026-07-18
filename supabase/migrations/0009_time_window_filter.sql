-- 0009 — parity: time-window facet in Discover.
--
-- The client now sends windowStart / windowEnd (ISO) in the DiscoverFilter JSON
-- (see FilterSheet.facetsToFilter — a same-day [from, to] window built by the
-- three time wheels). The mock backend keeps posts whose [start_at, end_at]
-- interval OVERLAPS the window; port the identical semantics here so both
-- backends filter the same way:
--   • overlap := start_at < windowEnd AND end_at > windowStart
--   • when either bound is absent the facet is inactive (no filtering).
--
-- Only the two parsed vars and one WHERE predicate are added vs 0008.

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
      -- skill-level facet (forgiving): no requirement OR level in set.
      and (cardinality(f_skilllevels) = 0
           or p.skill_mode is null or p.skill_mode = 'any'
           or (p.skill_level is not null and p.skill_level = any(f_skilllevels)))
      -- group-size facet: inclusive seat bounds.
      and (f_minseats is null or p.seats >= f_minseats)
      and (f_maxseats is null or p.seats <= f_maxseats)
      -- time-window facet: keep posts whose interval overlaps [start, end].
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
