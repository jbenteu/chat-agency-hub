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
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .single();
    if (!roleData?.tenant_id) return jsonResponse({ error: "User has no tenant assigned" }, 403);
    tenantId = roleData.tenant_id;
  }

  // ─── Anthropic helper ──────────────────────────────────────────────────────
  const callAnthropic = async (
    model: string,
    maxTokens: number,
    systemPrompt: string | undefined,
    userMessage: string,
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
          "x-api-key": ANTHROPIC_API_KEY,
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

  try {
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

      const data = await callAnthropic(
        "claude-haiku-4-5-20251001",
        600,
        "Você analisa conversas de WhatsApp de joalherias. Responda APENAS com JSON válido, sem texto extra, sem markdown.",
        userMessage,
      );

      let analysis: Record<string, unknown>;
      try {
        const rawText = data.content[0].text;
        analysis = JSON.parse(rawText);
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

    // ─── Helper: build dashboard context ─────────────────────────────────
    const buildDashboardContext = async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();

      const [convCount, leadsNoReply, avgScore, topProdutos, topObjecoes, leadsByStatus, avgScores] =
        await Promise.all([
          supabaseAdmin
            .from("whatsapp_conversations")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .gte("last_message_at", thirtyDaysAgo),
          supabaseAdmin
            .from("whatsapp_conversations")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .lt("last_message_at", twoHoursAgo)
            .gte("last_message_at", thirtyDaysAgo),
          supabaseAdmin
            .from("ai_conversation_analysis")
            .select("score_qualidade")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo),
          supabaseAdmin
            .from("ai_conversation_analysis")
            .select("produto_interesse")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo)
            .not("produto_interesse", "is", null),
          supabaseAdmin
            .from("ai_conversation_analysis")
            .select("objecao_detectada")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo)
            .not("objecao_detectada", "is", null),
          supabaseAdmin
            .from("ai_conversation_analysis")
            .select("status_lead")
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo),
          supabaseAdmin
            .from("ai_conversation_analysis")
            .select(
              "score_empatia, score_clareza, score_velocidade, score_followup, score_contorno_objecao, score_cta, score_personalizacao",
            )
            .eq("tenant_id", tenantId!)
            .gte("analyzed_at", thirtyDaysAgo),
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

    // ─── ask_ai ──────────────────────────────────────────────────────────
    if (action === "ask_ai") {
      const question = payload.question as string;
      if (!question) return jsonResponse({ error: "question is required" }, 400);

      // Check cache
      let context: Record<string, unknown> | null = null;
      const { data: cache } = await supabaseAdmin
        .from("ai_dashboard_cache")
        .select("data, generated_at")
        .eq("tenant_id", tenantId!)
        .maybeSingle();

      if (cache && Date.now() - new Date(cache.generated_at).getTime() < 30 * 60000) {
        context = cache.data as Record<string, unknown>;
      } else {
        context = await buildDashboardContext();
        await supabaseAdmin
          .from("ai_dashboard_cache")
          .upsert(
            { tenant_id: tenantId!, data: context, generated_at: new Date().toISOString() },
            { onConflict: "tenant_id" },
          );
      }

      const data = await callAnthropic(
        "claude-sonnet-4-6",
        1024,
        "Você é um consultor especialista em vendas de joalherias. Analise os dados fornecidos e responda de forma direta, prática e em português brasileiro. Seja específico com números quando disponíveis.",
        `Dados da joalheria (últimos 30 dias):\n${JSON.stringify(context, null, 2)}\n\nPergunta do gestor: ${question}`,
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

      const data = await callAnthropic("claude-haiku-4-5-20251001", 300, undefined, userMsg);
      return jsonResponse({ script: data.content[0].text });
    }

    // ─── get_dashboard ───────────────────────────────────────────────────
    if (action === "get_dashboard") {
      const forceRefresh = payload.force_refresh === true;

      if (!forceRefresh) {
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
      const context = await buildDashboardContext();

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
      const { data: leadsList } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select(
          "id, contact_name, contact_phone, last_message, last_message_at",
        )
        .eq("tenant_id", tenantId!)
        .lt("last_message_at", twoHoursAgo)
        .gte("last_message_at", sevenDaysAgo)
        .order("last_message_at", { ascending: true })
        .limit(20);

      // Enrich with analysis data
      const enrichedLeads = [];
      if (leadsList) {
        const convIds = leadsList.map((l: { id: string }) => l.id);
        const { data: analyses } = convIds.length > 0
          ? await supabaseAdmin
              .from("ai_conversation_analysis")
              .select("conversation_id, produto_interesse, objecao_detectada, status_lead")
              .in("conversation_id", convIds)
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

      // Best approaches
      const { data: bestApproaches } = await supabaseAdmin
        .from("ai_conversation_analysis")
        .select("conversation_id, produto_interesse, score_qualidade, resumo, sentimento")
        .eq("tenant_id", tenantId!)
        .gte("score_qualidade", 8)
        .eq("sentimento", "positivo")
        .order("analyzed_at", { ascending: false })
        .limit(6);

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

      // Save cache
      await supabaseAdmin
        .from("ai_dashboard_cache")
        .upsert(
          { tenant_id: tenantId!, data: fullData, generated_at: new Date().toISOString() },
          { onConflict: "tenant_id" },
        );

      return jsonResponse({ data: fullData });
    }

    // ─── get_insights ─────────────────────────────────────────────────────
    if (action === "get_insights") {
      const context = await buildDashboardContext();

      // Fetch extra detail: top conversion analysis
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [recentAnalyses, weekAnalyses] = await Promise.all([
        supabaseAdmin
          .from("ai_conversation_analysis")
          .select("status_lead, sentimento, score_qualidade, horas_sem_resposta, produto_interesse, objecao_detectada")
          .eq("tenant_id", tenantId!)
          .gte("analyzed_at", thirtyDaysAgo),
        supabaseAdmin
          .from("ai_conversation_analysis")
          .select("status_lead, score_qualidade")
          .eq("tenant_id", tenantId!)
          .gte("analyzed_at", sevenDaysAgo),
      ]);

      const allAnalyses = recentAnalyses.data || [];
      const weekData = weekAnalyses.data || [];

      // Compute enriched stats for prompt
      const totalAnalyzed = allAnalyses.length;
      const hotCount = allAnalyses.filter((a: Record<string, unknown>) => a.status_lead === "quente").length;
      const coldCount = allAnalyses.filter((a: Record<string, unknown>) => a.status_lead === "frio").length;
      const lostCount = allAnalyses.filter((a: Record<string, unknown>) => a.status_lead === "perdido").length;
      const avgResponseH = allAnalyses.filter((a: Record<string, unknown>) => a.horas_sem_resposta !== null)
        .reduce((s: number, a: Record<string, unknown>) => s + (a.horas_sem_resposta as number), 0) /
        (allAnalyses.filter((a: Record<string, unknown>) => a.horas_sem_resposta !== null).length || 1);
      const frustratedCount = allAnalyses.filter((a: Record<string, unknown>) => a.sentimento === "frustrado").length;
      const weekAvgScore = weekData.length > 0
        ? weekData.reduce((s: number, a: Record<string, unknown>) => s + ((a.score_qualidade as number) || 0), 0) / weekData.length
        : null;

      const enrichedContext = {
        ...context,
        total_conversas_analisadas: totalAnalyzed,
        leads_quentes: hotCount,
        leads_frios: coldCount,
        leads_perdidos: lostCount,
        media_horas_sem_resposta: Math.round(avgResponseH * 10) / 10,
        clientes_frustrados: frustratedCount,
        score_medio_semana: weekAvgScore ? Math.round(weekAvgScore * 10) / 10 : null,
        taxa_conversao_estimada_pct: totalAnalyzed > 0 ? Math.round((hotCount / totalAnalyzed) * 100) : 0,
      };

      const insightsData = await callAnthropic(
        "claude-sonnet-4-6",
        2000,
        `Você é um consultor sênior de vendas especializado em joalherias de varejo.
Analise os dados e gere exatamente 6 insights estratégicos e altamente acionáveis.
Cada insight deve ser específico com os números fornecidos, não genérico.
Retorne APENAS um JSON válido com o array "insights" onde cada item tem:
{
  "tipo": "urgente" | "oportunidade" | "alerta" | "tendencia",
  "titulo": string (máx 55 chars, impactante),
  "descricao": string (máx 220 chars, cite números reais dos dados),
  "acao": string (máx 100 chars, ação concreta e específica)
}
Priorize: risco de receita, oportunidades de conversão, eficiência operacional, padrões sazonais de joalherias (datas comemorativas próximas), e coaching de equipe.`,
        `Dados joalheria (30 dias):\n${JSON.stringify(enrichedContext, null, 2)}\n\nGere 6 insights estratégicos altamente acionáveis para o gestor.`,
      );

      let parsed: { insights: unknown[] };
      try {
        const raw = insightsData.content[0].text.trim();
        const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        parsed = JSON.parse(cleaned);
      } catch {
        return jsonResponse({ error: "Failed to parse insights" }, 422);
      }

      return jsonResponse({ insights: parsed.insights });
    }

    // ─── get_temporal_patterns ─────────────────────────────────────────────
    if (action === "get_temporal_patterns") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      const { data: messages } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("created_at, direction")
        .eq("tenant_id", tenantId!)
        .gte("created_at", thirtyDaysAgo);

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

      const { data: analyses } = await supabaseAdmin
        .from("ai_conversation_analysis")
        .select(
          "conversation_id, status_lead, produto_interesse, objecao_detectada, score_qualidade, horas_sem_resposta, resumo, sentimento, analyzed_at",
        )
        .eq("tenant_id", tenantId!)
        .gte("analyzed_at", thirtyDaysAgo)
        .in("status_lead", ["quente", "morno"]);

      if (!analyses || analyses.length === 0) {
        return jsonResponse({ hot_leads: [], warm_leads: [] });
      }

      const convIds = analyses.map((a: Record<string, unknown>) => a.conversation_id as string);
      const { data: convs } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone, last_message, last_message_at")
        .in("id", convIds);

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

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("ai-analysis error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
