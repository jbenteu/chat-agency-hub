import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const decodeJwtSub = (jwt: string): string | null => {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
};

const fetchWithTimeout = (url: string, init: RequestInit, ms = 8000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!ANTHROPIC_API_KEY) return jsonResponse({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return jsonResponse({ error: "Supabase environment is not configured" }, 500);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action as string | undefined;
  const payload = (body.payload || {}) as Record<string, unknown>;
  if (!action) return jsonResponse({ error: "action is required" }, 400);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  let tenantId: string | null = null;
  let userId: string | null = null;

  // Internal call from webhook
  const internalKey = payload.internal_key as string | undefined;
  if (internalKey && internalKey === SUPABASE_SERVICE_ROLE_KEY) {
    tenantId = payload.tenant_id as string;
    if (!tenantId) return jsonResponse({ error: "tenant_id required for internal calls" }, 400);
  } else {
    const rawAuthHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const bearerMatch = rawAuthHeader?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) return jsonResponse({ error: "Unauthorized" }, 401);

    const token = bearerMatch[1]?.trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (!authError && authData?.user?.id) {
      userId = authData.user.id;
    }
    if (!userId) {
      const jwtSub = decodeJwtSub(token);
      if (jwtSub) {
        const { data: fbUser } = await supabaseAdmin.auth.admin.getUserById(jwtSub);
        if (fbUser?.user?.id) userId = fbUser.user.id;
      }
    }
    if (!userId) return jsonResponse({ error: "Invalid token" }, 401);

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .limit(1)
      .single();
    if (!roleData?.tenant_id) return jsonResponse({ error: "User has no tenant assigned" }, 403);
    tenantId = roleData.tenant_id;

    // ── Cross-tenant access for gestores/gerentes/CS ───────────────────────
    // If caller provides a target_tenant_id, validate they have access to it
    const targetTenantId = payload.target_tenant_id as string | undefined;
    if (targetTenantId && targetTenantId !== tenantId) {
      const callerRole = roleData.role as string;
      const isManagerRole = ["gerente", "gestor", "sucesso_cliente", "admin"].includes(callerRole);
      if (!isManagerRole) {
        return jsonResponse({ error: "Acesso negado ao tenant solicitado" }, 403);
      }
      // For gerente/admin: check if target tenant is accessible via any team member's assignment
      // For gestor/CS: check direct assignment
      let hasAccess = false;
      if (callerRole === "gerente" || callerRole === "admin") {
        // Gerente can access any tenant assigned to any member of their organization
        const { data: assignmentCheck } = await supabaseAdmin
          .from("tenant_assignments")
          .select("id")
          .eq("tenant_id", targetTenantId)
          .limit(1)
          .maybeSingle();
        hasAccess = !!assignmentCheck;
      } else {
        const { data: assignmentCheck } = await supabaseAdmin
          .from("tenant_assignments")
          .select("id")
          .eq("manager_id", userId)
          .eq("tenant_id", targetTenantId)
          .limit(1)
          .maybeSingle();
        hasAccess = !!assignmentCheck;
      }
      if (!hasAccess) {
        return jsonResponse({ error: "Acesso negado ao tenant solicitado" }, 403);
      }
      tenantId = targetTenantId;
    }
  }

  // ── list_accessible_tenants ─────────────────────────────────────────────────
  if (action === "list_accessible_tenants") {
    if (!userId) return jsonResponse({ tenants: [], team_members: [] });
    const { data: myRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const callerRole = myRole?.role as string | undefined;

    let accessibleTenantIds: string[] = [];
    let teamMembers: Array<{ id: string; name: string; role: string; tenant_ids: string[] }> = [];

    if (callerRole === "gerente" || callerRole === "admin") {
      // Load all gestores/CS profiles + their assignments
      const { data: memberProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["gestor", "sucesso_cliente"]);
      const memberIds = (memberProfiles || []).map((p: any) => p.id);
      if (memberIds.length > 0) {
        const { data: allAssignments } = await supabaseAdmin
          .from("tenant_assignments")
          .select("manager_id, tenant_id")
          .in("manager_id", memberIds);
        const memberTenantMap: Record<string, string[]> = {};
        (allAssignments || []).forEach((a: any) => {
          if (!memberTenantMap[a.manager_id]) memberTenantMap[a.manager_id] = [];
          memberTenantMap[a.manager_id].push(a.tenant_id);
          if (!accessibleTenantIds.includes(a.tenant_id)) accessibleTenantIds.push(a.tenant_id);
        });
        teamMembers = (memberProfiles || []).map((p: any) => ({
          id: p.id,
          name: p.full_name || "Sem nome",
          role: p.role,
          tenant_ids: memberTenantMap[p.id] || [],
        })).filter((m) => m.tenant_ids.length > 0);
      }
    } else if (callerRole === "gestor" || callerRole === "sucesso_cliente") {
      const { data: assignments } = await supabaseAdmin
        .from("tenant_assignments")
        .select("tenant_id")
        .eq("manager_id", userId);
      accessibleTenantIds = (assignments || []).map((a: any) => a.tenant_id);
    }

    // Fetch tenant names + instances
    let tenants: Array<{ id: string; name: string; instances: Array<{ id: string; display_name: string | null; instance_name: string; status: string }> }> = [];
    if (accessibleTenantIds.length > 0) {
      const { data: tenantRows } = await supabaseAdmin
        .from("tenants")
        .select("id, name")
        .in("id", accessibleTenantIds);
      const { data: instanceRows } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, tenant_id, display_name, instance_name, status")
        .in("tenant_id", accessibleTenantIds);
      const instancesByTenant: Record<string, any[]> = {};
      (instanceRows || []).forEach((i: any) => {
        if (!instancesByTenant[i.tenant_id]) instancesByTenant[i.tenant_id] = [];
        instancesByTenant[i.tenant_id].push(i);
      });
      tenants = (tenantRows || []).map((t: any) => ({
        id: t.id,
        name: t.name || "Cliente",
        instances: instancesByTenant[t.id] || [],
      }));
    }

    return jsonResponse({ tenants, team_members: teamMembers });
  }

  // ─── Instance helper ───────────────────────────────────────────────────────
  // Returns conversation IDs for a specific instance, or null (= no filter)
  const getInstanceConvIds = async (instanceId: string | null): Promise<string[] | null> => {
    if (!instanceId) return null;
    const { data } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id")
      .eq("tenant_id", tenantId!)
      .eq("instance_id", instanceId);
    return (data || []).map((c: { id: string }) => c.id);
  };

  // Applies instance filter to an analysis query
  // deno-lint-ignore no-explicit-any
  const applyConvFilter = (
    query: any,
    convIds: string[] | null,
  ) => {
    if (convIds === null) return query;
    if (convIds.length === 0) return query.eq("conversation_id", "00000000-0000-0000-0000-000000000000");
    return query.in("conversation_id", convIds);
  };

  // Extracts JSON from Anthropic response text — handles markdown code blocks
  const extractJson = (text: string): Record<string, unknown> => {
    const clean = text.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    // Try clean first, then try to extract first { ... } block
    try { return JSON.parse(clean); } catch { /* fall through */ }
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("No valid JSON found");
  };

  // ─── Anthropic helper ──────────────────────────────────────────────────────
  const callAnthropic = async (
    model: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    userMessage: string,
    apiKey: string = ANTHROPIC_API_KEY,
  ) => {
    const anthropicBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userMessage }],
    };
    if (systemPrompt) anthropicBody.system = systemPrompt;

    const resp = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
      },
      30000,
    );
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic error:", resp.status, errText);
      throw new Error(`Anthropic API error: ${resp.status}`);
    }
    return await resp.json();
  };

  // ─── OpenAI helper ─────────────────────────────────────────────────────────
  const callOpenAI = async (
    model: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    userMessage: string,
    apiKey: string,
  ) => {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: userMessage });
    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
      },
      30000,
    );
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI API error: ${resp.status} ${errText.substring(0, 200)}`);
    }
    const json = await resp.json();
    return { content: [{ text: json.choices?.[0]?.message?.content ?? "" }] };
  };

  // ─── Tenant AI settings ────────────────────────────────────────────────────
  interface TenantSettings {
    provider: "anthropic" | "openai";
    analysis_model: string;
    insights_model: string;
    api_key: string | null;
    avg_ticket_brl: number;
  }

  // Load global settings from ai_system_settings (admin-controlled singleton)
  const loadTenantSettings = async (_tid: string): Promise<TenantSettings> => {
    const { data } = await supabaseAdmin
      // deno-lint-ignore no-explicit-any
      .from("ai_system_settings" as any)
      .select("provider, analysis_model, insights_model, api_key, avg_ticket_brl")
      .limit(1)
      .maybeSingle();
    const g = (data as Record<string, unknown>) || {};
    return {
      provider: (g.provider as "anthropic" | "openai") || "anthropic",
      analysis_model: (g.analysis_model as string) || "claude-haiku-4-5-20251001",
      insights_model: (g.insights_model as string) || "claude-sonnet-4-6",
      api_key: (g.api_key as string | null) || null,
      avg_ticket_brl: Number(g.avg_ticket_brl) || 2500,
    };
  };

  // Load global system settings (for admin panel)
  const loadSystemSettings = async () => {
    const { data } = await supabaseAdmin
      // deno-lint-ignore no-explicit-any
      .from("ai_system_settings" as any)
      .select("*")
      .limit(1)
      .maybeSingle();
    return (data as Record<string, unknown>) || {};
  };

  // Unified AI caller — dispatches to correct provider using tenant settings
  const callAI = async (
    settings: TenantSettings,
    model: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    userMessage: string,
  ) => {
    const key = settings.api_key || (settings.provider === "openai" ? "" : ANTHROPIC_API_KEY);
    if (settings.provider === "openai") {
      if (!key) throw new Error("Chave de API OpenAI não configurada. Configure nas Configurações > IA.");
      return callOpenAI(model, maxTokens, systemPrompt, userMessage, key);
    }
    return callAnthropic(model, maxTokens, systemPrompt, userMessage, key || ANTHROPIC_API_KEY);
  };

  try {
    // ─── Load tenant AI settings (used by all AI actions) ─────────────────
    const tenantSettings: TenantSettings = tenantId
      ? await loadTenantSettings(tenantId)
      : { provider: "anthropic", analysis_model: "claude-haiku-4-5-20251001", insights_model: "claude-sonnet-4-6", api_key: null, avg_ticket_brl: 2500 };

    // ─── get_ai_settings (legacy — redirects to global system settings) ──────
    if (action === "get_ai_settings") {
      const s = await loadSystemSettings();
      return jsonResponse({
        provider: s.provider || "anthropic",
        analysis_model: s.analysis_model || "claude-haiku-4-5-20251001",
        insights_model: s.insights_model || "claude-sonnet-4-6",
        api_key_configured: !!(s.api_key),
        avg_ticket_brl: Number(s.avg_ticket_brl) || 2500,
        schedule_enabled: s.schedule_enabled || false,
        schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
        schedule_hour: s.schedule_hour ?? 8,
        schedule_minute: s.schedule_minute ?? 0,
        schedule_timezone: s.schedule_timezone || "America/Sao_Paulo",
        max_history_runs: Number(s.max_history_runs) || 10,
        last_run_at: s.last_run_at || null,
        next_run_at: s.next_run_at || null,
      });
    }

    // ─── get_system_settings (admin panel) ───────────────────────────────────
    if (action === "get_system_settings") {
      const s = await loadSystemSettings();
      return jsonResponse({
        provider: s.provider || "anthropic",
        analysis_model: s.analysis_model || "claude-haiku-4-5-20251001",
        insights_model: s.insights_model || "claude-sonnet-4-6",
        api_key_configured: !!(s.api_key),
        avg_ticket_brl: Number(s.avg_ticket_brl) || 2500,
        schedule_enabled: s.schedule_enabled || false,
        schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
        schedule_hour: s.schedule_hour ?? 8,
        schedule_minute: s.schedule_minute ?? 0,
        schedule_timezone: s.schedule_timezone || "America/Sao_Paulo",
        max_history_runs: Number(s.max_history_runs) || 10,
        last_run_at: s.last_run_at || null,
        next_run_at: s.next_run_at || null,
      });
    }

    // ─── update_system_settings (admin only) ─────────────────────────────────
    if (action === "update_system_settings" || action === "update_ai_settings") {
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      const callerRole = (roleCheck as Record<string, unknown>)?.role as string | undefined;
      if (!callerRole || !["admin", "super_admin"].includes(callerRole)) {
        return jsonResponse({ error: "Apenas administradores podem alterar as configurações de IA." }, 403);
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (payload.provider !== undefined) updates.provider = payload.provider;
      if (payload.analysis_model !== undefined) updates.analysis_model = payload.analysis_model;
      if (payload.insights_model !== undefined) updates.insights_model = payload.insights_model;
      if (payload.api_key) updates.api_key = payload.api_key;
      if (payload.avg_ticket_brl !== undefined) updates.avg_ticket_brl = Number(payload.avg_ticket_brl);
      if (payload.schedule_enabled !== undefined) updates.schedule_enabled = payload.schedule_enabled;
      if (payload.schedule_days !== undefined) updates.schedule_days = payload.schedule_days;
      if (payload.schedule_hour !== undefined) updates.schedule_hour = Number(payload.schedule_hour);
      if (payload.schedule_minute !== undefined) updates.schedule_minute = Number(payload.schedule_minute);
      if (payload.schedule_timezone !== undefined) updates.schedule_timezone = payload.schedule_timezone;
      if (payload.max_history_runs !== undefined) updates.max_history_runs = Number(payload.max_history_runs);

      if (updates.schedule_enabled) {
        const { data: nextRun } = await supabaseAdmin.rpc("compute_next_ai_run", {
          p_days: (updates.schedule_days || [1, 2, 3, 4, 5]) as number[],
          p_hour: Number(updates.schedule_hour ?? 8),
          p_minute: Number(updates.schedule_minute ?? 0),
          p_timezone: (updates.schedule_timezone || "America/Sao_Paulo") as string,
        });
        if (nextRun) updates.next_run_at = nextRun;
      } else if (updates.schedule_enabled === false) {
        updates.next_run_at = null;
      }

      // Upsert the singleton row (get existing ID or insert new row)
      // deno-lint-ignore no-explicit-any
      const { data: existingRow } = await (supabaseAdmin.from("ai_system_settings" as any) as any)
        .select("id")
        .limit(1)
        .maybeSingle();

      let upsertError;
      if (existingRow?.id) {
        // Row exists — update by known ID
        const { error } = await supabaseAdmin
          // deno-lint-ignore no-explicit-any
          .from("ai_system_settings" as any)
          .update(updates)
          .eq("id", existingRow.id);
        upsertError = error;
      } else {
        // No row yet — insert
        const { error } = await supabaseAdmin
          // deno-lint-ignore no-explicit-any
          .from("ai_system_settings" as any)
          .insert(updates);
        upsertError = error;
      }
      if (upsertError) throw upsertError;
      return jsonResponse({ success: true });
    }


    // ─── analyze_conversation ──────────────────────────────────────────────
    if (action === "analyze_conversation") {
      const conversationId = payload.conversation_id as string;
      if (!conversationId) return jsonResponse({ error: "conversation_id is required" }, 400);

      // Verify conversation belongs to tenant
      const { data: conv } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!conv) return jsonResponse({ error: "Conversation not found" }, 404);

      // Fetch last 60 messages
      const { data: messages } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("direction, content, created_at")
        .eq("tenant_id", tenantId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(60);

      if (!messages || messages.length === 0)
        return jsonResponse({ error: "No messages to analyze" }, 422);

      // Calculate hours without response
      const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
      const horasSemResposta = lastInbound
        ? (Date.now() - new Date(lastInbound.created_at).getTime()) / 3600000
        : 0;

      const transcript = messages
        .map(
          (m: { direction: string; content: string | null }) =>
            `${m.direction === "outbound" ? "Atendente" : "Cliente"}: ${m.content || "[mídia]"}`,
        )
        .join("\n");

      const userMessage = `Analise esta conversa de joalheria e retorne JSON com exatamente estas chaves:
{
  "sentimento": "positivo" | "neutro" | "frustrado",
  "produto_interesse": string ou null (ex: "anel de noivado", "aliança", "brinco"),
  "objecao_detectada": string ou null (ex: "preço alto", "vai pensar", "comparando concorrente"),
  "score_qualidade": número 1-10 (qualidade geral do atendimento),
  "score_empatia": número 1-10,
  "score_clareza": número 1-10 (clareza na apresentação do produto/preço),
  "score_velocidade": número 1-10 (baseado em ${horasSemResposta.toFixed(1)}h sem resposta — 10 = respondeu rápido, 1 = demorou muito),
  "score_followup": número 1-10 (fez acompanhamento pós-orçamento?),
  "score_contorno_objecao": número 1-10 (lidou bem com objeções?),
  "score_cta": número 1-10 (fez chamada para ação clara?),
  "score_personalizacao": número 1-10 (personalizou a abordagem?),
  "status_lead": "quente" | "morno" | "frio" | "perdido",
  "resumo": string máximo 120 caracteres descrevendo o estado da conversa
}

