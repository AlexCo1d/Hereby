-- 0015 — retire expired orderless posts.
--
-- A post whose agreed end time has passed without ever producing an order
-- (nobody joined) previously lingered as `open` forever. The client's My-Post
-- tab now retires such posts into History, and this makes the SERVER agree:
-- finalize_overdue_orders (the pg_cron heartbeat) closes them as `cancelled`,
-- mirroring the mock's sweepAutoComplete.
--
-- Posts that DID produce an order are represented by that order's terminal
-- state (completed / no_show / cancelled) and are intentionally left alone here
-- to avoid double-counting. This is a create-or-replace copying 0012's body
-- verbatim plus one new loop (c).

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

  -- (c) Retire expired orderless posts: an open post whose end time has passed
  --     and that never produced ANY order auto-closes as cancelled. The
  --     not-exists guard leaves posts with orders (pending/matched/terminal)
  --     to steps (a)/(b) and the order's own terminal state.
  for r in
    select p.id from public.posts p
    where p.status in ('open','pending','matched')
      and now() > p.end_at
      and not exists (select 1 from public.orders o where o.post_id = p.id)
  loop
    update public.posts set status = 'cancelled' where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end; $$;
