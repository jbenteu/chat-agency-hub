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
      .select("id, token, role_to_assign, used, expires_at, created_by, gestor_id, cs_id")
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

    // Create hierarchy relationship with invite creator
    const { error: relationError } = await supabaseAdmin
      .from("user_relationships")
      .insert({
        superior_id: invite.created_by,
        subordinate_id: newUserId,
      });

    if (relationError) {
      console.error("Aviso: Erro ao criar user_relationship (criador):", relationError);
    }

    // If this is a cliente invite with pre-assigned gestor/cs, wire up the relationships
    if (invite.role_to_assign === "cliente" && (invite.gestor_id || invite.cs_id)) {
      // Get the new user's tenant (created by the handle_new_user trigger)
      const { data: userRoleRow } = await supabaseAdmin
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", newUserId)
        .maybeSingle();

      const clientTenantId = userRoleRow?.tenant_id ?? null;

      // Create user_relationship and tenant_assignment for gestor
      if (invite.gestor_id) {
        const { error: gestorRelErr } = await supabaseAdmin
          .from("user_relationships")
          .insert({ superior_id: invite.gestor_id, subordinate_id: newUserId })
          .select()
          .maybeSingle();
        if (gestorRelErr) {
          console.error("Aviso: Erro ao criar user_relationship (gestor):", gestorRelErr);
        }

        if (clientTenantId) {
          const { error: gestorAssignErr } = await supabaseAdmin
            .from("tenant_assignments")
            .insert({
              manager_id: invite.gestor_id,
              tenant_id: clientTenantId,
              assigned_by: invite.created_by,
              notes: "Atribuído automaticamente via link de convite",
            });
          if (gestorAssignErr && gestorAssignErr.code !== "23505") {
            console.error("Aviso: Erro ao criar tenant_assignment (gestor):", gestorAssignErr);
          }
        }
      }

      // Create user_relationship and tenant_assignment for CS
      if (invite.cs_id) {
        const { error: csRelErr } = await supabaseAdmin
          .from("user_relationships")
          .insert({ superior_id: invite.cs_id, subordinate_id: newUserId })
          .select()
          .maybeSingle();
        if (csRelErr) {
          console.error("Aviso: Erro ao criar user_relationship (cs):", csRelErr);
        }

        if (clientTenantId) {
          const { error: csAssignErr } = await supabaseAdmin
            .from("tenant_assignments")
            .insert({
              manager_id: invite.cs_id,
              tenant_id: clientTenantId,
              assigned_by: invite.created_by,
              notes: "Atribuído automaticamente via link de convite",
            });
          if (csAssignErr && csAssignErr.code !== "23505") {
            console.error("Aviso: Erro ao criar tenant_assignment (cs):", csAssignErr);
          }
        }
      }
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
