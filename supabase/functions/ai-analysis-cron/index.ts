import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  // Auth: must be service role or cron secret
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (token !== SUPABASE_SERVICE_ROLE_KEY && token !== CRON_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Find tenants with schedule enabled and next_run_at <= now
  const { data: dueSchedules } = await supabaseAdmin
    .from("ai_analysis_schedule")
    .select("tenant_id, frequency, day_of_week, time_of_day")
    .eq("enabled", true)
    .lte("next_run_at", new Date().toISOString());

  if (!dueSchedules || dueSchedules.length === 0) {
    return jsonResponse({ message: "No tenants due for analysis", processed: 0 });
  }

  const results: Array<{ tenant_id: string; status: string; error?: string }> = [];

  for (const schedule of dueSchedules) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-analysis`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "run_analysis",
          tenant_id: schedule.tenant_id,
        }),
      });

      const result = await resp.json();
      results.push({ tenant_id: schedule.tenant_id, status: resp.ok ? "triggered" : "error", error: resp.ok ? undefined : result.error });

      // Update next_run_at
      if (resp.ok) {
        const [h, m] = (schedule.time_of_day || "08:00").split(":").map(Number);
        const next = calcNextRunAt(schedule.frequency, schedule.day_of_week, `${h}:${m}`);
        await supabaseAdmin
          .from("ai_analysis_schedule")
          .update({ last_run_at: new Date().toISOString(), next_run_at: next })
          .eq("tenant_id", schedule.tenant_id);
      }
    } catch (err) {
      results.push({ tenant_id: schedule.tenant_id, status: "error", error: String(err) });
    }
  }

  return jsonResponse({ processed: dueSchedules.length, results });
});

function calcNextRunAt(frequency: string, dayOfWeek: number, timeOfDay: string): string {
  const now = new Date();
  const [h, m] = timeOfDay.split(":").map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);

  if (frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    const currentDay = next.getDay();
    let daysUntil = (dayOfWeek - currentDay + 7) % 7;
    if (daysUntil === 0 && next <= now) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
  } else if (frequency === "biweekly") {
    const currentDay = next.getDay();
    let daysUntil = (dayOfWeek - currentDay + 7) % 7;
    if (daysUntil === 0 && next <= now) daysUntil = 14;
    next.setDate(next.getDate() + daysUntil);
  } else if (frequency === "monthly") {
    next.setDate(1);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}
