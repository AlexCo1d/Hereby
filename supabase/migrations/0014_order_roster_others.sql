-- 0014 — group-activity roster: add checkIn.others to orders_for_viewer.
--
-- A group activity/event has one order row per joiner (order-per-customer). The
-- viewer's own row only carries `self` (them) and `counterpart` (the host), so
-- the taker's My-tab card could never render the OTHER joiners' faces. This
-- adds `checkIn.others` — every OTHER committed customer on the same post, with
-- their per-party check-in — mirroring the mock's RosterEntry[] shape so the
-- client's [host, self, …others] avatar stack works on the real backend too.
--
-- Defensive: the roster is a correlated subquery coalesced to '[]', so a post
-- with no other joiners (the common 1-on-1 case) simply gets an empty array and
-- the row is otherwise byte-for-byte the previous shape.

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
    'checkIn', jsonb_build_object(
      'self', case when o.provider_id = auth.uid() then o.checkin_provider else o.checkin_customer end,
      'counterpart', case when o.provider_id = auth.uid() then o.checkin_customer else o.checkin_provider end,
      -- Every OTHER committed customer on this post (not the viewer, not the
      -- host), each as { user, checkIn }, joined-order first.
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
          and o2.customer_id <> o.provider_id
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
