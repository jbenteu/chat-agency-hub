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
    const body = await req.json();
    const { token, first_name, last_name, email, password } = body;

    if (!token || !first_name || !last_name || !email || !password) {
      return Response.json(
        { error: "Todos os campos são obrigatórios: token, first_name, last_name, email, password." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "A senha deve ter no mínimo 8 caracteres." },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate invite token
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("invite_links")
      .select("id, token, role_to_assign, used, expires_at, created_by")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return Response.json(
        { error: "Este link de convite é inválido ou não existe." },
        { status: 404, headers: corsHeaders }
      );
    }

    if (invite.used) {
      return Response.json(
        { error: "Este link de convite já foi utilizado." },
        { status: 410, headers: corsHeaders }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return Response.json(
        { error: "Este link de convite expirou." },
        { status: 410, headers: corsHeaders }
      );
    }

    // Check if email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailAlreadyUsed = existingUsers?.users?.some(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (emailAlreadyUsed) {
      return Response.json(
        { error: "Este e-mail já está cadastrado. Tente fazer login." },
        { status: 409, headers: corsHeaders }
      );
    }

    // Create auth user
    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createUserError || !newAuthUser?.user) {
      console.error("Erro ao criar usuário no Auth:", createUserError);
      return Response.json(
        { error: "Erro ao criar conta. Tente novamente." },
        { status: 500, headers: corsHeaders }
      );
    }

    const newUserId = newAuthUser.user.id;
    const fullName = `${first_name.trim()} ${last_name.trim()}`;

    // Update profile (trigger already created basic one)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        email: email.toLowerCase(),
        role: invite.role_to_assign,
        created_by: invite.created_by,
      })
      .eq("id", newUserId);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      console.error("Erro ao atualizar profile:", profileError);
      return Response.json(
        { error: "Erro ao criar perfil. Tente novamente." },
        { status: 500, headers: corsHeaders }
      );
    }

    // Create hierarchy relationship
    const { error: relationError } = await supabaseAdmin
      .from("user_relationships")
      .insert({
        superior_id: invite.created_by,
        subordinate_id: newUserId,
      });

    if (relationError) {
      console.error("Aviso: Erro ao criar user_relationship:", relationError);
    }

    // Mark invite as used
    await supabaseAdmin
      .from("invite_links")
      .update({ used: true, used_by: newUserId })
      .eq("id", invite.id);

    return Response.json(
      {
        success: true,
        message: "Conta criada com sucesso! Você já pode fazer login.",
        user: {
          id: newUserId,
          full_name: fullName,
          email: email.toLowerCase(),
          role: invite.role_to_assign,
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Erro inesperado em register-via-invite:", err);
    return Response.json({ error: "Erro interno do servidor." }, { status: 500, headers: corsHeaders });
  }
});