Conversa (${messages.length} mensagens):
${transcript}`;

      const data = await callAI(
        tenantSettings,
        tenantSettings.analysis_model,
        600,
        "Você analisa conversas de WhatsApp de joalherias. Responda APENAS com JSON válido, sem texto extra, sem markdown.",
        userMessage,
      );

      let analysis: Record<string, unknown>;
      try {
        analysis = extractJson(data.content[0].text);
      } catch {
        return jsonResponse({ error: "Failed to parse AI response as JSON" }, 422);
      }

      // Upsert analysis
      const { error: upsertErr } = await supabaseAdmin
        .from("ai_conversation_analysis")
        .upsert(
          {
            conversation_id: conversationId,
            tenant_id: tenantId,
            sentimento: analysis.sentimento,
            produto_interesse: analysis.produto_interesse,
            objecao_detectada: analysis.objecao_detectada,
            score_qualidade: analysis.score_qualidade,
            score_empatia: analysis.score_empatia,
            score_clareza: analysis.score_clareza,
            score_velocidade: analysis.score_velocidade,
            score_followup: analysis.score_followup,
            score_contorno_objecao: analysis.score_contorno_objecao,
            score_cta: analysis.score_cta,
            score_personalizacao: analysis.score_personalizacao,
            status_lead: analysis.status_lead,
            resumo: analysis.resumo,
            horas_sem_resposta: Math.round(horasSemResposta * 10) / 10,
            analyzed_at: new Date().toISOString(),
          },
          { onConflict: "conversation_id" },
        );

      if (upsertErr) {
        console.error("Upsert analysis error:", upsertErr);
        return jsonResponse({ error: "Failed to save analysis" }, 500);
      }

      // Update queue
      await supabaseAdmin
        .from("ai_analysis_queue")
        .update({ status: "done" })
        .eq("conversation_id", conversationId);

      // Invalidate cache
      await supabaseAdmin
        .from("ai_dashboard_cache")
        .delete()
        .eq("tenant_id", tenantId);

      return jsonResponse({ success: true, analysis });
    }

    // ─── process_queue ────────────────────────────────────────────────────
    if (action === "process_queue") {
      const instanceId = (payload.instance_id as string | undefined) || null;
      const limit = Math.min((payload.limit as number | undefined) || 2, 4);

      // Helper: analyze a single conversation and save result
      const analyzeOne = async (conversationId: string): Promise<boolean> => {
        try {
          // Skip if already has a recent analysis (< 1 hour old) to avoid redundant Anthropic calls
          const { data: existing } = await supabaseAdmin
            .from("ai_conversation_analysis")
            .select("analyzed_at")
            .eq("conversation_id", conversationId)
            .maybeSingle();
          if (existing?.analyzed_at) {
            const ageMs = Date.now() - new Date(existing.analyzed_at).getTime();
            if (ageMs < 3600000) return true; // already fresh — skip
          }

          const { data: messages } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("direction, content, created_at")
            .eq("tenant_id", tenantId!)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
            .limit(60);

          if (!messages || messages.length === 0) return false;

          const lastInbound = [...messages].reverse().find((m: { direction: string }) => m.direction === "inbound");
          const horasSemResposta = lastInbound
            ? (Date.now() - new Date((lastInbound as { created_at: string }).created_at).getTime()) / 3600000
            : 0;

          const transcript = messages
            .map((m: { direction: string; content: string | null }) =>
              `${m.direction === "outbound" ? "Atendente" : "Cliente"}: ${m.content || "[mídia]"}`)
            .join("\n");

          const aiData = await callAI(
            tenantSettings,
            tenantSettings.analysis_model,
            600,
            "Você analisa conversas de WhatsApp de joalherias. Responda APENAS com JSON válido, sem texto extra, sem markdown.",
            `Analise esta conversa de joalheria e retorne JSON com exatamente estas chaves:
{"sentimento":"positivo"|"neutro"|"frustrado","produto_interesse":string|null,"objecao_detectada":string|null,"score_qualidade":1-10,"score_empatia":1-10,"score_clareza":1-10,"score_velocidade":1-10,"score_followup":1-10,"score_contorno_objecao":1-10,"score_cta":1-10,"score_personalizacao":1-10,"status_lead":"quente"|"morno"|"frio"|"perdido","resumo":string}
Velocidade baseada em ${horasSemResposta.toFixed(1)}h sem resposta.
Conversa (${messages.length} msgs):\n${transcript}`,
          );

          let analysis: Record<string, unknown>;
          try { analysis = extractJson(aiData.content[0].text); } catch (e) {
            console.error("[analyzeOne] JSON parse error:", e, "raw:", aiData.content?.[0]?.text?.substring(0, 200));
            return false;
          }

          const analysisRecord = {
            conversation_id: conversationId,
            tenant_id: tenantId!,
            sentimento: analysis.sentimento,
            produto_interesse: analysis.produto_interesse,
            objecao_detectada: analysis.objecao_detectada,
            score_qualidade: analysis.score_qualidade,
            score_empatia: analysis.score_empatia,
            score_clareza: analysis.score_clareza,
            score_velocidade: analysis.score_velocidade,
            score_followup: analysis.score_followup,
            score_contorno_objecao: analysis.score_contorno_objecao,
            score_cta: analysis.score_cta,
            score_personalizacao: analysis.score_personalizacao,
            status_lead: analysis.status_lead,
            resumo: analysis.resumo,
            horas_sem_resposta: Math.round(horasSemResposta * 10) / 10,
            analyzed_at: new Date().toISOString(),
          };

          if (existing) {
            // Row exists — UPDATE
            const { error: updateErr } = await supabaseAdmin
              .from("ai_conversation_analysis")
              .update(analysisRecord)
              .eq("conversation_id", conversationId)
              .eq("tenant_id", tenantId!);
            if (updateErr) {
              console.error("[analyzeOne] update error:", updateErr.message);
              return false;
            }
          } else {
            // No row — INSERT
            const { error: insertErr } = await supabaseAdmin
              .from("ai_conversation_analysis")
              .insert(analysisRecord);
            if (insertErr) {
              // Could be a race (another process inserted) — try update as fallback
              const { error: fallbackErr } = await supabaseAdmin
                .from("ai_conversation_analysis")
                .update(analysisRecord)
                .eq("conversation_id", conversationId)
                .eq("tenant_id", tenantId!);
              if (fallbackErr) {
                console.error("[analyzeOne] insert+fallback error:", insertErr.message, fallbackErr.message);
                return false;
              }
            }
          }
          return true;
        } catch (e) {
          console.error("[analyzeOne] error:", e);
          return false;
        }
      };

      // Reset "processing" items (abandoned) and "error" items (retry) back to pending.
      await supabaseAdmin.from("ai_analysis_queue")
        .update({ status: "pending" })
        .eq("tenant_id", tenantId!)
        .in("status", ["processing", "error"]);

      // Get pending queue items for this tenant (optionally filtered by instance)
      let queueQuery = supabaseAdmin
        .from("ai_analysis_queue")
        .select("id, conversation_id")
        .eq("tenant_id", tenantId!)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(limit * 2); // fetch extra to account for instance filter

      const { data: queueItems } = await queueQuery;

      if (!queueItems || queueItems.length === 0) {
        // Queue empty — find unanalyzed conversations and queue them
        let convQuery = supabaseAdmin
          .from("whatsapp_conversations")
          .select("id")
          .eq("tenant_id", tenantId!)
          .order("last_message_at", { ascending: false })
          .limit(50);
        if (instanceId) convQuery = convQuery.eq("instance_id", instanceId);

        const { data: allConvs } = await convQuery;
        if (!allConvs || allConvs.length === 0) {
          return jsonResponse({ processed: 0, remaining: 0 });
        }

        // Find which ones have no analysis
        const { data: existingAnalyses } = await supabaseAdmin
          .from("ai_conversation_analysis")
          .select("conversation_id")
          .eq("tenant_id", tenantId!)
          .in("conversation_id", allConvs.map((c: { id: string }) => c.id));

        const analyzedSet = new Set((existingAnalyses || []).map((a: { conversation_id: string }) => a.conversation_id));
        const toQueue = allConvs
          .filter((c: { id: string }) => !analyzedSet.has(c.id))
          .slice(0, limit);

        if (toQueue.length === 0) return jsonResponse({ processed: 0, remaining: 0 });

        // Insert to queue
        await supabaseAdmin.from("ai_analysis_queue").upsert(
          toQueue.map((c: { id: string }) => ({
            conversation_id: c.id,
            tenant_id: tenantId!,
            status: "pending",
            priority: "normal",
          })),
          { onConflict: "conversation_id" }
        );

        // Process immediately
        let processed = 0;
        for (const conv of toQueue.slice(0, limit)) {
          const ok = await analyzeOne(conv.id);
          await supabaseAdmin.from("ai_analysis_queue").update({ status: ok ? "done" : "error" }).eq("conversation_id", conv.id);
          if (ok) processed++;
        }

        if (processed > 0) {
          await supabaseAdmin.from("ai_dashboard_cache").delete().eq("tenant_id", tenantId!);
        }

        // Count remaining unanalyzed in the full set
        const remaining = allConvs.filter((c: { id: string }) => !analyzedSet.has(c.id)).length - processed;
        return jsonResponse({ processed, remaining: Math.max(0, remaining) });
      }

      // Filter by instance if needed
      let filteredItems = queueItems;
      if (instanceId) {
        const filterConvIds = await getInstanceConvIds(instanceId);
        if (filterConvIds !== null) {
          const filterSet = new Set(filterConvIds);
          filteredItems = queueItems.filter((item: { conversation_id: string }) => filterSet.has(item.conversation_id));
        }
      }
      filteredItems = filteredItems.slice(0, limit);

      let processed = 0;
      for (const item of filteredItems) {
        // Mark as processing to prevent double-processing
        await supabaseAdmin.from("ai_analysis_queue").update({ status: "processing" }).eq("id", item.id);

        const ok = await analyzeOne(item.conversation_id as string);
        await supabaseAdmin.from("ai_analysis_queue")
          .update({ status: ok ? "done" : "error" })
          .eq("id", item.id);
        if (ok) processed++;
      }

      // Get remaining count
      const { count: remaining } = await supabaseAdmin
        .from("ai_analysis_queue")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .eq("status", "pending");

      if (processed > 0) {
        await supabaseAdmin.from("ai_dashboard_cache").delete().eq("tenant_id", tenantId!);
      }

      return jsonResponse({ processed, remaining: remaining ?? 0 });
    }

    // ─── Helper: build dashboard context ─────────────────────────────────
    const buildDashboardContext = async (convIds: string[] | null = null, instanceId: string | null = null) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();

      // Base conversation query with optional instance filter
      const convBase = () => {
        let q = supabaseAdmin.from("whatsapp_conversations").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!);
        if (instanceId) q = q.eq("instance_id", instanceId);
        return q;
      };
      // deno-lint-ignore no-explicit-any
      const analysisBase = (): any => applyConvFilter(
        supabaseAdmin.from("ai_conversation_analysis").select("*").eq("tenant_id", tenantId!),
        convIds,
      );

      const [convCount, leadsNoReply, avgScore, topProdutos, topObjecoes, leadsByStatus, avgScores] =
        await Promise.all([
          convBase().gte("last_message_at", thirtyDaysAgo),
          convBase().lt("last_message_at", twoHoursAgo).gte("last_message_at", thirtyDaysAgo),
          analysisBase().select("score_qualidade").gte("analyzed_at", thirtyDaysAgo),
          analysisBase().select("produto_interesse").gte("analyzed_at", thirtyDaysAgo).not("produto_interesse", "is", null),
          analysisBase().select("objecao_detectada").gte("analyzed_at", thirtyDaysAgo).not("objecao_detectada", "is", null),
          analysisBase().select("status_lead").gte("analyzed_at", thirtyDaysAgo),
          analysisBase().select("score_empatia, score_clareza, score_velocidade, score_followup, score_contorno_objecao, score_cta, score_personalizacao").gte("analyzed_at", thirtyDaysAgo),
        ]);

      // Compute averages
      const scores = avgScore.data || [];
      const scoreMedian =
        scores.length > 0
          ? scores.reduce((sum: number, s: { score_qualidade: number | null }) => sum + (s.score_qualidade || 0), 0) /
            scores.length
          : null;

      // Top produtos
      const prodMap: Record<string, number> = {};
      (topProdutos.data || []).forEach((r: { produto_interesse: string }) => {
        prodMap[r.produto_interesse] = (prodMap[r.produto_interesse] || 0) + 1;
      });
      const topProd = Object.entries(prodMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([produto_interesse, count]) => ({ produto_interesse, count }));

      // Top objecoes
      const objMap: Record<string, number> = {};
      (topObjecoes.data || []).forEach((r: { objecao_detectada: string }) => {
        objMap[r.objecao_detectada] = (objMap[r.objecao_detectada] || 0) + 1;
      });
      const topObj = Object.entries(objMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([objecao_detectada, count]) => ({ objecao_detectada, count }));

      // Leads por status
      const statusMap: Record<string, number> = {};
      (leadsByStatus.data || []).forEach((r: { status_lead: string | null }) => {
        if (r.status_lead) statusMap[r.status_lead] = (statusMap[r.status_lead] || 0) + 1;
      });

      // Media scores
      const allScores = avgScores.data || [];
      const avg = (key: string) => {
        const vals = allScores
          .map((r: Record<string, number | null>) => r[key])
          .filter((v: number | null): v is number => v !== null);
        return vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
      };

      return {
        total_conversas_mes: convCount.count || 0,
        leads_sem_resposta: leadsNoReply.count || 0,
        score_medio: scoreMedian ? Math.round(scoreMedian * 10) / 10 : null,
        top_produtos: topProd,
        top_objecoes: topObj,
        leads_por_status: statusMap,
        media_scores: {
          empatia: avg("score_empatia"),
          clareza: avg("score_clareza"),
          velocidade: avg("score_velocidade"),
          followup: avg("score_followup"),
          contorno_objecao: avg("score_contorno_objecao"),
          cta: avg("score_cta"),
          personalizacao: avg("score_personalizacao"),
        },
      };
    };

    // ─── list_instances ──────────────────────────────────────────────────
    if (action === "list_instances") {
      const { data: instances } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, instance_name, display_name, status, phone_number")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      return jsonResponse({ instances: instances || [] });
    }

    // ─── get_analysis_status ─────────────────────────────────────────────
    if (action === "get_analysis_status") {
      const instanceId = (payload.instance_id as string | undefined) || null;

      // Count total conversations
      let convQuery = supabaseAdmin
        .from("whatsapp_conversations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      if (instanceId) convQuery = convQuery.eq("instance_id", instanceId);
      const convResult = await convQuery;
      const totalConvs = convResult.count ?? 0;

      console.log("[get_analysis_status] tenant:", tenantId, "instance:", instanceId, "totalConvs:", totalConvs, "convError:", convResult.error?.message);

      // Count analyzed conversations
      let analysisQuery = supabaseAdmin
        .from("ai_conversation_analysis")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      
      if (instanceId) {
        // Need to filter by instance - get conv IDs first
        const filterConvIds = await getInstanceConvIds(instanceId);
        if (filterConvIds !== null) {
          if (filterConvIds.length === 0) {
            return jsonResponse({ total_conversations: 0, analyzed_conversations: 0, coverage_pct: 0 });
          }
          analysisQuery = analysisQuery.in("conversation_id", filterConvIds);
        }
      }
      const analysisResult = await analysisQuery;
      const analyzedConvs = analysisResult.count ?? 0;

      console.log("[get_analysis_status] analyzedConvs:", analyzedConvs, "analysisError:", analysisResult.error?.message);

      return jsonResponse({
        total_conversations: totalConvs,
        analyzed_conversations: analyzedConvs,
        coverage_pct: totalConvs > 0 ? Math.round((analyzedConvs / totalConvs) * 100) : 0,
      });
    }

    // ─── analyze_all_conversations ────────────────────────────────────────
    if (action === "analyze_all_conversations") {
      const instanceId = (payload.instance_id as string | undefined) || null;
      const limit = Math.min((payload.limit as number | undefined) || 20, 50);

      // Get conversations not yet analyzed (or analyzed > 7 days ago)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: analyzed } = await supabaseAdmin
        .from("ai_conversation_analysis")
        .select("conversation_id, analyzed_at")
        .eq("tenant_id", tenantId!);

      const recentlyAnalyzed = new Set(
        (analyzed || [])
          .filter((a: { analyzed_at: string }) => new Date(a.analyzed_at) > new Date(sevenDaysAgo))
          .map((a: { conversation_id: string }) => a.conversation_id),
      );

      let convQuery = supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("tenant_id", tenantId!)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (instanceId) convQuery = convQuery.eq("instance_id", instanceId);

      const { data: allConvs } = await convQuery;
      const toAnalyze = (allConvs || [])
        .filter((c: { id: string }) => !recentlyAnalyzed.has(c.id))
        .slice(0, limit);

      if (toAnalyze.length === 0) {
        return jsonResponse({ analyzed: 0, message: "Todas as conversas já foram analisadas recentemente." });
      }

      let successCount = 0;
      const errors: string[] = [];

      for (const conv of toAnalyze) {
        try {
          const { data: messages } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("direction, content, created_at")
            .eq("tenant_id", tenantId!)
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true })
            .limit(60);

          if (!messages || messages.length === 0) continue;

          const lastInbound = [...messages].reverse().find((m: { direction: string }) => m.direction === "inbound");
          const horasSemResposta = lastInbound
            ? (Date.now() - new Date((lastInbound as { created_at: string }).created_at).getTime()) / 3600000
            : 0;

          const transcript = messages
            .map((m: { direction: string; content: string | null }) =>
              `${m.direction === "outbound" ? "Atendente" : "Cliente"}: ${m.content || "[mídia]"}`)
            .join("\n");

          const aiData = await callAI(
            tenantSettings,
            tenantSettings.analysis_model,
            600,
            "Você analisa conversas de WhatsApp de joalherias. Responda APENAS com JSON válido, sem texto extra, sem markdown.",
            `Analise esta conversa de joalheria e retorne JSON com exatamente estas chaves:
{"sentimento":"positivo"|"neutro"|"frustrado","produto_interesse":string|null,"objecao_detectada":string|null,"score_qualidade":1-10,"score_empatia":1-10,"score_clareza":1-10,"score_velocidade":1-10,"score_followup":1-10,"score_contorno_objecao":1-10,"score_cta":1-10,"score_personalizacao":1-10,"status_lead":"quente"|"morno"|"frio"|"perdido","resumo":string}
Velocidade baseada em ${horasSemResposta.toFixed(1)}h sem resposta.
Conversa (${messages.length} msgs):\n${transcript}`,
          );

          let analysis: Record<string, unknown>;
          try {
            analysis = extractJson(aiData.content[0].text);
          } catch {
            continue;
          }

          await supabaseAdmin.from("ai_conversation_analysis").upsert({
            conversation_id: conv.id,
            tenant_id: tenantId,
            sentimento: analysis.sentimento,
            produto_interesse: analysis.produto_interesse,
            objecao_detectada: analysis.objecao_detectada,
            score_qualidade: analysis.score_qualidade,
            score_empatia: analysis.score_empatia,
            score_clareza: analysis.score_clareza,
            score_velocidade: analysis.score_velocidade,
            score_followup: analysis.score_followup,
            score_contorno_objecao: analysis.score_contorno_objecao,
            score_cta: analysis.score_cta,
            score_personalizacao: analysis.score_personalizacao,
            status_lead: analysis.status_lead,
            resumo: analysis.resumo,
            horas_sem_resposta: Math.round(horasSemResposta * 10) / 10,
            analyzed_at: new Date().toISOString(),
          }, { onConflict: "conversation_id" });

          successCount++;
        } catch (e) {
          errors.push(conv.id);
        }
      }

      // Invalidate cache
      await supabaseAdmin.from("ai_dashboard_cache").delete().eq("tenant_id", tenantId!);

      return jsonResponse({
        analyzed: successCount,
        total_queued: toAnalyze.length,
        errors: errors.length,
        message: `${successCount} conversas analisadas com sucesso.`,
      });
    }

    // ─── ask_ai ──────────────────────────────────────────────────────────
    if (action === "ask_ai") {
      const question = payload.question as string;
      if (!question) return jsonResponse({ error: "question is required" }, 400);
      const instanceId = (payload.instance_id as string | undefined) || null;
      const convIds = await getInstanceConvIds(instanceId);

      // Use cache only for all-instances queries
      let context: Record<string, unknown> | null = null;
      if (!instanceId) {
        const { data: cache } = await supabaseAdmin
          .from("ai_dashboard_cache")
          .select("data, generated_at")
          .eq("tenant_id", tenantId!)
          .maybeSingle();
        if (cache && Date.now() - new Date(cache.generated_at).getTime() < 30 * 60000) {
          context = cache.data as Record<string, unknown>;
        }
      }
      if (!context) {
        context = await buildDashboardContext(convIds, instanceId);
        if (!instanceId) {
          await supabaseAdmin.from("ai_dashboard_cache").upsert(
            { tenant_id: tenantId!, data: context, generated_at: new Date().toISOString() },
            { onConflict: "tenant_id" },
          );
        }
      }

      const { data: instRow } = instanceId
        ? await supabaseAdmin.from("whatsapp_instances").select("display_name, instance_name").eq("id", instanceId).maybeSingle()
        : { data: null };
      const instLabel = instRow ? (instRow.display_name || instRow.instance_name) : "todas as instâncias";

      const data = await callAI(
        tenantSettings,
        tenantSettings.insights_model,
        1024,
        "Você é um consultor especialista em vendas de joalherias. Analise os dados fornecidos e responda de forma direta, prática e em português brasileiro. Seja específico com números quando disponíveis.",
        `Dados da joalheria (últimos 30 dias) — instância: ${instLabel}:\n${JSON.stringify(context, null, 2)}\n\nPergunta do gestor: ${question}`,
      );

      return jsonResponse({ answer: data.content[0].text });
    }

    // ─── generate_script ─────────────────────────────────────────────────
    if (action === "generate_script") {
      const { lead_name, product_interest, hours_without_reply, last_message, objecao } = payload as Record<string, string>;

      const userMsg = `Gere UMA mensagem de WhatsApp para reengajar o cliente ${lead_name || "Cliente"}.
