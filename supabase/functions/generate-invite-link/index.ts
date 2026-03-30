import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CREATION_PERMISSIONS: Record<string, string[]> = {
  admin: ["gerente", "gestor", "sucesso_cliente", "cliente"],
  gerente: ["gestor", "sucesso_cliente", "cliente"],
  gestor: ["cliente"],
  sucesso_cliente: ["cliente"],
};

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
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !callerProfile) {
      return Response.json({ error: "Perfil do usuário não encontrado." }, { status: 404, headers: corsHeaders });
    }

    const body = await req.json();
    const { role_to_assign, gestor_id, cs_id } = body;

    if (!role_to_assign) {
      return Response.json({ error: "O campo role_to_assign é obrigatório." }, { status: 400, headers: corsHeaders });
    }

    const allowedRoles = CREATION_PERMISSIONS[callerProfile.role] ?? [];
    if (!allowedRoles.includes(role_to_assign)) {
      return Response.json(
        { error: `Você não tem permissão para criar contas do tipo "${role_to_assign}".` },
        { status: 403, headers: corsHeaders }
      );
    }

    // Validate gestor_id/cs_id if provided (only relevant for cliente invites)
    if (gestor_id) {
      const { data: gestorProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", gestor_id)
        .single();
      if (!gestorProfile || gestorProfile.role !== "gestor") {
        return Response.json({ error: "O gestor informado é inválido." }, { status: 400, headers: corsHeaders });
      }
    }

    if (cs_id) {
      const { data: csProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", cs_id)
        .single();
      if (!csProfile || csProfile.role !== "sucesso_cliente") {
        return Response.json({ error: "O CS informado é inválido." }, { status: 400, headers: corsHeaders });
      }
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const insertPayload: Record<string, unknown> = {
      token,
      created_by: user.id,
      role_to_assign,
      used: false,
      expires_at: expiresAt.toISOString(),
    };

    if (role_to_assign === "cliente") {
      if (gestor_id) insertPayload.gestor_id = gestor_id;
      if (cs_id) insertPayload.cs_id = cs_id;
    }

    const { data: invite, error: insertError } = await supabaseAdmin
      .from("invite_links")
      .insert(insertPayload)
      .select("id, token, role_to_assign, expires_at, gestor_id, cs_id")
      .single();

    if (insertError) {
      console.error("Erro ao inserir invite_link:", insertError);
      return Response.json({ error: "Erro ao gerar link de convite." }, { status: 500, headers: corsHeaders });
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://advanced-mkt.lovable.app";
    const inviteUrl = `${appUrl}/convite/${invite.token}`;

    return Response.json(
      {
        success: true,
        invite: {
          id: invite.id,
          url: inviteUrl,
          role_to_assign: invite.role_to_assign,
          expires_at: invite.expires_at,
          gestor_id: invite.gestor_id ?? null,
          cs_id: invite.cs_id ?? null,
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Erro inesperado em generate-invite-link:", err);
    return Response.json({ error: "Erro interno do servidor." }, { status: 500, headers: corsHeaders });
  }
});
