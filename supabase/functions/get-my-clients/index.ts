import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLES_WITH_CLIENTS = ["gestor", "sucesso_cliente", "gerente", "admin"];

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

    if (!ROLES_WITH_CLIENTS.includes(callerProfile.role)) {
      return Response.json({ error: "Acesso negado." }, { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? "";
    const status = url.searchParams.get("status") ?? "all";
    const responsible = url.searchParams.get("responsible_id") ?? "";
    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
    const offset = (page - 1) * limit;

    let clientIds: string[] = [];

    if (callerProfile.role === "admin") {
      const { data: allClients } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "cliente");
      clientIds = (allClients ?? []).map((c: any) => c.id);

    } else if (callerProfile.role === "gerente") {
      const { data: teamMembers } = await supabaseAdmin
        .from("user_relationships")
        .select("subordinate_id")
        .eq("superior_id", user.id);

      const teamIds = (teamMembers ?? []).map((r: any) => r.subordinate_id);

      const { data: directClients } = await supabaseAdmin
        .from("user_relationships")
        .select("subordinate_id")
        .eq("superior_id", user.id);

      const { data: teamClients } = teamIds.length > 0
        ? await supabaseAdmin
            .from("user_relationships")
            .select("subordinate_id")
            .in("superior_id", teamIds)
        : { data: [] };

      const allIds = new Set([
        ...(directClients ?? []).map((r: any) => r.subordinate_id),
        ...(teamClients ?? []).map((r: any) => r.subordinate_id),
      ]);

      if (allIds.size > 0) {
        const { data: clientProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .in("id", [...allIds])
          .eq("role", "cliente");
        clientIds = (clientProfiles ?? []).map((c: any) => c.id);
      }

    } else {
      const { data: directRelations } = await supabaseAdmin
        .from("user_relationships")
        .select("subordinate_id")
        .eq("superior_id", user.id);

      const directIds = (directRelations ?? []).map((r: any) => r.subordinate_id);

      if (directIds.length > 0) {
        const { data: clientProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .in("id", directIds)
          .eq("role", "cliente");
        clientIds = (clientProfiles ?? []).map((c: any) => c.id);
      }
    }

    if (clientIds.length === 0) {
      return Response.json({ clients: [], total: 0, page, limit, total_pages: 0 }, { status: 200, headers: corsHeaders });
    }

    let filteredIds = clientIds;
    if (responsible && ["admin", "gerente"].includes(callerProfile.role)) {
      const { data: responsibleClients } = await supabaseAdmin
        .from("user_relationships")
        .select("subordinate_id")
        .eq("superior_id", responsible);
      const responsibleIds = new Set((responsibleClients ?? []).map((r: any) => r.subordinate_id));
      filteredIds = clientIds.filter((id) => responsibleIds.has(id));
    }

    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, avatar_url, created_at, is_active, created_by", { count: "exact" })
      .in("id", filteredIds)
      .eq("role", "cliente")
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (status === "active") query = query.eq("is_active", true);
    else if (status === "inactive") query = query.eq("is_active", false);

    const { data: clients, error: clientsError, count } = await query;

    if (clientsError) {
      console.error("Erro ao buscar clientes:", clientsError);
      return Response.json({ error: "Erro ao buscar clientes." }, { status: 500, headers: corsHeaders });
    }

    // Enrich with creator name
    const enrichedClients = await Promise.all(
      (clients ?? []).map(async (client: any) => {
        let creator_name = null;
        if (client.created_by) {
          const { data: creator } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", client.created_by)
            .single();
          creator_name = creator?.full_name ?? null;
        }
        return { ...client, creator_name };
      })
    );

    return Response.json(
      {
        clients: enrichedClients,
        total: count ?? 0,
        page,
        limit,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Erro inesperado em get-my-clients:", err);
    return Response.json({ error: "Erro interno do servidor." }, { status: 500, headers: corsHeaders });
  }
});
