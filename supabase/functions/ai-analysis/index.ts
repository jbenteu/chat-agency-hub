import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
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

const fetchWithTimeout = (url: string, init: RequestInit, ms = 60000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

const extractJson = (text: string): Record<string, unknown> => {
  const clean = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("No valid JSON found in AI response");
};

// Calculate next run date based on frequency settings
function calcNextRunAt(frequency: string, dayOfWeek: number, timeOfDay: string): string {
  const now = new Date();
  const [h, m] = timeOfDay.split(":").map(Number);
  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);
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
    else if (daysUntil > 0) { /* use as-is */ }
    else daysUntil = 14;
    next.setDate(next.getDate() + daysUntil);
  } else if (frequency === "monthly") {
    next.setDate(1);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (!action) return jsonResponse({ error: "action is required" }, 400);

  // ─── Auth ────────────────────────────────────────────────────────────────────
  let tenantId: string | null = null;
  let userId: string | null = null;
  let userRole: string | null = null;
  let isServiceRole = false;

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim();

  // Check if it's a service-role / cron call
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    isServiceRole = true;
    tenantId = body.tenant_id as string || null;
  } else if (token) {
    const { data: authData } = await supabaseAdmin.auth.getUser(token);
    if (authData?.user?.id) {
      userId = authData.user.id;
    } else {
      const jwtSub = decodeJwtSub(token);
      if (jwtSub) userId = jwtSub;
    }

    if (userId) {
      // Read agency role from profiles (gestor/gerente/admin/etc.)
      // and own tenant from user_roles in parallel
      const [profileRes, roleRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("tenant_id").eq("user_id", userId).limit(1).maybeSingle(),
      ]);
      if (profileRes.data?.role) userRole = profileRes.data.role;
      if (roleRes.data?.tenant_id) tenantId = roleRes.data.tenant_id;

      // Fallback: clients may not have a user_roles entry — use the shared RPC
      if (!tenantId) {
        const { data: rpcTenantId } = await supabaseAdmin.rpc("get_user_tenant_id", { _user_id: userId });
        if (rpcTenantId) tenantId = rpcTenantId as string;
      }
    }
  }

  // Public (read) actions require auth; write actions require admin/service role
  const publicReadActions = ["get_latest_analysis", "get_analysis_history", "get_schedule", "chat_consultant"];
  const adminWriteActions = ["run_analysis", "update_schedule"];

  if (publicReadActions.includes(action) && !userId && !isServiceRole) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  if (adminWriteActions.includes(action) && !isServiceRole) {
    if (!["admin", "super_admin", "gerente", "gestor", "sucesso_cliente"].includes(userRole || "")) {
      return jsonResponse({ error: "Permissão negada" }, 403);
    }
  }

  // Allow target_tenant_id override for staff
  const targetTenantId = body.tenant_id as string | undefined;
  if (targetTenantId && targetTenantId !== tenantId && !isServiceRole) {
    if (!["admin", "super_admin", "gerente", "gestor", "sucesso_cliente"].includes(userRole || "")) {
      return jsonResponse({ error: "Acesso negado ao tenant solicitado" }, 403);
    }
    tenantId = targetTenantId;
  }

  // ─── get_latest_analysis ────────────────────────────────────────────────────
  if (action === "get_latest_analysis") {
    const tid = (body.tenant_id as string) || tenantId;
    if (!tid) return jsonResponse({ error: "tenant_id required" }, 400);

    // Mark stuck processing runs (>10 min) as failed so they don't block forever
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("ai_analysis_runs")
      .update({ status: "failed", error_message: "Timeout — análise demorou mais de 10 minutos" })
      .eq("tenant_id", tid)
      .eq("status", "processing")
      .lt("created_at", stuckCutoff);

    const { data: run } = await supabaseAdmin
      .from("ai_analysis_runs")
      .select("*")
      .eq("tenant_id", tid)
      .in("status", ["completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!run) {
      // Check if there's an active processing run
      const { data: processingRun } = await supabaseAdmin
        .from("ai_analysis_runs")
        .select("id, status, created_at, tenant_id")
        .eq("tenant_id", tid)
        .eq("status", "processing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return jsonResponse({ run: processingRun || null, conversations: [], improvements: [] });
    }

    const [{ data: conversations }, { data: improvements }] = await Promise.all([
      supabaseAdmin
        .from("ai_analysis_conversations")
        .select("*")
        .eq("run_id", run.id)
        .order("score_overall", { ascending: false }),
      supabaseAdmin
        .from("ai_analysis_improvements")
        .select("*")
        .eq("run_id", run.id)
        .order("occurrence_count", { ascending: false }),
    ]);

    return jsonResponse({ run, conversations: conversations || [], improvements: improvements || [] });
  }

  // ─── get_analysis_history ────────────────────────────────────────────────────
  if (action === "get_analysis_history") {
    const tid = (body.tenant_id as string) || tenantId;
    if (!tid) return jsonResponse({ error: "tenant_id required" }, 400);
    const page = (body.page as number) || 0;
    const pageSize = 10;

    const { data: runs } = await supabaseAdmin
      .from("ai_analysis_runs")
      .select("id, tenant_id, status, period_start, period_end, messages_analyzed, conversations_analyzed, summary, created_at, completed_at")
      .eq("tenant_id", tid)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    return jsonResponse({ runs: runs || [] });
  }

  // ─── get_analysis_by_id ──────────────────────────────────────────────────────
  if (action === "get_analysis_by_id") {
    const runId = body.run_id as string;
    if (!runId) return jsonResponse({ error: "run_id required" }, 400);

    const { data: run } = await supabaseAdmin
      .from("ai_analysis_runs")
      .select("*")
      .eq("id", runId)
      .eq("tenant_id", tenantId!)
      .maybeSingle();

    if (!run) return jsonResponse({ error: "Run not found" }, 404);

    const [{ data: conversations }, { data: improvements }] = await Promise.all([
      supabaseAdmin
        .from("ai_analysis_conversations")
        .select("*")
        .eq("run_id", runId)
        .order("score_overall", { ascending: false }),
      supabaseAdmin
        .from("ai_analysis_improvements")
        .select("*")
        .eq("run_id", runId)
        .order("occurrence_count", { ascending: false }),
    ]);

    return jsonResponse({ run, conversations: conversations || [], improvements: improvements || [] });
  }

  // ─── get_schedule ────────────────────────────────────────────────────────────
  if (action === "get_schedule") {
    const tid = (body.tenant_id as string) || tenantId;
    if (!tid) return jsonResponse({ error: "tenant_id required" }, 400);

    const { data: schedule } = await supabaseAdmin
      .from("ai_analysis_schedule")
      .select("*")
      .eq("tenant_id", tid)
      .maybeSingle();

    return jsonResponse({ schedule: schedule || null });
  }

  // ─── update_schedule ─────────────────────────────────────────────────────────
  if (action === "update_schedule") {
    const tid = (body.tenant_id as string) || tenantId;
    if (!tid) return jsonResponse({ error: "tenant_id required" }, 400);

    const { frequency = "weekly", day_of_week = 1, time_of_day = "08:00", timezone = "America/Sao_Paulo", enabled = true } = body;
    const nextRunAt = calcNextRunAt(frequency as string, day_of_week as number, time_of_day as string);

    const { data: schedule, error } = await supabaseAdmin
      .from("ai_analysis_schedule")
      .upsert({
        tenant_id: tid,
        frequency,
        day_of_week,
        time_of_day,
        timezone,
        enabled,
        next_run_at: nextRunAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" })
      .select()
      .single();

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ schedule });
  }

  // ─── run_analysis ─────────────────────────────────────────────────────────────
  if (action === "run_analysis") {
    const tid = (body.tenant_id as string) || tenantId;
    if (!tid) return jsonResponse({ error: "tenant_id required" }, 400);

    // Resolve API key: prefer env var, fall back to DB-stored key from admin panel
    let resolvedApiKey = ANTHROPIC_API_KEY;
    if (!resolvedApiKey) {
      const { data: sysSettings } = await supabaseAdmin
        .from("ai_system_settings")
        .select("api_key")
        .not("id", "is", null)
        .maybeSingle();
      if (sysSettings?.api_key) resolvedApiKey = sysSettings.api_key as string;
    }
    if (!resolvedApiKey) return jsonResponse({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

    // Check if already processing
    const { data: existingProcessing } = await supabaseAdmin
      .from("ai_analysis_runs")
      .select("id")
      .eq("tenant_id", tid)
      .eq("status", "processing")
      .maybeSingle();
    if (existingProcessing) return jsonResponse({ error: "Análise já em andamento", run_id: existingProcessing.id }, 409);

    // Determine period
    const { data: lastRun } = await supabaseAdmin
      .from("ai_analysis_runs")
      .select("period_end, completed_at")
      .eq("tenant_id", tid)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("created_at")
      .eq("id", tid)
      .single();

    const periodStart = lastRun?.period_end || tenant?.created_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date().toISOString();

    // Create run record — try with new columns first, fallback to legacy schema
    let run: Record<string, unknown> | null = null;
    let runError: { message: string } | null = null;

    const newInsertResult = await supabaseAdmin
      .from("ai_analysis_runs")
      .insert({
        tenant_id: tid,
        status: "processing",
        period_start: periodStart,
        period_end: periodEnd,
        created_by: userId || null,
        conversations_analyzed: 0,
        messages_analyzed: 0,
        summary: {},
      })
      .select()
      .single();

    if (newInsertResult.error) {
      // Fallback: legacy schema without new columns
      console.warn("New schema insert failed, trying legacy:", newInsertResult.error.message);
      const legacyResult = await supabaseAdmin
        .from("ai_analysis_runs")
        .insert({
          tenant_id: tid,
          status: "processing",
          triggered_by: userId ? "manual" : "scheduled",
          triggered_by_user_id: userId || null,
          conversations_analyzed: 0,
          conversations_total: 0,
        })
        .select()
        .single();
      run = legacyResult.data;
      runError = legacyResult.error;
    } else {
      run = newInsertResult.data;
    }

    if (runError || !run) {
      console.error("run insert error:", runError);
      return jsonResponse({ error: "Falha ao criar run de análise", detail: runError?.message }, 500);
    }

    // Fire background processing — return immediately so the client can poll
    const backgroundWork = processAnalysisInBackground(
      supabaseAdmin,
      resolvedApiKey,
      run.id as string,
      tid,
      periodStart,
      periodEnd,
    );

    // EdgeRuntime.waitUntil keeps the Supabase Edge Function alive after response is sent
    try {
      // deno-lint-ignore no-explicit-any
      (EdgeRuntime as any).waitUntil(backgroundWork);
    } catch {
      // Fallback: process synchronously if EdgeRuntime is not available
      await backgroundWork;
    }

    return jsonResponse({ run_id: run.id, status: "processing" });
  }

  // ─── chat_consultant ──────────────────────────────────────────────────────────
  if (action === "chat_consultant") {
    if (!ANTHROPIC_API_KEY) return jsonResponse({ error: "ANTHROPIC_API_KEY não configurada" }, 500);
    const tid = (body.tenant_id as string) || tenantId;
    if (!tid) return jsonResponse({ error: "tenant_id required" }, 400);

    const message = body.message as string;
    const conversationHistory = (body.conversation_history as Array<{ role: string; content: string }>) || [];
    const context = body.context as Record<string, unknown> | null;

    if (!message) return jsonResponse({ error: "message required" }, 400);

    // Build context from analysis
    let analysisContext = "";
    if (context?.summary) {
      const s = context.summary as Record<string, unknown>;
      analysisContext = `
Análise mais recente:
- Score geral: ${s.score_overall || "N/A"}/10
- Total de conversas analisadas: ${s.total_conversations || 0}
- Tempo de resposta: ${s.score_response_time || "N/A"}/10
- Empatia: ${s.score_empathy || "N/A"}/10
- Conhecimento do produto: ${s.score_product_knowledge || "N/A"}/10
- Tratamento de objeções: ${s.score_objection_handling || "N/A"}/10
- Técnica de fechamento: ${s.score_closing_technique || "N/A"}/10
- Follow-up: ${s.score_follow_up || "N/A"}/10
`;
    }

    if (context?.improvements && Array.isArray(context.improvements)) {
      const topImprovements = (context.improvements as any[]).slice(0, 5);
      if (topImprovements.length > 0) {
        analysisContext += "\nPrincipais pontos de melhoria identificados:\n";
        for (const imp of topImprovements) {
          analysisContext += `- [${imp.category}] ${imp.title}: ${imp.description}\n`;
        }
      }
    }

    const systemPrompt = `Você é um consultor especializado em vendas e atendimento ao cliente para joalherias de luxo.
Você tem acesso aos dados de análise do atendimento da equipe e pode ajudar gestores a melhorar a performance.

${analysisContext}

Responda sempre em português do Brasil. Seja específico, prático e direto.
Quando mencionar conversas ou leads específicos, formate como: [Nome do contato - ver conversa](conversationId).
Se o usuário pedir scripts, crie scripts realistas para joalherias premium.`;

    const messages = [
      ...conversationHistory.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const resp = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      },
      30000,
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic error:", resp.status, errText);
      return jsonResponse({ error: "Erro ao chamar IA" }, 500);
    }

    const aiResp = await resp.json();
    const reply = aiResp.content?.[0]?.text || "";
    return jsonResponse({ reply });
  }

  // ─── list_tenants ─────────────────────────────────────────────────────────────
  if (action === "list_tenants") {
    if (!userId && !isServiceRole) return jsonResponse({ error: "Unauthorized" }, 401);

    // Fetch client tenants using 3 simple queries (avoids unreliable triple joins in PostgREST)
    const fetchClientTenants = async (filterTenantIds?: string[]) => {
      // Step 1: all profiles with role='cliente'
      const { data: clientProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .eq("role", "cliente");
      const clientIds = (clientProfiles || []).map((p: { id: string }) => p.id);
      const profileNameMap = new Map((clientProfiles || []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));
      if (clientIds.length === 0) return [];

      // Step 2: get their tenant_ids from user_roles
      // deno-lint-ignore no-explicit-any
      let urQuery: any = supabaseAdmin
        .from("user_roles")
        .select("tenant_id, user_id")
        .in("user_id", clientIds);
      if (filterTenantIds && filterTenantIds.length > 0) {
        urQuery = urQuery.in("tenant_id", filterTenantIds);
      }
      const { data: urRows } = await urQuery;

      // Deduplicate: pick first profile name per tenant
      const tenantNameMap = new Map<string, string>();
      for (const row of (urRows || [])) {
        if (!tenantNameMap.has(row.tenant_id)) {
          tenantNameMap.set(row.tenant_id, profileNameMap.get(row.user_id) || "");
        }
      }
      if (tenantNameMap.size === 0) return [];

      // Step 3: get tenant rows for ordering and name fallback
      const { data: tenantData } = await supabaseAdmin
        .from("tenants")
        .select("id, name")
        .in("id", [...tenantNameMap.keys()])
        .order("name");

      // deno-lint-ignore no-explicit-any
      return (tenantData || []).map((t: any) => ({
        id: t.id,
        name: tenantNameMap.get(t.id) || t.name,
      }));
    };

    const isAdminRole = ["admin", "super_admin", "gerente"].includes(userRole || "");

    if (isAdminRole || isServiceRole) {
      // Admin/Gerente: all client tenants
      const tenants = await fetchClientTenants();
      return jsonResponse({ tenants });
    }

    if (["gestor", "sucesso_cliente"].includes(userRole || "") && userId) {
      // Gestor/CS: only tenants they're assigned to (via tenant_assignments)
      const { data: assignments } = await supabaseAdmin
        .from("tenant_assignments")
        .select("tenant_id")
        .eq("manager_id", userId);
      const assignedIds = [...new Set((assignments || []).map((a: { tenant_id: string }) => a.tenant_id))];
      if (assignedIds.length === 0) return jsonResponse({ tenants: [] });
      const tenants = await fetchClientTenants(assignedIds);
      return jsonResponse({ tenants });
    }

    return jsonResponse({ tenants: [] });
  }

  // ─── Legacy actions (backward compat) ────────────────────────────────────────
  if (action === "get_system_settings" || action === "update_system_settings" ||
    action === "get_dashboard" || action === "get_insights" || action === "ask_ai" ||
    action === "get_temporal_patterns" || action === "get_pipeline" || action === "get_analysis_status" ||
    action === "analyze_all_conversations" || action === "analyze_conversation" ||
    action === "list_accessible_tenants" || action === "get_analysis_runs" ||
    action === "trigger_manual_run" || action === "check_scheduled_run" ||
    action === "delete_run" || action === "get_run_scores") {
    if (action === "get_system_settings") return jsonResponse({ settings: {} });
    if (action === "list_accessible_tenants") return jsonResponse({ tenants: [], team_members: [] });
    if (action === "get_analysis_runs") return jsonResponse({ runs: [] });
    if (action === "get_analysis_status") return jsonResponse({ analyzed: 0, total: 0, percentage: 0 });
    if (action === "get_dashboard") return jsonResponse({ data: null });
    if (action === "get_pipeline") return jsonResponse({ leads: [] });
    if (action === "get_insights") return jsonResponse({ insights: [] });
    if (action === "get_temporal_patterns") return jsonResponse({ patterns: [] });
    if (action === "check_scheduled_run") return jsonResponse({ should_run: false });
    if (action === "trigger_manual_run") return jsonResponse({ error: "Use run_analysis action instead" }, 400);
    return jsonResponse({ error: "Ação legada não suportada" }, 400);
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});

// ─── Background analysis processor ───────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function processAnalysisInBackground(supabaseAdmin: any, apiKey: string, runId: string, tid: string, periodStart: string, periodEnd: string) {
  try {
    // Fetch already-analyzed message IDs to deduplicate
    const { data: analyzedLog } = await supabaseAdmin
      .from("ai_analysis_message_log")
      .select("message_id")
      .eq("tenant_id", tid)
      .limit(10000);
    const analyzedIds = new Set((analyzedLog || []).map((r: { message_id: string }) => r.message_id));

    // Fetch new messages in the analysis period
    // Note: table uses 'direction' (inbound/outbound) not 'from_me', and 'media_type' not 'message_type'
    const { data: allMessages, error: msgError } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id, conversation_id, content, media_type, direction, created_at")
      .eq("tenant_id", tid)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (msgError) console.error("whatsapp_messages fetch error:", msgError.message);

    const messages = (allMessages || []).filter((m: { id: string }) => !analyzedIds.has(m.id));

    if (!messages || messages.length === 0) {
      await supabaseAdmin
        .from("ai_analysis_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          conversations_analyzed: 0,
          messages_analyzed: 0,
          summary: { score_overall: null, total_conversations: 0, total_messages: 0 },
        })
        .eq("id", runId);
      return;
    }

    // Group messages by conversation
    const convMap: Record<string, typeof messages> = {};
    for (const msg of messages) {
      if (!convMap[msg.conversation_id]) convMap[msg.conversation_id] = [];
      convMap[msg.conversation_id].push(msg);
    }

    // Fetch conversation details
    const convIds = Object.keys(convMap);
    const { data: conversations } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id, contact_name, contact_phone, push_name")
      .eq("tenant_id", tid)
      .in("id", convIds);

    const convDetails: Record<string, { contact_name: string | null; contact_phone: string | null }> = {};
    for (const c of (conversations || [])) {
      convDetails[c.id] = {
        contact_name: c.push_name || c.contact_name,
        contact_phone: c.contact_phone,
      };
    }

    // Process in batches of 5 conversations
    const convEntries = Object.entries(convMap);
    const BATCH_SIZE = 5;
    const allConvResults: Array<Record<string, unknown>> = [];
    const allMessageIds: string[] = [];

    for (let i = 0; i < convEntries.length; i += BATCH_SIZE) {
      const batch = convEntries.slice(i, i + BATCH_SIZE) as Array<[string, Array<Record<string, unknown>>]>;
      const batchResult = await analyzeConversationBatch(batch, convDetails, apiKey, tid);
      allConvResults.push(...batchResult.conversations);
      allMessageIds.push(...batchResult.messageIds);
    }

    // Save conversation analyses
    if (allConvResults.length > 0) {
      // deno-lint-ignore no-explicit-any
      const convRows = allConvResults.map((c: any) => ({
        run_id: runId,
        tenant_id: tid,
        conversation_id: c.conversation_id,
        contact_name: c.contact_name,
        contact_phone: c.contact_phone,
        messages_count: c.messages_count,
        score_response_time: c.score_response_time,
        score_empathy: c.score_empathy,
        score_product_knowledge: c.score_product_knowledge,
        score_objection_handling: c.score_objection_handling,
        score_closing_technique: c.score_closing_technique,
        score_follow_up: c.score_follow_up,
        score_overall: c.score_overall,
        details: c.details || {},
        improvement_points: c.improvement_points || [],
        positive_points: c.positive_points || [],
      }));
      const { error: convErr } = await supabaseAdmin.from("ai_analysis_conversations").insert(convRows);
      if (convErr) console.warn("ai_analysis_conversations insert:", convErr.message);
    }

    // Consolidate improvements
    const improvements = consolidateImprovements(allConvResults, runId, tid);
    if (improvements.length > 0) {
      const { error: impErr } = await supabaseAdmin.from("ai_analysis_improvements").insert(improvements);
      if (impErr) console.warn("ai_analysis_improvements insert:", impErr.message);
    }

    // Log analyzed message IDs
    if (allMessageIds.length > 0) {
      const messageLogRows = allMessageIds.map((msgId) => ({ tenant_id: tid, run_id: runId, message_id: msgId }));
      for (let i = 0; i < messageLogRows.length; i += 500) {
        await supabaseAdmin
          .from("ai_analysis_message_log")
          .upsert(messageLogRows.slice(i, i + 500), { onConflict: "tenant_id,message_id", ignoreDuplicates: true })
          .then(({ error }: { error: { message: string } | null }) => { if (error) console.warn("message_log upsert:", error.message); });
      }
    }

    // Calculate and save summary
    const scores = allConvResults.map((c) => c.score_overall as number).filter((s) => s != null);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const summary = {
      score_overall: avgScore ? Math.round(avgScore * 10) / 10 : null,
      score_response_time: avgField(allConvResults, "score_response_time"),
      score_empathy: avgField(allConvResults, "score_empathy"),
      score_product_knowledge: avgField(allConvResults, "score_product_knowledge"),
      score_objection_handling: avgField(allConvResults, "score_objection_handling"),
      score_closing_technique: avgField(allConvResults, "score_closing_technique"),
      score_follow_up: avgField(allConvResults, "score_follow_up"),
      total_conversations: allConvResults.length,
      total_messages: allMessageIds.length,
    };

    await supabaseAdmin
      .from("ai_analysis_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        conversations_analyzed: allConvResults.length,
        messages_analyzed: allMessageIds.length,
        summary,
      })
      .eq("id", runId);

    await supabaseAdmin
      .from("ai_analysis_schedule")
      .update({ last_run_at: new Date().toISOString() })
      .eq("tenant_id", tid);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("processAnalysisInBackground failed:", msg);
    await supabaseAdmin
      .from("ai_analysis_runs")
      .update({ status: "failed", error_message: msg })
      .eq("id", runId);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avgField(items: Array<Record<string, unknown>>, field: string): number | null {
  const vals = items.map((i) => i[field] as number).filter((v) => v != null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

async function analyzeConversationBatch(
  batch: Array<[string, Array<Record<string, unknown>>]>,
  convDetails: Record<string, { contact_name: string | null; contact_phone: string | null }>,
  apiKey: string,
  tenantId: string,
): Promise<{ conversations: Array<Record<string, unknown>>; messageIds: string[] }> {
  const allMessageIds: string[] = [];
  const conversationsData: Array<Record<string, unknown>> = [];

  for (const [convId, messages] of batch) {
    // Deduplicate messages within same conversation
    const seen = new Set<string>();
    const dedupedMessages: typeof messages = [];
    for (const msg of messages) {
      // direction column: 'outbound' = agent sent, 'inbound' = client sent
      const fromMe = (msg.direction as string) === "outbound";
      const key = `${(msg.content as string || "").toLowerCase().trim()}|${fromMe}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedMessages.push({ ...msg, _fromMe: fromMe });
      }
      allMessageIds.push(msg.id as string);
    }

    conversationsData.push({
      conversation_id: convId,
      contact_name: convDetails[convId]?.contact_name || "Desconhecido",
      contact_phone: convDetails[convId]?.contact_phone || "",
      messages: dedupedMessages.map((m) => ({
        id: m.id,
        content: m.content || `[${(m as Record<string, unknown>).media_type || "mídia"}]`,
        from_me: (m as Record<string, unknown>)._fromMe,
        created_at: m.created_at,
      })),
    });
  }

  const prompt = buildAnalysisPrompt(conversationsData);

  let results: Array<Record<string, unknown>> = [];
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.ok) {
      const aiResp = await resp.json();
      const text = aiResp.content?.[0]?.text || "";
      const parsed = extractJson(text);
      results = (parsed.conversations as Array<Record<string, unknown>>) || [];
    }
  } catch (err) {
    console.error("Batch analysis error:", err);
  }

  // Map results back to conversations
  const conversations: Array<Record<string, unknown>> = [];
  for (const convData of conversationsData) {
    const result = results.find((r: any) => r.conversation_id === convData.conversation_id) as Record<string, unknown> | undefined;
    if (result) {
      conversations.push({
        conversation_id: convData.conversation_id,
        contact_name: convData.contact_name,
        contact_phone: convData.contact_phone,
        messages_count: (convData.messages as any[]).length,
        score_response_time: parseScore(result.score_response_time),
        score_empathy: parseScore(result.score_empathy),
        score_product_knowledge: parseScore(result.score_product_knowledge),
        score_objection_handling: parseScore(result.score_objection_handling),
        score_closing_technique: parseScore(result.score_closing_technique),
        score_follow_up: parseScore(result.score_follow_up),
        score_overall: parseScore(result.score_overall),
        details: result.details || {},
        improvement_points: result.improvement_points || [],
        positive_points: result.positive_points || [],
      });
    } else {
      // If AI failed to analyze, record with null scores
      conversations.push({
        conversation_id: convData.conversation_id,
        contact_name: convData.contact_name,
        contact_phone: convData.contact_phone,
        messages_count: (convData.messages as any[]).length,
        score_response_time: null,
        score_empathy: null,
        score_product_knowledge: null,
        score_objection_handling: null,
        score_closing_technique: null,
        score_follow_up: null,
        score_overall: null,
        details: {},
        improvement_points: [],
        positive_points: [],
      });
    }
  }

  return { conversations, messageIds: allMessageIds };
}

function parseScore(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

function buildAnalysisPrompt(conversations: Array<Record<string, unknown>>): string {
  // Transform messages to human-readable format before sending to AI
  // so technical field names never appear in the AI output
  const humanConvs = conversations.map((conv) => ({
    conversation_id: conv.conversation_id,
    contato: conv.contact_name,
    telefone: conv.contact_phone,
    mensagens: ((conv.messages as Array<Record<string, unknown>>) || []).map((m) => ({
      id: m.id,
      remetente: m.from_me ? "Atendente" : "Cliente",
      texto: m.content,
      horario: m.created_at,
    })),
  }));

  const convsJson = JSON.stringify(humanConvs, null, 2);

  return `Você é um especialista em análise de atendimento ao cliente para joalherias de luxo no Brasil.

Analise as conversas de WhatsApp abaixo e avalie a qualidade do atendimento prestado pelo atendente.

CONVERSAS:
${convsJson}

INSTRUÇÕES IMPORTANTES:
- Nas observações, use apenas linguagem natural em português. NUNCA mencione nomes de campos técnicos como "from_me", "conversation_id", "message_id", "remetente", "inbound", "outbound" ou qualquer chave JSON.
- Escreva como se estivesse num relatório para o gestor da joalheria: "O atendente respondeu rapidamente", "O cliente perguntou sobre preço", "Não houve resposta do atendente após a saudação", etc.
- Se a conversa tiver poucas mensagens, avalie com base no que existe. Pontuação baixa é válida.
- Se o atendente enviou apenas uma saudação sem retorno do cliente, registre isso de forma natural.

Para CADA conversa, avalie os critérios com nota de 0 a 10:
1. score_response_time: Tempo de resposta (rapidez do atendente em responder o cliente)
2. score_empathy: Empatia e cordialidade (tom acolhedor, uso do nome, personalização)
3. score_product_knowledge: Conhecimento do produto (joias, materiais, preços, coleções)
4. score_objection_handling: Tratamento de objeções ("está caro", "vou pensar", "preciso ver com meu marido")
5. score_closing_technique: Técnica de fechamento (proposta de visita, urgência, próximo passo)
6. score_follow_up: Follow-up (retoma contato, não deixa conversa morrer)
7. score_overall: Média ponderada dos critérios acima

Retorne APENAS JSON válido neste formato:
{
  "conversations": [
    {
      "conversation_id": "id-exato-da-conversa",
      "score_response_time": 7.5,
      "score_empathy": 8.0,
      "score_product_knowledge": 6.5,
      "score_objection_handling": 5.0,
      "score_closing_technique": 6.0,
      "score_follow_up": 4.0,
      "score_overall": 6.2,
      "details": {
        "response_time": {
          "observations": ["O atendente levou mais de 2 horas para responder a primeira mensagem do cliente"],
          "message_refs": [{"message_id": "id-da-mensagem", "excerpt": "trecho breve da mensagem"}]
        },
        "empathy": {
          "observations": ["O atendente usou o nome do cliente e manteve tom acolhedor durante toda a conversa"],
          "message_refs": []
        },
        "product_knowledge": {
          "observations": ["Demonstrou conhecimento sobre ouro 18k e diamantes, citando especificações"],
          "message_refs": []
        },
        "objection_handling": {
          "observations": ["O cliente mencionou que o preço estava alto e o atendente não ofereceu alternativas"],
          "message_refs": []
        },
        "closing_technique": {
          "observations": ["O atendente não propôs visita à loja nem criou senso de urgência"],
          "message_refs": []
        },
        "follow_up": {
          "observations": ["Após 2 dias sem resposta do cliente, o atendente não retomou o contato"],
          "message_refs": []
        }
      },
      "improvement_points": [
        {
          "category": "response_time",
          "title": "Reduzir tempo de resposta inicial",
          "description": "O primeiro contato demorou mais de 2 horas. Para uma joalheria premium, o ideal é responder em até 15 minutos durante o horário comercial.",
          "severity": "high"
        }
      ],
      "positive_points": [
        {
          "title": "Tom cordial e personalizado",
          "description": "O atendente usou o nome do cliente e manteve uma comunicação acolhedora e profissional."
        }
      ]
    }
  ]
}`;
}

function consolidateImprovements(
  convResults: Array<Record<string, unknown>>,
  runId: string,
  tenantId: string,
): Array<Record<string, unknown>> {
  const improvementMap: Record<string, Record<string, unknown>> = {};

  for (const conv of convResults) {
    const points = (conv.improvement_points as Array<Record<string, unknown>>) || [];
    for (const point of points) {
      const category = (point.category as string) || "geral";
      const title = (point.title as string) || "";
      const key = `${category}|${title.toLowerCase().trim()}`;

      if (improvementMap[key]) {
        (improvementMap[key].occurrence_count as number);
        improvementMap[key].occurrence_count = (improvementMap[key].occurrence_count as number) + 1;
        const refs = improvementMap[key].example_refs as Array<unknown>;
        if (refs.length < 3) {
          refs.push({ conversation_id: conv.conversation_id, contact_name: conv.contact_name });
        }
      } else {
        improvementMap[key] = {
          run_id: runId,
          tenant_id: tenantId,
          category,
          title,
          description: (point.description as string) || "",
          severity: (point.severity as string) || "medium",
          occurrence_count: 1,
          example_refs: [{ conversation_id: conv.conversation_id, contact_name: conv.contact_name }],
        };
      }
    }
  }

  return Object.values(improvementMap);
}
