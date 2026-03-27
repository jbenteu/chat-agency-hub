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

  // Require service role key in Authorization header for security
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Find all tenants with schedule enabled and next_run_at in the past
    const { data: dueSettings, error } = await supabase
      .from("ai_analysis_settings")
      .select("id, tenant_id, schedule_days, schedule_hour, schedule_minute, schedule_timezone")
      .eq("schedule_enabled", true)
      .lte("next_run_at", new Date().toISOString())
      .not("next_run_at", "is", null);

    if (error) throw error;

    const results: Array<{ tenant_id: string; status: string }> = [];

    for (const setting of dueSettings || []) {
      try {
        // Trigger analysis for this tenant
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-analysis`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: "analyze_all_conversations",
            payload: {
              internal_key: SUPABASE_SERVICE_ROLE_KEY,
              tenant_id: setting.tenant_id,
              limit: 30,
            },
          }),
        });

        const result = await resp.json();

        // Compute next run using DB function
        const { data: nextRun } = await supabase
          .rpc("compute_next_ai_run", {
            p_days: setting.schedule_days,
            p_hour: setting.schedule_hour,
            p_minute: setting.schedule_minute,
            p_timezone: setting.schedule_timezone,
          });

        await supabase
          .from("ai_analysis_settings")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun,
            updated_at: new Date().toISOString(),
          })
          .eq("id", setting.id);

        results.push({ tenant_id: setting.tenant_id, status: "ok" });
      } catch (e) {
        results.push({ tenant_id: setting.tenant_id, status: `error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    return jsonResponse({ processed: results.length, results });
  } catch (err) {
    console.error("Scheduler error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