Contexto: se interessou por ${product_interest || "produto"} há ${hours_without_reply || "?"} horas sem resposta.
Última mensagem do cliente: "${last_message || ""}"
${objecao ? `Objeção detectada anteriormente: "${objecao}"` : ""}
Regras: tom amigável e consultivo, sem pressão, máximo 3 linhas, sem emojis em excesso (máx 1), sem markdown, em português brasileiro.`;

      const data = await callAI(tenantSettings, tenantSettings.analysis_model, 300, undefined, userMsg);
      return jsonResponse({ script: data.content[0].text });
    }

    // ─── get_dashboard ───────────────────────────────────────────────────
    if (action === "get_dashboard") {
      const forceRefresh = payload.force_refresh === true;
      const instanceId = (payload.instance_id as string | undefined) || null;
      const convIds = await getInstanceConvIds(instanceId);

      if (!forceRefresh && !instanceId) {
        const { data: cache } = await supabaseAdmin
          .from("ai_dashboard_cache")
          .select("data, generated_at")
          .eq("tenant_id", tenantId!)
          .maybeSingle();

        if (cache && Date.now() - new Date(cache.generated_at).getTime() < 30 * 60000) {
          return jsonResponse({ data: cache.data });
        }
      }

      // Build fresh context
      const context = await buildDashboardContext(convIds, instanceId);

      // Additional queries
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();

      const [leadsListResult, bestApproachesResult] = await Promise.all([
        supabaseAdmin.rpc("get_leads_sem_resposta", { p_tenant_id: tenantId, p_two_hours_ago: twoHoursAgo, p_seven_days_ago: sevenDaysAgo }).then(
          () => null, // will use fallback
          () => null,
        ),
        Promise.resolve(null),
      ]);

      // Fallback: direct queries
      let leadsQuery = supabaseAdmin
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone, last_message, last_message_at")
        .eq("tenant_id", tenantId!)
        .lt("last_message_at", twoHoursAgo)
        .gte("last_message_at", sevenDaysAgo)
        .order("last_message_at", { ascending: true })
        .limit(20);
      if (instanceId) leadsQuery = leadsQuery.eq("instance_id", instanceId);
      const { data: leadsList } = await leadsQuery;

      // Best approaches
      let bestApproachesQuery = applyConvFilter(
        supabaseAdmin.from("ai_conversation_analysis")
          .select("conversation_id, produto_interesse, score_qualidade, resumo, sentimento")
          .eq("tenant_id", tenantId!)
          .gte("score_qualidade", 8)
          .eq("sentimento", "positivo")
          .order("analyzed_at", { ascending: false })
          .limit(6),
        convIds,
      );
      const { data: bestApproaches } = await bestApproachesQuery;

      // Enrich with analysis data
      const enrichedLeads = [];
      if (leadsList) {
        const leadsConvIds = leadsList.map((l: { id: string }) => l.id);
        const { data: analyses } = leadsConvIds.length > 0
          ? await supabaseAdmin
              .from("ai_conversation_analysis")
              .select("conversation_id, produto_interesse, objecao_detectada, status_lead")
              .in("conversation_id", leadsConvIds)
          : { data: [] };

        const analysisMap: Record<string, { produto_interesse: string | null; objecao_detectada: string | null; status_lead: string | null }> = {};
        (analyses || []).forEach((a: { conversation_id: string; produto_interesse: string | null; objecao_detectada: string | null; status_lead: string | null }) => {
          analysisMap[a.conversation_id] = a;
        });

        for (const lead of leadsList) {
          const a = analysisMap[lead.id] || {};
          enrichedLeads.push({
            ...lead,
            horas_sem_resposta: Math.round(((Date.now() - new Date(lead.last_message_at).getTime()) / 3600000) * 10) / 10,
            produto_interesse: (a as Record<string, unknown>).produto_interesse || null,
            objecao_detectada: (a as Record<string, unknown>).objecao_detectada || null,
            status_lead: (a as Record<string, unknown>).status_lead || null,
          });
        }
      }

      let melhoresAbordagens: Array<Record<string, unknown>> = [];
      if (bestApproaches && bestApproaches.length > 0) {
        const baConvIds = bestApproaches.map((b: { conversation_id: string }) => b.conversation_id);
        const { data: baConvs } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("id, contact_name, last_message")
          .in("id", baConvIds);

        const convMap: Record<string, { contact_name: string | null; last_message: string | null }> = {};
        (baConvs || []).forEach((c: { id: string; contact_name: string | null; last_message: string | null }) => {
          convMap[c.id] = c;
        });

        melhoresAbordagens = bestApproaches.map((b: Record<string, unknown>) => ({
          contact_name: convMap[b.conversation_id as string]?.contact_name || null,
          last_message: convMap[b.conversation_id as string]?.last_message || null,
          produto_interesse: b.produto_interesse,
          score_qualidade: b.score_qualidade,
          resumo: b.resumo,
        }));
      }

      const fullData = {
        ...context,
        leads_sem_resposta_lista: enrichedLeads,
        melhores_abordagens: melhoresAbordagens,
      };

      // Save cache only for all-instances queries
      if (!instanceId) {
        await supabaseAdmin.from("ai_dashboard_cache").upsert(
          { tenant_id: tenantId!, data: fullData, generated_at: new Date().toISOString() },
          { onConflict: "tenant_id" },
        );
      }

      return jsonResponse({ data: fullData });
    }

    // ─── get_insights ─────────────────────────────────────────────────────
    if (action === "get_insights") {
      const instanceId = (payload.instance_id as string | undefined) || null;
      const convIds = await getInstanceConvIds(instanceId);
      const context = await buildDashboardContext(convIds, instanceId);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [recentAnalyses, weekAnalyses, worstCasesResult] = await Promise.all([
        applyConvFilter(
          supabaseAdmin.from("ai_conversation_analysis")
            .select("conversation_id, status_lead, sentimento, score_qualidade, horas_sem_resposta, produto_interesse, objecao_detectada")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo),
          convIds,
        ),
        applyConvFilter(
          supabaseAdmin.from("ai_conversation_analysis")
            .select("status_lead, score_qualidade")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", sevenDaysAgo),
          convIds,
        ),
        // Fetch worst cases for real conversation examples
        applyConvFilter(
          supabaseAdmin.from("ai_conversation_analysis")
            .select("conversation_id, status_lead, horas_sem_resposta, produto_interesse, objecao_detectada, sentimento, resumo")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo)
            .order("horas_sem_resposta", { ascending: false })
            .limit(8),
          convIds,
        ),
      ]);

      const allAnalyses = recentAnalyses.data || [];
      const weekData = weekAnalyses.data || [];
      const worstCases = (worstCasesResult.data || []).slice(0, 5);

      // Fetch real message examples for worst cases (parallel)
      const realExamples = await Promise.all(
        worstCases.map(async (case_: Record<string, unknown>) => {
          try {
            const convId = case_.conversation_id as string;
            const [convRes, msgsRes] = await Promise.all([
              supabaseAdmin.from("whatsapp_conversations")
                .select("contact_name, contact_phone")
                .eq("id", convId).maybeSingle(),
              supabaseAdmin.from("whatsapp_messages")
                .select("direction, content, created_at")
                .eq("conversation_id", convId)
                .order("created_at", { ascending: false })
                .limit(8),
            ]);
            const msgs = ((msgsRes.data || []) as Array<{ direction: string; content: string | null; created_at: string }>).reverse();
            const lastClientMsg = [...msgs].reverse().find((m) => m.direction === "inbound");
            const lastAgentMsg = [...msgs].reverse().find((m) => m.direction === "outbound");
            const clientTime = lastClientMsg ? new Date(lastClientMsg.created_at).getTime() : 0;
            const agentTime = lastAgentMsg ? new Date(lastAgentMsg.created_at).getTime() : 0;
            const semResposta = clientTime > 0 && (agentTime === 0 || agentTime < clientTime);
            const conv = convRes.data as Record<string, unknown> | null;
            return {
              contact_name: conv?.contact_name || "Cliente",
              horas_sem_resposta: case_.horas_sem_resposta,
              produto_interesse: case_.produto_interesse,
              status_lead: case_.status_lead,
              sentimento: case_.sentimento,
              ultima_msg_cliente: lastClientMsg?.content || null,
              ultima_resposta_atendente: semResposta ? null : (lastAgentMsg?.content || null),
              sem_resposta: semResposta,
              resumo: case_.resumo,
            };
          } catch { return null; }
        })
      );
      const validExamples = realExamples.filter(Boolean);

      // Compute enriched stats
      const totalAnalyzed = allAnalyses.length;
      const hotCount = allAnalyses.filter((a: Record<string, unknown>) => a.status_lead === "quente").length;
      const coldCount = allAnalyses.filter((a: Record<string, unknown>) => a.status_lead === "frio").length;
      const lostCount = allAnalyses.filter((a: Record<string, unknown>) => a.status_lead === "perdido").length;
      const hotNoReply6h = allAnalyses.filter((a: Record<string, unknown>) =>
        a.status_lead === "quente" && (a.horas_sem_resposta as number) > 6
      ).length;
      const avgResponseH = allAnalyses.filter((a: Record<string, unknown>) => a.horas_sem_resposta !== null)
        .reduce((s: number, a: Record<string, unknown>) => s + (a.horas_sem_resposta as number), 0) /
        (allAnalyses.filter((a: Record<string, unknown>) => a.horas_sem_resposta !== null).length || 1);
      const frustratedCount = allAnalyses.filter((a: Record<string, unknown>) => a.sentimento === "frustrado").length;
      const weekAvgScore = weekData.length > 0
        ? weekData.reduce((s: number, a: Record<string, unknown>) => s + ((a.score_qualidade as number) || 0), 0) / weekData.length
        : null;

      // Estimated loss: conservative formula based on lost + hot leads with no reply
      const avgTicket = tenantSettings.avg_ticket_brl;
      const estimatedLossTotal = Math.round(
        (lostCount * avgTicket * 0.15) + (hotNoReply6h * avgTicket * 0.35)
      );

      const enrichedContext = {
        ...context,
        total_conversas_analisadas: totalAnalyzed,
        leads_quentes: hotCount,
        leads_quentes_sem_resposta_6h: hotNoReply6h,
        leads_frios: coldCount,
        leads_perdidos: lostCount,
        media_horas_sem_resposta: Math.round(avgResponseH * 10) / 10,
        clientes_frustrados: frustratedCount,
        score_medio_semana: weekAvgScore ? Math.round(weekAvgScore * 10) / 10 : null,
        taxa_conversao_estimada_pct: totalAnalyzed > 0 ? Math.round((hotCount / totalAnalyzed) * 100) : 0,
        ticket_medio_brl: avgTicket,
        perda_estimada_total_brl: estimatedLossTotal,
      };

      const examplesText = validExamples.length > 0
        ? `\n\nEXEMPLOS REAIS DE CONVERSAS CRÍTICAS (use nos insights urgentes/alertas):\n${JSON.stringify(validExamples, null, 2)}`
        : "";

      const insightsData = await callAI(
        tenantSettings,
        tenantSettings.insights_model,
        2800,
        `Você é um consultor sênior de vendas especializado em joalherias de varejo.
