import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Check if user is admin
    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
    const { data: appRole } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).limit(1).single();

    const isAdmin = profile?.role === "admin" || appRole?.role === "super_admin" || appRole?.role === "admin";
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "overview";

    if (req.method === "GET") {
      if (action === "overview") {
        const [tenantsRes, profilesRes, instancesRes, rolesRes] = await Promise.all([
          supabaseAdmin.from("tenants").select("id, name, slug, settings, created_at"),
          supabaseAdmin.from("profiles").select("id, full_name, email, role, is_active, created_at"),
          supabaseAdmin.from("whatsapp_instances").select("id, tenant_id, instance_name, display_name, status, phone_number, owner_id, created_at"),
          supabaseAdmin.from("user_roles").select("user_id, tenant_id, role"),
        ]);

        const tenants = tenantsRes.data || [];
        const profiles = profilesRes.data || [];
        const instances = instancesRes.data || [];
        const roles = rolesRes.data || [];

        // Enrich tenants with instance count, user count, and owner profile info
        const enrichedTenants = tenants.map((t: any) => {
          const tenantInstances = instances.filter((i: any) => i.tenant_id === t.id);
          const tenantUserRoles = roles.filter((r: any) => r.tenant_id === t.id);
          const maxInstances = t.settings?.max_whatsapp_instances ?? 3;

          // Find the owner (user with admin role in this tenant) and their profile
          const ownerRole = tenantUserRoles.find((r: any) => r.role === "admin");
          const ownerProfile = ownerRole
            ? profiles.find((p: any) => p.id === ownerRole.user_id)
            : null;

          return {
            ...t,
            instance_count: tenantInstances.length,
            connected_count: tenantInstances.filter((i: any) => i.status === "connected").length,
            user_count: tenantUserRoles.length,
            max_whatsapp_instances: maxInstances,
            instances: tenantInstances,
            owner_name: ownerProfile?.full_name || null,
            owner_email: ownerProfile?.email || null,
            owner_role: ownerProfile?.role || null,
          };
        });

        return new Response(JSON.stringify({
          stats: {
            total_tenants: tenants.length,
            total_users: profiles.length,
            active_users: profiles.filter((p: any) => p.is_active !== false).length,
            total_instances: instances.length,
            connected_instances: instances.filter((i: any) => i.status === "connected").length,
          },
          tenants: enrichedTenants,
          profiles,
          instances,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (req.method === "POST") {
      const body = await req.json();

      if (action === "update_tenant_settings") {
        const { tenant_id, settings } = body;
        if (!tenant_id) return new Response(JSON.stringify({ error: "tenant_id required" }), { status: 400, headers: corsHeaders });

        const { data: existing } = await supabaseAdmin.from("tenants").select("settings").eq("id", tenant_id).single();
        const mergedSettings = { ...(existing?.settings || {}), ...settings };

        const { error } = await supabaseAdmin.from("tenants").update({ settings: mergedSettings }).eq("id", tenant_id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "toggle_user_status") {
        const { user_id, is_active } = body;
        if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: corsHeaders });

        const { error } = await supabaseAdmin.from("profiles").update({ is_active }).eq("id", user_id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
