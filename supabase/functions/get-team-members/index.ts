import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Token de autenticação ausente." }, { status: 401, headers: corsHeaders });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Usuário não autenticado." }, { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !callerProfile) {
      return Response.json({ error: "Perfil não encontrado." }, { status: 404, headers: corsHeaders });
    }

    if (!["gerente", "admin"].includes(callerProfile.role)) {
      return Response.json({ error: "Acesso negado." }, { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const filterRole = url.searchParams.get("role") ?? "all";
    const search = url.searchParams.get("search") ?? "";
    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
    const offset = (page - 1) * limit;

    let teamMemberIds: string[] = [];

    if (callerProfile.role === "admin") {
      // Admin sees gestores, sucesso_cliente AND gerentes
      const roles = filterRole === "all"
        ? ["gestor", "sucesso_cliente", "gerente"]
        : [filterRole];
      const { data: allTeam } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("role", roles);
      teamMemberIds = (allTeam ?? []).map((p: any) => p.id);
    } else {
      // Gerente sees their direct subordinates (gestores, sucesso_cliente)
      const { data: relations } = await supabaseAdmin
        .from("user_relationships")
        .select("subordinate_id")
        .eq("superior_id", user.id);
      const subordinateIds = (relations ?? []).map((r: any) => r.subordinate_id);

      if (subordinateIds.length === 0) {
        return Response.json({ team_members: [], total: 0, page, limit, total_pages: 0 }, { status: 200, headers: corsHeaders });
      }

      const staffRoles = filterRole === "all" ? ["gestor", "sucesso_cliente"] : [filterRole];
      const { data: teamProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("id", subordinateIds)
        .in("role", staffRoles);
      teamMemberIds = (teamProfiles ?? []).map((p: any) => p.id);
    }

    if (teamMemberIds.length === 0) {
      return Response.json({ team_members: [], total: 0, page, limit, total_pages: 0 }, { status: 200, headers: corsHeaders });
    }

    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, avatar_url, role, is_active, created_at", { count: "exact" })
      .in("id", teamMemberIds)
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: teamMembers, error: teamError, count } = await query;

    if (teamError) {
      console.error("Erro ao buscar membros da equipe:", teamError);
      return Response.json({ error: "Erro ao buscar equipe." }, { status: 500, headers: corsHeaders });
    }

    const enrichedMembers = await Promise.all(
      (teamMembers ?? []).map(async (member: any) => {
        // Get subordinate relationships
        const { data: relations } = await supabaseAdmin
          .from("user_relationships")
          .select("subordinate_id")
          .eq("superior_id", member.id);
        const subordinateIds = (relations ?? []).map((r: any) => r.subordinate_id);

        // Get client profiles (subordinates with role=cliente)
        let clients: any[] = [];
        if (subordinateIds.length > 0) {
          const { data: clientProfiles } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, email, phone, role, is_active")
            .in("id", subordinateIds)
            .order("full_name", { ascending: true });
          clients = (clientProfiles ?? []).filter((p: any) => p.role === "cliente");
        }

        // Get the member's personal instance
        const { data: waInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, instance_name, status, is_personal")
          .eq("owner_id", member.id)
          .eq("is_personal", true)
          .maybeSingle();

        // Get WhatsApp instances for each client by looking up their tenant_id
        let clientInstances: any[] = [];
        const clientIds = clients.map((c: any) => c.id);
        if (clientIds.length > 0) {
          // Find tenant_ids for each client from user_roles
          const { data: clientRoles } = await supabaseAdmin
            .from("user_roles")
            .select("user_id, tenant_id")
            .in("user_id", clientIds);

          const clientTenantMap: Record<string, string> = {};
          (clientRoles ?? []).forEach((r: any) => {
            clientTenantMap[r.user_id] = r.tenant_id;
          });

          const tenantIds = [...new Set(Object.values(clientTenantMap))];
          if (tenantIds.length > 0) {
            const { data: tenantInstances } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("id, instance_name, display_name, status, tenant_id, phone_number")
              .in("tenant_id", tenantIds);
            clientInstances = tenantInstances ?? [];
          }

          // Map instances to clients by tenant_id
          clients = clients.map((c: any) => {
            const cTenantId = clientTenantMap[c.id];
            return {
              ...c,
              tenant_id: cTenantId || null,
              whatsapp_instances: clientInstances.filter((wi: any) => wi.tenant_id === cTenantId),
            };
          });
        } else {
          clients = clients.map((c: any) => ({ ...c, tenant_id: null, whatsapp_instances: [] }));
        }

        return {
          ...member,
          client_count: clients.length,
          clients,
          whatsapp_instance: waInstance
            ? { id: waInstance.id, instance_name: waInstance.instance_name, status: waInstance.status }
            : null,
        };
      })
    );

    return Response.json(
      {
        team_members: enrichedMembers,
        total: count ?? 0,
        page,
        limit,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Erro inesperado em get-team-members:", err);
    return Response.json({ error: "Erro interno do servidor." }, { status: 500, headers: corsHeaders });
  }
});
