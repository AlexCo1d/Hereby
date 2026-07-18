// notify-order-request — emails a post author when someone takes their post.
//
// Fired best-effort by the trg_notify_order_request_email trigger (migration
// 0012) via pg_net, with body { notificationId, orderId }. This function looks
// up the recipient + actor + post, then sends one email through Resend. It is
// intentionally forgiving: any missing config or lookup miss returns 200 with a
// "skipped" note so the DB trigger (which ignores the response anyway) and the
// in-app notification — the real source of truth — are never disturbed.
//
// Deploy separately from the web bundle:
//   npx supabase functions deploy notify-order-request
// Required secrets (npx supabase secrets set ...):
//   • SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected in the platform)
//   • RESEND_API_KEY  — Resend API key
//   • ORDER_EMAIL_FROM (optional) — verified From address; defaults below
//   • APP_BASE_URL (optional) — used to deep-link the email button

import { createClient } from "jsr:@supabase/supabase-js@2";

const FROM = Deno.env.get("ORDER_EMAIL_FROM") ?? "Hereby <notify@hereby.app>";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://hereby-app.netlify.app";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: { notificationId?: string; orderId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { notificationId, orderId } = payload;
  if (!notificationId) return json({ skipped: "no notificationId" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ skipped: "missing service config" });
  if (!RESEND_API_KEY) return json({ skipped: "missing RESEND_API_KEY" });

  const admin = createClient(url, serviceKey);

  // The notification row carries recipient (user_id), actor (taker), and post.
  const { data: n, error: nErr } = await admin
    .from("notifications")
    .select("user_id, actor_id, post_id, order_id, kind")
    .eq("id", notificationId)
    .maybeSingle();
  if (nErr || !n) return json({ skipped: "notification not found" });
  if (n.kind !== "order_request") return json({ skipped: "not an order_request" });

  // Recipient email lives in auth.users; name/post come from the app tables.
  const [{ data: authUser }, { data: actor }, { data: post }] = await Promise.all([
    admin.auth.admin.getUserById(n.user_id),
    admin.from("users").select("name").eq("id", n.actor_id).maybeSingle(),
    admin.from("posts").select("title, order_no").eq("id", n.post_id).maybeSingle(),
  ]);

  const to = authUser?.user?.email;
  if (!to) return json({ skipped: "recipient has no email" });

  const takerName = actor?.name ?? "Someone";
  const postTitle = post?.title ?? "your post";
  const orderNo = post?.order_no ? `#${post.order_no}` : "";
  const link = (orderId ?? n.order_id)
    ? `${APP_BASE_URL}/order/${orderId ?? n.order_id}`
    : APP_BASE_URL;

  const subject = `${takerName} wants to join ${postTitle}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">New request on your post ${orderNo}</h2>
      <p style="color:#444;font-size:15px;line-height:1.5;margin:0 0 16px">
        <strong>${takerName}</strong> wants to join <strong>${postTitle}</strong>.
        You have 3 hours to accept or decline — after that it's automatically declined
        and your post re-opens.
      </p>
      <a href="${link}"
         style="display:inline-block;background:#F26A21;color:#fff;text-decoration:none;
                padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">
        Review request
      </a>
      <p style="color:#999;font-size:12px;margin-top:24px">
        You're receiving this because someone requested to join a post you created on Hereby.
      </p>
    </div>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return json({ error: "resend failed", status: resp.status, detail }, 502);
  }
  return json({ sent: true, to });
});