Analise os dados e gere exatamente 6 insights estratégicos e altamente acionáveis.
Cada insight deve ser específico com os números fornecidos, não genérico.
Para insights do tipo "urgente" ou "alerta", inclua 1-2 exemplos reais das conversas fornecidas em "exemplos".
Retorne APENAS um JSON válido com o array "insights" onde cada item tem:
{
  "tipo": "urgente" | "oportunidade" | "alerta" | "tendencia",
  "titulo": string (máx 55 chars, impactante),
  "descricao": string (máx 220 chars, cite números reais dos dados),
  "acao": string (máx 100 chars, ação concreta e específica),
  "valor_estimado_perdido_brl": number ou null (use ticket médio R$${avgTicket} quando aplicável),
  "exemplos": [
    {
      "contact_name": string,
      "mensagem_cliente": string ou null,
      "resposta_atendente": string ou null (null = sem resposta da atendente),
      "horas_sem_resposta": number ou null,
      "problema": string (1 frase curta explicando o problema),
      "script_sugerido": string (mensagem WhatsApp para recuperar o cliente, 2-3 linhas, tom amigável, sem exagerar emojis)
    }
  ]
}
Priorize: risco de receita, oportunidades de conversão, eficiência operacional, padrões sazonais de joalherias, coaching de equipe.`,
        `Dados joalheria (30 dias):\n${JSON.stringify(enrichedContext, null, 2)}${examplesText}\n\nGere 6 insights estratégicos acionáveis.`,
      );

      let parsed: { insights: unknown[] };
      try {
        const raw = insightsData.content[0].text.trim();
        const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        parsed = JSON.parse(cleaned);
      } catch {
        try { parsed = extractJson(insightsData.content[0].text) as { insights: unknown[] }; }
        catch { return jsonResponse({ error: "Failed to parse insights" }, 422); }
      }

      return jsonResponse({
        insights: parsed.insights,
        estimated_loss_total_brl: estimatedLossTotal,
      });
    }

    // ─── get_temporal_patterns ─────────────────────────────────────────────
    if (action === "get_temporal_patterns") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const instanceId = (payload.instance_id as string | undefined) || null;
      const convIds = await getInstanceConvIds(instanceId);

      let messagesQuery = supabaseAdmin
        .from("whatsapp_messages")
        .select("created_at, direction, conversation_id")
        .eq("tenant_id", tenantId!)
        .gte("created_at", thirtyDaysAgo);
      if (convIds !== null) {
        if (convIds.length === 0) return jsonResponse({ hours: [], days: [], total_messages: 0 });
        messagesQuery = messagesQuery.in("conversation_id", convIds);
      }
      const { data: messages } = await messagesQuery;

      if (!messages || messages.length === 0) {
        return jsonResponse({ hours: [], days: [], total_messages: 0 });
      }

      const hourMap: Record<number, { inbound: number; outbound: number }> = {};
      for (let i = 0; i < 24; i++) hourMap[i] = { inbound: 0, outbound: 0 };

      const dayMap: Record<number, { inbound: number; outbound: number }> = {};
      for (let i = 0; i < 7; i++) dayMap[i] = { inbound: 0, outbound: 0 };

      messages.forEach((m: { created_at: string; direction: string }) => {
        const d = new Date(m.created_at);
        // Convert UTC to BRT (UTC-3)
        const brtHour = (d.getUTCHours() - 3 + 24) % 24;
        const day = d.getDay();
        const dir = m.direction === "inbound" ? "inbound" : "outbound";
        hourMap[brtHour][dir]++;
        dayMap[day][dir]++;
      });

      const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: `${String(i).padStart(2, "0")}h`,
        inbound: hourMap[i].inbound,
        outbound: hourMap[i].outbound,
        total: hourMap[i].inbound + hourMap[i].outbound,
      }));

      const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const days = Array.from({ length: 7 }, (_, i) => ({
        day: i,
        label: dayLabels[i],
        inbound: dayMap[i].inbound,
        outbound: dayMap[i].outbound,
        total: dayMap[i].inbound + dayMap[i].outbound,
      }));

      const peakInbound = hours.reduce((max, h) => (h.inbound > max.inbound ? h : max), hours[0]);
      const peakOutbound = hours.reduce((max, h) => (h.outbound > max.outbound ? h : max), hours[0]);

      return jsonResponse({
        hours,
        days,
        peak_inbound_hour: peakInbound.hour,
        peak_outbound_hour: peakOutbound.hour,
        total_messages: messages.length,
      });
    }

    // ─── get_pipeline ──────────────────────────────────────────────────────
    if (action === "get_pipeline") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const instanceId = (payload.instance_id as string | undefined) || null;
      const convIds = await getInstanceConvIds(instanceId);

      const { data: analyses } = await applyConvFilter(
        supabaseAdmin.from("ai_conversation_analysis")
          .select("conversation_id, status_lead, produto_interesse, objecao_detectada, score_qualidade, horas_sem_resposta, resumo, sentimento, analyzed_at")
          .eq("tenant_id", tenantId!)
          .gte("analyzed_at", thirtyDaysAgo)
          .in("status_lead", ["quente", "morno"]),
        convIds,
      );

      if (!analyses || analyses.length === 0) {
        return jsonResponse({ hot_leads: [], warm_leads: [] });
      }

      const pipelineConvIds = analyses.map((a: Record<string, unknown>) => a.conversation_id as string);
      const { data: convs } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone, last_message, last_message_at")
        .in("id", pipelineConvIds);

      const convMap: Record<string, Record<string, unknown>> = {};
      (convs || []).forEach((c: Record<string, unknown>) => {
        convMap[c.id as string] = c;
      });

      const enriched = analyses.map((a: Record<string, unknown>) => {
        const conv = convMap[a.conversation_id as string] || {};
        const lastAt = conv.last_message_at as string | undefined;
        return {
          ...a,
          contact_name: conv.contact_name || null,
          contact_phone: conv.contact_phone || null,
          last_message: conv.last_message || null,
          last_message_at: lastAt || null,
          horas_sem_resposta: lastAt
            ? Math.round(((Date.now() - new Date(lastAt).getTime()) / 3600000) * 10) / 10
            : (a.horas_sem_resposta as number) || 0,
        };
      });

      const hotLeads = enriched
        .filter((a: Record<string, unknown>) => a.status_lead === "quente")
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (b.horas_sem_resposta as number) - (a.horas_sem_resposta as number));
      const warmLeads = enriched
        .filter((a: Record<string, unknown>) => a.status_lead === "morno")
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          (b.horas_sem_resposta as number) - (a.horas_sem_resposta as number));

      return jsonResponse({ hot_leads: hotLeads, warm_leads: warmLeads });
    }

    // ─── get_analysis_runs ────────────────────────────────────────────────
    if (action === "get_analysis_runs") {
      const { data: runs } = await supabaseAdmin
        // deno-lint-ignore no-explicit-any
        .from("ai_analysis_runs" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("run_at", { ascending: false })
        .limit(50);
      return jsonResponse({ runs: runs || [] });
    }

    // ─── delete_run ───────────────────────────────────────────────────────
    if (action === "delete_run") {
      const runId = payload.run_id as string;
      if (!runId) return jsonResponse({ error: "run_id is required" }, 400);

      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      const callerRole = (roleCheck as Record<string, unknown>)?.role as string | undefined;
      if (!callerRole || !["admin", "super_admin", "gerente", "gestor", "sucesso_cliente"].includes(callerRole)) {
        return jsonResponse({ error: "Sem permissão para deletar análises." }, 403);
      }

      // Unlink conversation analyses from the run (ON DELETE SET NULL handles this via FK)
      const { error: delErr } = await supabaseAdmin
        // deno-lint-ignore no-explicit-any
        .from("ai_analysis_runs" as any)
        .delete()
        .eq("id", runId)
        .eq("tenant_id", tenantId!);
      if (delErr) throw delErr;
      return jsonResponse({ success: true });
    }

    // ─── Helper: run analysis for a tenant and return counts ─────────────
    const runAnalysisForTenant = async (
      tid: string,
      runId: string,
      settings: TenantSettings,
      limitConvs = 200,
    ): Promise<{ analyzed: number; total: number; errors: number }> => {
      // Find conversations not yet analyzed (no entry in ai_conversation_analysis)
      const { data: allConvs } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("tenant_id", tid)
        .order("last_message_at", { ascending: false })
        .limit(limitConvs);

      if (!allConvs || allConvs.length === 0) return { analyzed: 0, total: 0, errors: 0 };

      const { data: existingAnalyses } = await supabaseAdmin
        // deno-lint-ignore no-explicit-any
        .from("ai_conversation_analysis" as any)
        .select("conversation_id")
        .eq("tenant_id", tid)
        .in("conversation_id", allConvs.map((c: { id: string }) => c.id));

      const analyzedSet = new Set(
        (existingAnalyses || []).map((a: { conversation_id: string }) => a.conversation_id)
      );
      const toAnalyze = allConvs.filter((c: { id: string }) => !analyzedSet.has(c.id));
      const total = toAnalyze.length;

      let successCount = 0;
      let errorCount = 0;

      for (const conv of toAnalyze) {
        try {
          const { data: messages } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("direction, content, created_at")
            .eq("tenant_id", tid)
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true })
            .limit(60);

          if (!messages || messages.length === 0) continue;

          const lastInbound = [...messages].reverse().find((m: { direction: string }) => m.direction === "inbound");
          const horasSemResposta = lastInbound
            ? (Date.now() - new Date((lastInbound as { created_at: string }).created_at).getTime()) / 3600000
            : 0;

          const transcript = messages
            .map((m: { direction: string; content: string | null }) =>
              `${m.direction === "outbound" ? "Atendente" : "Cliente"}: ${m.content || "[mídia]"}`)
            .join("\n");

          const aiData = await callAI(
            settings,
            settings.analysis_model,
            600,
            "Você analisa conversas de WhatsApp de joalherias. Responda APENAS com JSON válido, sem texto extra, sem markdown.",
            `Analise esta conversa de joalheria e retorne JSON com exatamente estas chaves:
{"sentimento":"positivo"|"neutro"|"frustrado","produto_interesse":string|null,"objecao_detectada":string|null,"score_qualidade":1-10,"score_empatia":1-10,"score_clareza":1-10,"score_velocidade":1-10,"score_followup":1-10,"score_contorno_objecao":1-10,"score_cta":1-10,"score_personalizacao":1-10,"status_lead":"quente"|"morno"|"frio"|"perdido","resumo":string}
Velocidade baseada em ${horasSemResposta.toFixed(1)}h sem resposta.
Conversa (${messages.length} msgs):\n${transcript}`,
          );

          const analysis = extractJson(aiData.content[0].text);

          // deno-lint-ignore no-explicit-any
          await (supabaseAdmin.from("ai_conversation_analysis" as any) as any)
            .upsert({
              conversation_id: conv.id,
              tenant_id: tid,
              run_id: runId,
              sentimento: analysis.sentimento,
              produto_interesse: analysis.produto_interesse,
              objecao_detectada: analysis.objecao_detectada,
              score_qualidade: analysis.score_qualidade,
              score_empatia: analysis.score_empatia,
              score_clareza: analysis.score_clareza,
              score_velocidade: analysis.score_velocidade,
              score_followup: analysis.score_followup,
              score_contorno_objecao: analysis.score_contorno_objecao,
              score_cta: analysis.score_cta,
              score_personalizacao: analysis.score_personalizacao,
              status_lead: analysis.status_lead,
              resumo: analysis.resumo,
              horas_sem_resposta: Math.round(horasSemResposta * 10) / 10,
              analyzed_at: new Date().toISOString(),
            }, { onConflict: "conversation_id" });

          successCount++;
        } catch {
          errorCount++;
        }
      }

      // Invalidate dashboard cache
      if (successCount > 0) {
        await supabaseAdmin.from("ai_dashboard_cache").delete().eq("tenant_id", tid);
      }

      return { analyzed: successCount, total, errors: errorCount };
    };

    // ─── Helper: enforce max_history_runs limit ───────────────────────────
    const enforceHistoryLimit = async (tid: string, maxRuns: number) => {
      if (maxRuns <= 0) return;
      const { data: runs } = await supabaseAdmin
        // deno-lint-ignore no-explicit-any
        .from("ai_analysis_runs" as any)
        .select("id")
        .eq("tenant_id", tid)
        .order("run_at", { ascending: true });

      if (!runs || runs.length <= maxRuns) return;

      const toDelete = runs.slice(0, runs.length - maxRuns);
      await supabaseAdmin
        // deno-lint-ignore no-explicit-any
        .from("ai_analysis_runs" as any)
        .delete()
        .in("id", toDelete.map((r: { id: string }) => r.id));
    };

    // ─── trigger_manual_run ───────────────────────────────────────────────
    if (action === "trigger_manual_run") {
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      const callerRole = (roleCheck as Record<string, unknown>)?.role as string | undefined;
      if (!callerRole || !["admin", "super_admin", "gerente", "gestor", "sucesso_cliente"].includes(callerRole)) {
        return jsonResponse({ error: "Sem permissão para iniciar análise manual." }, 403);
      }

      // Create run record
      const { data: newRun, error: runErr } = await supabaseAdmin
        // deno-lint-ignore no-explicit-any
        .from("ai_analysis_runs" as any)
        .insert({
          tenant_id: tenantId!,
          triggered_by: "manual",
          triggered_by_user_id: userId,
          status: "running",
        })
        .select("id")
        .single();

      if (runErr || !newRun) return jsonResponse({ error: "Erro ao criar registro de análise." }, 500);
      const runId = (newRun as { id: string }).id;

      try {
        const result = await runAnalysisForTenant(tenantId!, runId, tenantSettings);

        // Mark run as completed
        await supabaseAdmin
          // deno-lint-ignore no-explicit-any
          .from("ai_analysis_runs" as any)
          .update({
            status: "completed",
            conversations_analyzed: result.analyzed,
            conversations_total: result.total,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);

        // Enforce history limit
        const sysSettings = await loadSystemSettings();
        const maxRuns = Number(sysSettings.max_history_runs) || 10;
        await enforceHistoryLimit(tenantId!, maxRuns);

        return jsonResponse({
          run_id: runId,
          analyzed: result.analyzed,
          total: result.total,
          errors: result.errors,
          message: `${result.analyzed} conversas analisadas com sucesso.`,
        });
      } catch (err) {
        await supabaseAdmin
          // deno-lint-ignore no-explicit-any
          .from("ai_analysis_runs" as any)
          .update({
            status: "error",
            error_message: err instanceof Error ? err.message : "Erro desconhecido",
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
        throw err;
      }
    }

    // ─── check_scheduled_run ──────────────────────────────────────────────
    if (action === "check_scheduled_run") {
      const sysSettings = await loadSystemSettings();
      const schedEnabled = sysSettings.schedule_enabled as boolean;
      const nextRunAt = sysSettings.next_run_at as string | null;

      if (!schedEnabled || !nextRunAt) {
        return jsonResponse({ triggered: false, reason: "schedule_disabled" });
      }

      const isDue = new Date(nextRunAt) <= new Date();
      if (!isDue) {
        return jsonResponse({ triggered: false, reason: "not_due_yet", next_run_at: nextRunAt });
      }

      // Atomically advance next_run_at to prevent duplicate runs
      const scheduleDays = (sysSettings.schedule_days as number[]) || [1, 2, 3, 4, 5];
      const scheduleHour = Number(sysSettings.schedule_hour ?? 8);
      const scheduleMinute = Number(sysSettings.schedule_minute ?? 0);
      const scheduleTimezone = (sysSettings.schedule_timezone as string) || "America/Sao_Paulo";
      const maxRuns = Number(sysSettings.max_history_runs) || 10;

      const { data: nextRunData } = await supabaseAdmin.rpc("compute_next_ai_run", {
        p_days: scheduleDays,
        p_hour: scheduleHour,
        p_minute: scheduleMinute,
        p_timezone: scheduleTimezone,
      });

      // deno-lint-ignore no-explicit-any
      const { data: updated } = await (supabaseAdmin.from("ai_system_settings" as any) as any)
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunData || null,
          updated_at: new Date().toISOString(),
        })
        .eq("next_run_at", nextRunAt) // optimistic lock — only update if unchanged
        .select("id");

      if (!updated || (Array.isArray(updated) && updated.length === 0)) {
        return jsonResponse({ triggered: false, reason: "already_triggered" });
      }

      // Determine which tenants to analyze
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      const callerRole = (roleCheck as Record<string, unknown>)?.role as string | undefined;

      let tenantsToAnalyze: string[] = [tenantId!];

      if (callerRole === "admin" || callerRole === "super_admin") {
        // Analyze ALL tenants
        const { data: allTenants } = await supabaseAdmin.from("tenants").select("id");
        tenantsToAnalyze = (allTenants || []).map((t: { id: string }) => t.id);
      } else if (callerRole === "gerente" || callerRole === "gestor" || callerRole === "sucesso_cliente") {
        // Analyze assigned tenants
        const { data: assignments } = await supabaseAdmin
          .from("tenant_assignments")
          .select("tenant_id")
          .eq("manager_id", userId!);
        tenantsToAnalyze = (assignments || []).map((a: { tenant_id: string }) => a.tenant_id);
        if (!tenantsToAnalyze.includes(tenantId!)) tenantsToAnalyze.push(tenantId!);
      }

      const runResults: Array<{ tenant_id: string; run_id: string; analyzed: number }> = [];

      for (const tid of tenantsToAnalyze) {
        try {
          const tidSettings = await loadTenantSettings(tid);

          const { data: newRun } = await supabaseAdmin
            // deno-lint-ignore no-explicit-any
            .from("ai_analysis_runs" as any)
            .insert({
              tenant_id: tid,
              triggered_by: "scheduled",
              triggered_by_user_id: userId,
              status: "running",
            })
            .select("id")
            .single();

          if (!newRun) continue;
          const runId = (newRun as { id: string }).id;

          const result = await runAnalysisForTenant(tid, runId, tidSettings);

          await supabaseAdmin
            // deno-lint-ignore no-explicit-any
            .from("ai_analysis_runs" as any)
            .update({
              status: "completed",
              conversations_analyzed: result.analyzed,
              conversations_total: result.total,
              completed_at: new Date().toISOString(),
            })
            .eq("id", runId);

          await enforceHistoryLimit(tid, maxRuns);
          runResults.push({ tenant_id: tid, run_id: runId, analyzed: result.analyzed });
        } catch (e) {
          console.error(`[check_scheduled_run] Error for tenant ${tid}:`, e);
        }
      }

      return jsonResponse({
        triggered: true,
        tenants_analyzed: runResults.length,
        results: runResults,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("ai-analysis error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
