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
    let token: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      token = url.searchParams.get("token");
    } else {
      const body = await req.json();
      token = body?.token ?? null;
    }

    if (!token) {
      return Response.json({ error: "Token não informado." }, { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invite, error } = await supabaseAdmin
      .from("invite_links")
      .select("id, token, role_to_assign, used, expires_at, created_by")
      .eq("token", token)
      .single();

    if (error || !invite) {
      return Response.json(
        { valid: false, error: "Este link de convite é inválido ou não existe." },
        { status: 404, headers: corsHeaders }
      );
    }

    if (invite.used) {
      return Response.json(
        { valid: false, error: "Este link de convite já foi utilizado." },
        { status: 410, headers: corsHeaders }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json(
        { valid: false, error: "Este link de convite expirou." },
        { status: 410, headers: corsHeaders }
      );
    }

    // Get creator info
    const { data: creator } = await supabaseAdmin
      .from("profiles")
      .select("full_name, role")
      .eq("id", invite.created_by)
      .single();

    return Response.json(
      {
        valid: true,
        invite: {
          id: invite.id,
          role_to_assign: invite.role_to_assign,
          expires_at: invite.expires_at,
          created_by_name: creator?.full_name ?? null,
          created_by_role: creator?.role ?? null,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Erro inesperado em validate-invite:", err);
    return Response.json({ error: "Erro interno do servidor." }, { status: 500, headers: corsHeaders });
  }
});
