import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY não configurada");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Não autorizado");

    const { conversationId, analysisType = "full", messageLimit = 50 } = await req.json();
    if (!conversationId) throw new Error("conversationId obrigatório");

    // Buscar conversa
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*, tenants(name)")
      .eq("id", conversationId)
      .single();

    if (!conversation) throw new Error("Conversa não encontrada");

    // Verificar permissão
    const { data: hasAccess } = await supabase
      .from("tenant_assignments")
      .select("id")
      .eq("manager_id", user.id)
      .eq("tenant_id", conversation.tenant_id)
      .maybeSingle();

    const { data: isAdmin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]);

    if (!hasAccess && !isAdmin?.length) throw new Error("Sem permissão");

    // Buscar mensagens
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(messageLimit);

    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "Sem mensagens" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Formatar mensagens para Claude
    const formatted = messages.map(m => {
      const sender = m.direction === "inbound" 
        ? (conversation.contact_name || "Cliente")
        : "Empresa";
      return `[${new Date(m.created_at).toLocaleString("pt-BR")}] ${sender}: ${m.content || "[Mídia]"}`;
    }).join("\n");

    // Prompt para Claude
    const systemPrompt = `Você é um analista de conversas de vendas para joalherias. 
Analise a conversa e retorne APENAS um JSON válido.

Cliente: ${conversation.contact_name || "Não identificado"}
Telefone: ${conversation.contact_phone || "N/A"}

Mensagens:
${formatted}`;

    const userPrompt = `Analise e retorne JSON:
{
  "sentiment_score": (número -1 a 1),
  "sentiment_label": "positivo" | "neutro" | "negativo",
  "lead_score": (0-100),
  "qualification_level": "hot" | "warm" | "cold",
  "summary": "resumo em 2-3 frases",
  "key_insights": ["insight1", "insight2"],
  "action_items": ["ação1", "ação2"],
  "customer_intent": "intenção principal",
  "product_interest": ["produtos mencionados"],
  "buying_signals": ["sinais de compra"],
  "objections": ["objeções"],
  "urgency_level": "alta" | "média" | "baixa",
  "budget_indication": "estimativa ou não identificado"
}

Retorne APENAS o JSON, sem texto extra.`;

    // Chamar Claude
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeResp.ok) throw new Error("Erro na API do Claude");

    const claudeData = await claudeResp.json();
    const analysisText = claudeData.content[0].text;
    
    // Parse JSON
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch {
      const match = analysisText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Resposta inválida do Claude");
      analysis = JSON.parse(match[0]);
    }

    // Salvar no banco
    const { data: saved } = await supabase
      .from("conversation_ai_analysis")
      .insert({
        conversation_id: conversationId,
        tenant_id: conversation.tenant_id,
        analysis_type: analysisType,
        analysis_result: analysis,
        sentiment_score: analysis.sentiment_score,
        lead_score: analysis.lead_score,
        key_insights: analysis.key_insights,
        action_items: analysis.action_items,
        tags: analysis.tags || [],
        analyzed_by: user.id,
      })
      .select()
      .single();

    return new Response(JSON.stringify({ success: true, analysis, saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
