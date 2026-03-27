// evolution-api.ts
// Edge Function: API principal do CRM — envio de mensagens, gestão de instâncias,
// busca de conversas e mídias.
// Correções: list_messages com escopo tenant obrigatório, get_media com URL
//            MinIO priorizada, list_conversations paginado, send_media com
//            URL permanente no retorno, timeout em todas as chamadas externas.

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

// ─── Utilitários ──────────────────────────────────────────────────────────────

const normalizePhone = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const base = value.includes("@") ? value.split("@")[0] : value;
  const digits = base.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
};

const extractPhoneNumber = (payload: Record<string, any> | null | undefined): string | null => {
  if (!payload) return null;
  const candidates: unknown[] = [
    payload?.instance?.phone, payload?.instance?.number, payload?.instance?.owner,
    payload?.instance?.ownerJid, payload?.instance?.wid, payload?.instance?.wuid,
    payload?.instance?.me?.id, payload?.instance?.me?.jid,
    payload?.number, payload?.owner, payload?.wid, payload?.wuid,
  ];
  for (const c of candidates) {
    if (typeof c === "string") { const p = normalizePhone(c); if (p) return p; }
    if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const p = normalizePhone(o.id) || normalizePhone(o.user) || normalizePhone(o.jid);
      if (p) return p;
    }
  }
  return null;
};

const decodeJwtSub = (jwt: string): string | null => {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch { return null; }
};

/** Retorna true se a URL pertence ao CDN temporário do WhatsApp */
const isExpirableWhatsAppUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return (
    url.includes("mmg.whatsapp.net") ||
    url.includes("media.whatsapp") ||
    url.includes("media-") ||
    url.includes(".enc?")
  );
};

/** fetch() com timeout automático */
const fetchWithTimeout = (url: string, init: RequestInit, ms = 8000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

// ─── Servidor ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!EVOLUTION_API_URL) return jsonResponse({ error: "EVOLUTION_API_URL is not configured" }, 500);
  if (!EVOLUTION_API_KEY) return jsonResponse({ error: "EVOLUTION_API_KEY is not configured" }, 500);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY)
    return jsonResponse({ error: "Supabase environment is not configured" }, 500);

  const rawAuthHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  const bearerMatch = rawAuthHeader?.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) return jsonResponse({ error: "Unauthorized" }, 401);

  const token = bearerMatch[1]?.trim();
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Validação de token com fallback por sub
  let userId: string | null = null;
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

  const tenantId = roleData.tenant_id;

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const action = body.action as string | undefined;
    const instanceName = body.instanceName as string | undefined;
    const displayName = body.displayName as string | undefined;
    const importContacts = body.importContacts as boolean | undefined;
    const ignoreGroups = body.ignoreGroups as boolean | undefined;
    if (!action) return jsonResponse({ error: "action is required" }, 400);

    const normalizedUrl = EVOLUTION_API_URL.trim().replace(/\/$/, "");
    const baseUrl = normalizedUrl.endsWith("/manager")
      ? normalizedUrl.slice(0, -"/manager".length)
      : normalizedUrl;
    const evoHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    };

    const parseEvolutionResponse = async (response: Response, operation: string): Promise<any> => {
      const responseText = await response.text();
      let parsed: any = null;
      try { parsed = responseText ? JSON.parse(responseText) : null; } catch { parsed = null; }
      if (!parsed) {
        const snippet = responseText.substring(0, 180).replace(/\s+/g, " ").trim();
        throw new Error(
          `Evolution API ${operation} invalid response [${response.status}]: ${snippet || "empty body"}`,
        );
      }
      if (!response.ok)
        throw new Error(`Evolution API ${operation} failed [${response.status}]: ${JSON.stringify(parsed)}`);
      return parsed;
    };

    const requestEvolution = async (path: string, init: RequestInit, operation: string): Promise<any> => {
      const res = await fetchWithTimeout(
        `${baseUrl}${path}`,
        { ...init, headers: { ...evoHeaders, ...(init.headers || {}) } },
      );
      return parseEvolutionResponse(res, operation);
    };

    const getInstanceRow = async (name: string) => {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, instance_name")
        .eq("tenant_id", tenantId)
        .eq("instance_name", name)
        .limit(1)
        .maybeSingle();
      return data;
    };

    const ensureOutboundConversation = async (name: string, remoteJid: string) => {
      const instance = await getInstanceRow(name);
      if (!instance) return null;
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("instance_id", instance.id)
        .eq("remote_jid", remoteJid)
        .limit(1)
        .maybeSingle();
      if (existing) return { conversationId: existing.id, instanceId: instance.id };
      const contactPhone = remoteJid.replace(/@.*$/, "");
      const guessedName = remoteJid.endsWith("@g.us")
        ? `Grupo ${contactPhone}`
        : contactPhone;
      const { data: created, error: convError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .insert({
          tenant_id: tenantId,
          instance_id: instance.id,
          remote_jid: remoteJid,
          contact_name: guessedName || null,
          contact_phone: contactPhone || null,
          last_message: null,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          status: "open",
        })
        .select("id")
        .single();
      if (convError) throw new Error(`Failed to create outbound conversation: ${convError.message}`);
      return { conversationId: created.id, instanceId: instance.id };
    };

    const persistOutboundMessage = async (params: {
      instanceName: string;
      remoteJid: string;
      messageId?: string | null;
      content: string | null;
      mediaType?: string | null;
      mediaUrl?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      const conversationData = await ensureOutboundConversation(params.instanceName, params.remoteJid);
      if (!conversationData) return;
      const { conversationId } = conversationData;
      if (params.messageId) {
        const { data: existing } = await supabaseAdmin
          .from("whatsapp_messages")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("conversation_id", conversationId)
          .eq("message_id", params.messageId)
          .limit(1)
          .maybeSingle();
        if (existing) return;
      }
      const nowIso = new Date().toISOString();
      await Promise.all([
        supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          message_id: params.messageId || null,
          direction: "outbound",
          content: params.content,
          media_url: params.mediaUrl || null,
          media_type: params.mediaType || null,
          status: "sent",
          created_at: nowIso,
          metadata: params.metadata || {},
        }),
        supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            last_message: params.content || (params.mediaType ? `[${params.mediaType}]` : ""),
            last_message_at: nowIso,
          })
          .eq("tenant_id", tenantId)
          .eq("id", conversationId),
      ]);
    };

    // ── create_instance ──────────────────────────────────────────────────────
    if (action === "create_instance") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);

      // Build webhook URL for this Supabase project
      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;

      const createPayload = JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        groupsIgnore: ignoreGroups === true,
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONNECTION_UPDATE",
            "CHATS_UPDATE",
            "PRESENCE_UPDATE",
            "GROUPS_UPDATE",
            "SEND_MESSAGE",
          ],
        },
      });
      const createPaths = ["/instance/create", "/api/instance/create", "/manager/api/instance/create"];
      let evoData: any = null;
      let lastErr: unknown = null;
      for (const p of createPaths) {
        try {
          evoData = await requestEvolution(p, { method: "POST", body: createPayload }, "create_instance");
          break;
        } catch (e) {
          lastErr = e;
          if (!(e instanceof Error && e.message.includes("[404]"))) throw e;
        }
      }
      if (!evoData) throw lastErr instanceof Error ? lastErr : new Error("create_instance failed");

      // Also try to set webhook via dedicated endpoint (some Evolution versions need this)
      try {
        await requestEvolution(
          `/webhook/set/${instanceName}`,
          {
            method: "POST",
            body: JSON.stringify({
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: false,
              events: [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "CONNECTION_UPDATE",
              ],
              enabled: true,
            }),
          },
          "set_webhook",
        );
      } catch (whErr) {
        console.warn("Could not set webhook via dedicated endpoint, relying on create payload:", whErr);
      }

      const phoneNumber = extractPhoneNumber(evoData);
      const { error: dbError } = await supabaseAdmin.from("whatsapp_instances").insert({
        tenant_id: tenantId,
        instance_name: instanceName,
        display_name: displayName || null,
        instance_id: evoData.instance?.instanceName || instanceName,
        status: "connecting",
        phone_number: phoneNumber,
        qr_code: evoData.qrcode?.base64 || null,
        settings: {
          importContacts: importContacts === true,
          ignoreGroups: ignoreGroups === true,
        },
      });
      if (dbError) throw new Error(`Failed to persist instance: ${dbError.message}`);
      return jsonResponse({ success: true, instance: evoData.instance, qrcode: evoData.qrcode });
    }

    // ── get_qrcode ────────────────────────────────────────────────────────────
    if (action === "get_qrcode") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const evoData = await requestEvolution(
        `/instance/connect/${instanceName}`,
        { method: "GET" },
        "get_qrcode",
      );
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ qr_code: evoData.base64 || null, status: "connecting" })
        .eq("tenant_id", tenantId)
        .eq("instance_name", instanceName);
      return jsonResponse({ success: true, qrcode: evoData });
    }

    // ── connection_status ─────────────────────────────────────────────────────
    if (action === "connection_status") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const evoData = await requestEvolution(
        `/instance/connectionState/${instanceName}`,
        { method: "GET" },
        "connection_status",
      );
      const state = evoData.instance?.state || evoData.state;
      const isConnected = state === "open";
      const phoneNumber = extractPhoneNumber(evoData);
      const updatePayload: Record<string, unknown> = {
        status: isConnected ? "connected" : "connecting",
      };
      if (phoneNumber) updatePayload.phone_number = phoneNumber;
      if (isConnected) updatePayload.qr_code = null;
      await supabaseAdmin
        .from("whatsapp_instances")
        .update(updatePayload)
        .eq("tenant_id", tenantId)
        .eq("instance_name", instanceName);
      return jsonResponse({ success: true, state, connected: isConnected, phoneNumber });
    }

    // ── list_instances ────────────────────────────────────────────────────────
    if (action === "list_instances") {
      const { data: instances, error: listError } = await supabaseAdmin
        .from("whatsapp_instances")
        .select(
          "id, tenant_id, instance_name, display_name, instance_id, status, phone_number, settings, created_at, updated_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (listError) throw new Error(`DB list error: ${listError.message}`);
      if (!instances || instances.length === 0)
        return jsonResponse({ success: true, instances: [] });

      const synced = await Promise.all(
        instances.map(async (inst) => {
          try {
            const res = await fetchWithTimeout(
              `${baseUrl}/instance/connectionState/${inst.instance_name}`,
              { method: "GET", headers: evoHeaders },
            );
            if (res.status === 404) {
              await supabaseAdmin
                .from("whatsapp_instances")
                .delete()
                .eq("tenant_id", tenantId)
                .eq("id", inst.id);
              return null;
            }
            const evoState = await parseEvolutionResponse(res, "sync_connection_status");
            const state = evoState.instance?.state || evoState.state;
            const nextStatus = state === "open" ? "connected" : "connecting";
            const phoneNumber = extractPhoneNumber(evoState);
            const dbPatch: Record<string, unknown> = {};
            const rPatch: Record<string, unknown> = {};
            if (inst.status !== nextStatus) { dbPatch.status = nextStatus; rPatch.status = nextStatus; }
            if (phoneNumber && phoneNumber !== inst.phone_number) {
              dbPatch.phone_number = phoneNumber;
              rPatch.phone_number = phoneNumber;
            }
            if (nextStatus === "connected") dbPatch.qr_code = null;
            if (Object.keys(dbPatch).length > 0) {
              await supabaseAdmin
                .from("whatsapp_instances")
                .update(dbPatch)
                .eq("tenant_id", tenantId)
                .eq("id", inst.id);
            }
            return { ...inst, ...rPatch };
          } catch (e) {
            console.warn(`Could not sync instance ${inst.instance_name}:`, e);
            return inst;
          }
        }),
      );
      return jsonResponse({ success: true, instances: synced.filter(Boolean) });
    }

    // ── set_webhook (configure webhook for an existing instance) ─────────────
    if (action === "set_webhook") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      await getInstanceRow(instanceName); // ensures tenant ownership
      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
      const result = await requestEvolution(
        `/webhook/set/${instanceName}`,
        {
          method: "POST",
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: [
              "MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE",
              "CHATS_UPDATE", "PRESENCE_UPDATE", "GROUPS_UPDATE", "SEND_MESSAGE",
            ],
            enabled: true,
          }),
        },
        "set_webhook",
      );
      return jsonResponse({ success: true, result });
    }

    // ── delete_instance ───────────────────────────────────────────────────────
    if (action === "delete_instance") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const instance = await getInstanceRow(instanceName);

      // Delete from Evolution API — try both logout + delete endpoints
      let evoDeleted = false;
      try {
        // First try to logout (disconnect) the instance
        try {
          await fetchWithTimeout(
            `${baseUrl}/instance/logout/${instanceName}`,
            { method: "DELETE", headers: evoHeaders },
            8000,
          );
          console.log(`[delete_instance] Logout OK: ${instanceName}`);
        } catch (logoutErr) {
          console.log(`[delete_instance] Logout failed (non-critical): ${(logoutErr as Error).message}`);
        }

        // Then delete the instance
        const delRes = await fetchWithTimeout(
          `${baseUrl}/instance/delete/${instanceName}`,
          { method: "DELETE", headers: evoHeaders },
          8000,
        );
        const delText = await delRes.text();
        console.log(`[delete_instance] Evolution DELETE ${delRes.status}: ${delText.slice(0, 300)}`);
        evoDeleted = delRes.status >= 200 && delRes.status < 300;
      } catch (evoErr) {
        console.error(`[delete_instance] Evolution API error: ${(evoErr as Error).message}`);
        // Continue with local cleanup even if Evolution fails
      }

      // Clean up local database: messages → conversations → instance
      if (instance?.id) {
        // Delete messages first (FK dependency)
        await supabaseAdmin
          .from("whatsapp_messages")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("conversation_id", instance.id);

        // Get all conversation IDs for this instance to delete their messages
        const { data: convos } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("instance_id", instance.id);

        if (convos && convos.length > 0) {
          const convoIds = convos.map((c: any) => c.id);
          for (const cid of convoIds) {
            await supabaseAdmin
              .from("whatsapp_messages")
              .delete()
              .eq("conversation_id", cid);
          }
        }

        await supabaseAdmin
          .from("whatsapp_conversations")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("instance_id", instance.id);
      }
      await supabaseAdmin
        .from("whatsapp_instances")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("instance_name", instanceName);

      return jsonResponse({ success: true, evolution_deleted: evoDeleted });
    }

    // ── send_text ─────────────────────────────────────────────────────────────
    if (action === "send_text") {
      const { remoteJid, text, quotedMessageId } = body as {
        remoteJid?: string; text?: string; quotedMessageId?: string;
      };
      if (!instanceName || !remoteJid || !text)
        return jsonResponse({ error: "instanceName, remoteJid e text são obrigatórios" }, 400);
      const sendBody: Record<string, unknown> = { number: remoteJid, text };
      if (quotedMessageId) sendBody.quoted = { key: { id: quotedMessageId, remoteJid } };
      const evoData = await requestEvolution(
        `/message/sendText/${instanceName}`,
        { method: "POST", body: JSON.stringify(sendBody) },
        "send_text",
      );
      const outboundMessageId =
        evoData?.key?.id || evoData?.data?.key?.id || evoData?.message?.key?.id || null;
      await persistOutboundMessage({
        instanceName,
        remoteJid,
        messageId: outboundMessageId,
        content: text,
        metadata: {
          key: evoData?.key || evoData?.data?.key || null,
          source: "send_text",
          quotedMessageId: quotedMessageId || null,
        },
      });
      return jsonResponse({ success: true, data: evoData });
    }

    // ── send_media ────────────────────────────────────────────────────────────
    // BUG CORRIGIDO: a URL permanente do MinIO agora é extraída corretamente
    // do retorno da Evolution API e salva no banco. Antes, se a mídia fosse
    // enviada como base64, a media_url ficava nula e o frontend não encontrava.
    if (action === "send_media") {
      const { remoteJid, mediatype, media, caption, fileName } = body as {
        remoteJid?: string; mediatype?: string; media?: string;
        caption?: string; fileName?: string;
      };
      const rawMedia = typeof media === "string" ? media.trim() : "";
      if (!instanceName || !remoteJid || !mediatype || !rawMedia)
        return jsonResponse({ error: "instanceName, remoteJid, mediatype e media são obrigatórios" }, 400);

      const isHttpUrl = /^https?:\/\//i.test(rawMedia);
      const mediaPayload = isHttpUrl
        ? rawMedia
        : (rawMedia.startsWith("data:") ? rawMedia.split(",").slice(1).join(",") : rawMedia).replace(/\s/g, "");

      if (!mediaPayload)
        return jsonResponse({ error: "media deve ser URL ou base64 válido" }, 400);

      const sendBody: Record<string, unknown> = { number: remoteJid, mediatype, media: mediaPayload };
      if (caption) sendBody.caption = caption;
      if (fileName) sendBody.fileName = fileName;

      const evoData = await requestEvolution(
        `/message/sendMedia/${instanceName}`,
        { method: "POST", body: JSON.stringify(sendBody) },
        "send_media",
      );

      const outboundMessageId =
        evoData?.key?.id || evoData?.data?.key?.id || evoData?.message?.key?.id || null;

      const mediaLabelByType: Record<string, string> = {
        image: "[Imagem]", audio: "[Áudio]", video: "[Vídeo]",
        document: fileName || "[Documento]", sticker: "[Sticker]",
      };

      // Extrai URL permanente da resposta da Evolution (MinIO)
      // Prioriza campos não-expiráveis; aceita URL de origem se for HTTP
      const evoReturnedUrl: string | null =
        evoData?.mediaUrl || evoData?.data?.mediaUrl ||
        evoData?.fileUrl || evoData?.data?.fileUrl || null;

      const safeMediaUrl: string | null = (() => {
        if (isHttpUrl && !isExpirableWhatsAppUrl(rawMedia)) return rawMedia;
        if (evoReturnedUrl && !isExpirableWhatsAppUrl(evoReturnedUrl)) return evoReturnedUrl;
        if (evoReturnedUrl) return evoReturnedUrl; // CDN como fallback
        return null;
      })();

      await persistOutboundMessage({
        instanceName,
        remoteJid,
        messageId: outboundMessageId,
        content: caption?.trim() || mediaLabelByType[mediatype] || "[Mídia]",
        mediaType: mediatype,
        mediaUrl: safeMediaUrl,
        metadata: {
          key: evoData?.key || evoData?.data?.key || null,
          mediatype,
          fileName: fileName || null,
          source: "send_media",
          isBase64Upload: !isHttpUrl,
        },
      });

      return jsonResponse({ success: true, data: evoData });
    }

    // ── list_conversations ────────────────────────────────────────────────────
    // BUG CORRIGIDO: adicionado limit com paginação via cursor (before_id).
    // Sem limit, conversas com muitos registros travavam o frontend.
    if (action === "list_conversations") {
      const {
        instanceId: filterInstanceId,
        limit: reqLimit,
        before_id: beforeId,
      } = body as { instanceId?: string; limit?: number; before_id?: string };

      const effectiveLimit = Math.min(Number(reqLimit) || 50, 200);

      let query = supabaseAdmin
        .from("whatsapp_conversations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("last_message_at", { ascending: false })
        .limit(effectiveLimit);

      if (filterInstanceId) query = query.eq("instance_id", filterInstanceId);

      // Cursor-based pagination: busca conversas mais antigas que o ID dado
      if (beforeId) {
        const { data: pivot } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("last_message_at")
          .eq("id", beforeId)
          .maybeSingle();
        if (pivot?.last_message_at) {
          query = query.lt("last_message_at", pivot.last_message_at);
        }
      }

      const { data: conversations, error } = await query;
      if (error) throw new Error(`DB error: ${error.message}`);

      const placeholderMap: Record<string, string> = {
        "[Imagem]": "Imagem", "[Áudio]": "Áudio", "[Vídeo]": "Vídeo",
        "[Sticker]": "Sticker", "[Documento]": "Documento", "[Mídia]": "Mídia",
      };

      const normalizePreview = (value: string | null) => {
        if (!value) return value;
        const trimmed = value.trim();
        if (placeholderMap[trimmed]) return placeholderMap[trimmed];
        const colonIndex = trimmed.lastIndexOf(": ");
        if (colonIndex > 0) {
          const sender = trimmed.slice(0, colonIndex);
          const suffix = trimmed.slice(colonIndex + 2).trim();
          if (placeholderMap[suffix]) return `${sender}: ${placeholderMap[suffix]}`;
        }
        return value;
      };

      // Deduplicação por (instance_id, remote_jid) mantendo a mais recente
      const dedupedMap = new Map<string, Record<string, any>>();
      for (const conv of conversations || []) {
        const key = `${conv.instance_id}:${conv.remote_jid}`;
        const normalized = { ...conv, last_message: normalizePreview(conv.last_message) };
        const existing = dedupedMap.get(key);
        if (!existing) { dedupedMap.set(key, normalized); continue; }
        const existingTs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
        const currentTs = normalized.last_message_at ? new Date(normalized.last_message_at).getTime() : 0;
        const existingUpdTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
        const currentUpdTs = normalized.updated_at ? new Date(normalized.updated_at).getTime() : 0;
        const keepCurrent = currentTs > existingTs || (currentTs === existingTs && currentUpdTs >= existingUpdTs);
        const winner = keepCurrent ? normalized : existing;
        const loser = keepCurrent ? existing : normalized;
        dedupedMap.set(key, {
          ...winner,
          contact_name: winner.contact_name || loser.contact_name,
          contact_phone: winner.contact_phone || loser.contact_phone,
          last_message: winner.last_message || loser.last_message,
          last_message_at: winner.last_message_at || loser.last_message_at,
          unread_count: Math.max(Number(existing.unread_count || 0), Number(normalized.unread_count || 0)),
        });
      }

      const deduped = Array.from(dedupedMap.values()).sort((a, b) => {
        const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTs - aTs;
      });

      return jsonResponse({
        success: true,
        conversations: deduped,
        hasMore: deduped.length === effectiveLimit,
      });
    }

    // ── list_messages ─────────────────────────────────────────────────────────
    // BUG CORRIGIDO: adicionado filtro por tenant_id na verificação de posse
    // da conversa antes de retornar mensagens. Sem essa verificação, qualquer
    // usuário autenticado podia ler mensagens de qualquer conversa pelo ID.
    if (action === "list_messages") {
      const { conversationId, limit: msgLimit, before_id: beforeMsgId } = body as {
        conversationId?: string; limit?: number; before_id?: string;
      };
      if (!conversationId) return jsonResponse({ error: "conversationId é obrigatório" }, 400);

      // Verifica que a conversa pertence ao tenant do usuário
      const { data: convCheck } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id", conversationId)
        .limit(1)
        .maybeSingle();
      if (!convCheck) return jsonResponse({ error: "Conversa não encontrada" }, 404);

      const effectiveLimit = Math.min(Number(msgLimit) || 50, 200);

      let query = supabaseAdmin
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(effectiveLimit);

      // Cursor-based pagination para carregar mensagens mais antigas
      if (beforeMsgId) {
        const { data: pivot } = await supabaseAdmin
          .from("whatsapp_messages")
          .select("created_at")
          .eq("id", beforeMsgId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (pivot?.created_at) {
          query = query.lt("created_at", pivot.created_at);
        }
      }

      const { data: messages, error } = await query;
      if (error) throw new Error(`DB error: ${error.message}`);

      // Zera contador de não lidas em background
      supabaseAdmin
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("tenant_id", tenantId)
        .eq("id", conversationId)
        .then(() => {}, console.error);

      return jsonResponse({
        success: true,
        messages: (messages || []).reverse(),
        hasMore: (messages || []).length === effectiveLimit,
      });
    }

    // ── update_display_name ───────────────────────────────────────────────────
    if (action === "update_display_name") {
      if (!instanceName || !displayName)
        return jsonResponse({ error: "instanceName e displayName são obrigatórios" }, 400);
      const { error } = await supabaseAdmin
        .from("whatsapp_instances")
        .update({ display_name: displayName })
        .eq("tenant_id", tenantId)
        .eq("instance_name", instanceName);
      if (error) throw new Error(`DB update error: ${error.message}`);
      return jsonResponse({ success: true });
    }

    // ── fetch_group_info ──────────────────────────────────────────────────────
    if (action === "fetch_group_info") {
      const { remoteJid } = body as { remoteJid?: string };
      if (!instanceName || !remoteJid)
        return jsonResponse({ error: "instanceName e remoteJid são obrigatórios" }, 400);
      if (!remoteJid.endsWith("@g.us"))
        return jsonResponse({ success: true, isGroup: false });

      const encodedJid = encodeURIComponent(remoteJid);
      const attempts: Array<{ path: string; method: string; body?: string }> = [
        { path: `/group/findGroupInfos/${instanceName}?groupJid=${encodedJid}`, method: "GET" },
        { path: `/chat/findGroupInfos/${instanceName}?groupJid=${encodedJid}`, method: "GET" },
        {
          path: `/group/findGroupInfos/${instanceName}`,
          method: "POST",
          body: JSON.stringify({ groupJid: remoteJid }),
        },
        { path: `/group/fetchAllGroups/${instanceName}?getParticipants=true`, method: "GET" },
      ];

      for (const a of attempts) {
        try {
          const init: RequestInit = { method: a.method };
          if (a.body) init.body = a.body;
          const evoData = await requestEvolution(a.path, init, "fetch_group_info");
          let groupData = evoData;
          if (Array.isArray(evoData)) {
            groupData = evoData.find((g: any) => g.id === remoteJid || g.jid === remoteJid) || null;
            if (!groupData) continue;
          }
          const subject =
            groupData?.subject || groupData?.name || groupData?.groupName || null;
          const desc =
            groupData?.desc || groupData?.description || groupData?.groupDesc || null;
          const rawParticipants = groupData?.participants || groupData?.members || [];
          const size = groupData?.size || rawParticipants.length || 0;
          const pictureUrl =
            groupData?.pictureUrl || groupData?.profilePictureUrl || null;

          if (subject) {
            const inst = await getInstanceRow(instanceName);
            if (inst?.id) {
              supabaseAdmin
                .from("whatsapp_conversations")
                .update({ contact_name: subject })
                .eq("tenant_id", tenantId)
                .eq("instance_id", inst.id)
                .eq("remote_jid", remoteJid)
                .then(() => {}, console.error);
            }
            const participants = rawParticipants.slice(0, 256).map((p: any) => ({
              id: p.id || p.jid || null,
              admin: p.admin || null,
              phone: normalizePhone(p.id || p.jid) || null,
            }));
            return jsonResponse({
              success: true,
              isGroup: true,
              subject,
              description: desc,
              size,
              pictureUrl,
              participants,
            });
          }
        } catch (e) {
          const isNotFound = e instanceof Error && e.message.includes("[404]");
          if (!isNotFound) console.warn("Group info fetch warning:", e);
        }
      }
      return jsonResponse({ success: true, isGroup: true, subject: null });
    }

    // ── get_profile_picture ───────────────────────────────────────────────────
    if (action === "get_profile_picture") {
      const { remoteJid } = body as { remoteJid?: string };
      if (!instanceName || !remoteJid)
        return jsonResponse({ error: "instanceName e remoteJid são obrigatórios" }, 400);
      const numberOnly = remoteJid.replace(/@.*$/, "");
      const requestBodies = [{ number: remoteJid }, { number: numberOnly }, { jid: remoteJid }];
      const picturePaths = [
        `/chat/fetchProfilePictureUrl/${instanceName}`,
        `/chat/fetchProfilePicture/${instanceName}`,
      ];
      for (const path of picturePaths) {
        for (const payload of requestBodies) {
          try {
            const evoData = await requestEvolution(
              path,
              { method: "POST", body: JSON.stringify(payload) },
              "get_profile_picture",
            );
            const url =
              evoData?.profilePictureUrl ||
              evoData?.picture ||
              evoData?.url ||
              evoData?.data?.profilePictureUrl ||
              null;
            if (url) return jsonResponse({ success: true, profilePictureUrl: url });
          } catch (e) {
            if (!(e instanceof Error && e.message.includes("[404]")))
              console.warn("Profile picture fetch warning:", e);
          }
        }
      }
      return jsonResponse({ success: true, profilePictureUrl: null });
    }

    // ── get_media ─────────────────────────────────────────────────────────────
    // BUG CORRIGIDO: a busca no banco agora inclui tenant_id (segurança) e
    // conversation_id quando disponível para não retornar a mídia errada.
    // A URL MinIO é retornada com prioridade sobre o CDN do WhatsApp.
    if (action === "get_media") {
      const { messageId, remoteJid: mediaJid, conversationId: mediaConvId } = body as {
        messageId?: string; remoteJid?: string; conversationId?: string;
      };
      if (!instanceName || !messageId)
        return jsonResponse({ error: "instanceName e messageId são obrigatórios" }, 400);

      const isExpirableUrl = (url: string) =>
        url.includes("mmg.whatsapp.net") ||
        url.includes("media.whatsapp.net") ||
        url.includes(".enc?");

      const fixMinioUrl = (url: string) => {
        let u = url
          .replace(/^http:\/\/minio:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/")
          .replace(/^http:\/\/82\.25\.70\.124:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/");
        if (u.includes("X-Amz-")) {
          try {
            const parsed = new URL(u);
            for (const k of [...parsed.searchParams.keys()]) {
              if (k.startsWith("X-Amz-")) parsed.searchParams.delete(k);
            }
            u = parsed.toString();
          } catch { /* keep as-is */ }
        }
        return u;
      };

      // Busca a mensagem com escopo de tenant (+ conversa se disponível)
      let msgQuery = supabaseAdmin
        .from("whatsapp_messages")
        .select("media_url, metadata, media_type, created_at")
        .eq("tenant_id", tenantId)
        .eq("message_id", messageId);

      if (mediaConvId) msgQuery = msgQuery.eq("conversation_id", mediaConvId);

      const { data: persistedMessage } = await msgQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const persistedMeta = (persistedMessage?.metadata || {}) as Record<string, unknown>;
      const persistedUrls = [
        persistedMessage?.media_url,
        typeof persistedMeta.mediaUrl === "string" ? persistedMeta.mediaUrl : null,
        typeof persistedMeta.url === "string" ? persistedMeta.url : null,
        typeof persistedMeta.fileUrl === "string" ? persistedMeta.fileUrl : null,
      ].filter((u): u is string => Boolean(u));

      // Prefere URL permanente (MinIO) sobre CDN
      const preferredPersistedUrl =
        persistedUrls.find((u) => !isExpirableUrl(u)) || persistedUrls[0] || null;

      // Se já temos URL permanente no banco, retorna imediatamente
      if (preferredPersistedUrl && !isExpirableUrl(preferredPersistedUrl)) {
        return jsonResponse({
          success: true,
          mediaData: null,
          mediaUrl: fixMinioUrl(preferredPersistedUrl),
          mimeType: persistedMessage?.media_type || null,
        });
      }

      // Para vídeos: pular base64 (arquivos grandes causam timeout na edge function)
      // Retorna apenas a URL — o browser faz o stream diretamente
      const isVideoMedia = persistedMessage?.media_type === "video" ||
        (persistedMessage?.media_type == null && persistedMessage?.media_url?.includes("video"));

      if (isVideoMedia && preferredPersistedUrl) {
        return jsonResponse({
          success: true,
          mediaData: null,
          mediaUrl: fixMinioUrl(preferredPersistedUrl),
          mimeType: persistedMessage?.media_type || null,
        });
      }

      // Tenta obter base64 ou URL via Evolution API
      const mediaPayload = {
        message: { key: { id: messageId, remoteJid: mediaJid || "" } },
      };
      const mediaPaths = [
        `/chat/getBase64FromMediaMessage/${instanceName}`,
        `/message/getBase64FromMediaMessage/${instanceName}`,
      ];

      for (const path of mediaPaths) {
        try {
          const evoData = await requestEvolution(
            path,
            { method: "POST", body: JSON.stringify(mediaPayload) },
            "get_media",
          );
          const base64 = isVideoMedia ? null : (evoData?.base64 || evoData?.data?.base64 || null);
          const evoMediaUrl =
            evoData?.mediaUrl || evoData?.data?.mediaUrl ||
            evoData?.fileUrl || evoData?.url || null;
          const mimeType =
            evoData?.mimetype || evoData?.data?.mimetype || evoData?.mimeType || null;

          if (base64) {
            const prefix = mimeType
              ? `data:${mimeType};base64,`
              : "data:application/octet-stream;base64,";
            // Salva URL permanente em background se disponível
            if (evoMediaUrl && !isExpirableUrl(evoMediaUrl) && persistedMessage) {
              supabaseAdmin
                .from("whatsapp_messages")
                .update({ media_url: evoMediaUrl })
                .eq("tenant_id", tenantId)
                .eq("message_id", messageId)
                .then(() => {}, console.error);
            }
            return jsonResponse({
              success: true,
              mediaData: `${prefix}${base64}`,
              mediaUrl: evoMediaUrl || preferredPersistedUrl,
              mimeType,
            });
          }

          // Sem base64 — usa a melhor URL disponível
          const bestUrl =
            evoMediaUrl && !isExpirableUrl(evoMediaUrl)
              ? fixMinioUrl(evoMediaUrl)
              : preferredPersistedUrl ? fixMinioUrl(preferredPersistedUrl) : evoMediaUrl || null;

          if (bestUrl) {
            // Salva URL permanente em background
            if (bestUrl && !isExpirableUrl(bestUrl) && persistedMessage) {
              supabaseAdmin
                .from("whatsapp_messages")
                .update({ media_url: bestUrl })
                .eq("tenant_id", tenantId)
                .eq("message_id", messageId)
                .then(() => {}, console.error);
            }
            return jsonResponse({
              success: true,
              mediaData: null,
              mediaUrl: bestUrl,
              mimeType: mimeType || persistedMessage?.media_type || null,
            });
          }
        } catch (e) {
          console.warn("Media download warning:", e);
        }
      }

      // Último recurso: URL que estava no banco (mesmo que seja CDN)
      if (preferredPersistedUrl) {
        return jsonResponse({
          success: true,
          mediaData: null,
          mediaUrl: preferredPersistedUrl,
          mimeType: persistedMessage?.media_type || null,
        });
      }

      return jsonResponse({ success: true, mediaData: null, mediaUrl: null });
    }

    // ── create_tag ────────────────────────────────────────────────────────────
    if (action === "create_tag") {
      const { name, color } = body as { name?: string; color?: string };
      if (!name) return jsonResponse({ error: "name é obrigatório" }, 400);
      const { error } = await supabaseAdmin.from("tags").upsert(
        {
          tenant_id: tenantId,
          name: name.trim().toLowerCase(),
          color: color || "#6366f1",
        },
        { onConflict: "tenant_id,name" },
      );
      if (error) throw new Error(`Create tag error: ${error.message}`);
      return jsonResponse({ success: true });
    }

    // ── get_contact ───────────────────────────────────────────────────────────
    if (action === "get_contact") {
      const { contactId } = body as { contactId?: string };
      if (!contactId) return jsonResponse({ error: "contactId é obrigatório" }, 400);
      const { data: contact, error } = await supabaseAdmin
        .from("contacts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", contactId)
        .single();
      if (error) return jsonResponse({ error: "Contato não encontrado" }, 404);
      return jsonResponse({ success: true, contact });
    }

    // ── update_contact ────────────────────────────────────────────────────────
    if (action === "update_contact") {
      const { contactId, fields } = body as {
        contactId?: string; fields?: Record<string, unknown>;
      };
      if (!contactId || !fields)
        return jsonResponse({ error: "contactId e fields são obrigatórios" }, 400);
      const allowed = ["name", "email", "phone", "company", "notes", "tags", "custom_fields"];
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) { if (k in fields) patch[k] = fields[k]; }
      const { error } = await supabaseAdmin
        .from("contacts")
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("id", contactId);
      if (error) throw new Error(`Update contact error: ${error.message}`);
      if (patch.name) {
        supabaseAdmin
          .from("whatsapp_conversations")
          .update({ contact_name: patch.name as string })
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .then(() => {}, console.error);
      }
      return jsonResponse({ success: true });
    }

    // ── get_group_invite_link ─────────────────────────────────────────────────
    if (action === "get_group_invite_link") {
      const { remoteJid } = body as { remoteJid?: string };
      if (!instanceName || !remoteJid)
        return jsonResponse({ error: "instanceName e remoteJid são obrigatórios" }, 400);
      for (const path of [
        `/group/inviteCode/${instanceName}`,
        `/chat/inviteCode/${instanceName}`,
      ]) {
        try {
          const evoData = await requestEvolution(
            path,
            { method: "POST", body: JSON.stringify({ groupJid: remoteJid }) },
            "get_invite_link",
          );
          const inviteCode =
            evoData?.inviteCode || evoData?.invite || evoData?.code || null;
          if (inviteCode)
            return jsonResponse({
              success: true,
              inviteLink: `https://chat.whatsapp.com/${inviteCode}`,
            });
        } catch { /* try next */ }
      }
      return jsonResponse({ success: true, inviteLink: null });
    }

    // ── remove_group_participant ──────────────────────────────────────────────
    if (action === "remove_group_participant") {
      const { remoteJid, participantJid } = body as {
        remoteJid?: string; participantJid?: string;
      };
      if (!instanceName || !remoteJid || !participantJid)
        return jsonResponse({ error: "Parâmetros obrigatórios ausentes" }, 400);
      for (const path of [
        `/group/removeParticipant/${instanceName}`,
        `/chat/removeParticipant/${instanceName}`,
      ]) {
        try {
          await requestEvolution(
            path,
            {
              method: "DELETE",
              body: JSON.stringify({ groupJid: remoteJid, participants: [participantJid] }),
            },
            "remove_participant",
          );
          return jsonResponse({ success: true });
        } catch { /* try next */ }
      }
      return jsonResponse({ error: "Failed to remove participant" }, 500);
    }

    // ── promote_group_participant ─────────────────────────────────────────────
    if (action === "promote_group_participant") {
      const { remoteJid, participantJid } = body as {
        remoteJid?: string; participantJid?: string;
      };
      if (!instanceName || !remoteJid || !participantJid)
        return jsonResponse({ error: "Parâmetros obrigatórios ausentes" }, 400);
      for (const path of [
        `/group/updateParticipant/${instanceName}`,
        `/chat/updateParticipant/${instanceName}`,
      ]) {
        try {
          await requestEvolution(
            path,
            {
              method: "PUT",
              body: JSON.stringify({
                groupJid: remoteJid,
                action: "promote",
                participants: [participantJid],
              }),
            },
            "promote_participant",
          );
          return jsonResponse({ success: true });
        } catch { /* try next */ }
      }
      return jsonResponse({ error: "Failed to promote participant" }, 500);
    }

    // ── demote_group_participant ──────────────────────────────────────────────
    if (action === "demote_group_participant") {
      const { remoteJid, participantJid } = body as {
        remoteJid?: string; participantJid?: string;
      };
      if (!instanceName || !remoteJid || !participantJid)
        return jsonResponse({ error: "Parâmetros obrigatórios ausentes" }, 400);
      for (const path of [
        `/group/updateParticipant/${instanceName}`,
        `/chat/updateParticipant/${instanceName}`,
      ]) {
        try {
          await requestEvolution(
            path,
            {
              method: "PUT",
              body: JSON.stringify({
                groupJid: remoteJid,
                action: "demote",
                participants: [participantJid],
              }),
            },
            "demote_participant",
          );
          return jsonResponse({ success: true });
        } catch { /* try next */ }
      }
      return jsonResponse({ error: "Failed to demote participant" }, 500);
    }

    // ── send_reaction ──────────────────────────────────────────────────────
    if (action === "send_reaction") {
      const { remoteJid, messageId, reaction } = body as {
        remoteJid?: string; messageId?: string; reaction?: string;
      };
      if (!instanceName || !remoteJid || !messageId)
        return jsonResponse({ error: "instanceName, remoteJid e messageId são obrigatórios" }, 400);
      const evoData = await requestEvolution(
        `/message/sendReaction/${instanceName}`,
        {
          method: "POST",
          body: JSON.stringify({
            key: { remoteJid, id: messageId, fromMe: false },
            reaction: reaction || "",
          }),
        },
        "send_reaction",
      );
      return jsonResponse({ success: true, data: evoData });
    }

    // ── delete_message ──────────────────────────────────────────────────────
    if (action === "delete_message") {
      const { remoteJid, messageId } = body as {
        remoteJid?: string; messageId?: string;
      };
      if (!instanceName || !remoteJid || !messageId)
        return jsonResponse({ error: "instanceName, remoteJid e messageId são obrigatórios" }, 400);

      // Revoke on WhatsApp
      try {
        await requestEvolution(
          `/chat/deleteMessageForEveryone/${instanceName}`,
          {
            method: "DELETE",
            body: JSON.stringify({ id: messageId, remoteJid, fromMe: true }),
          },
          "delete_message",
        );
      } catch (e) {
        console.warn("delete_message Evolution API warning:", e);
      }

      // Mark as deleted in DB
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          content: "🚫 Mensagem apagada",
          metadata: { deleted: true, deletedAt: new Date().toISOString() },
        })
        .eq("tenant_id", tenantId)
        .eq("message_id", messageId);

      return jsonResponse({ success: true });
    }

    // ── mark_as_read ────────────────────────────────────────────────────────
    if (action === "mark_as_read") {
      const { conversationId, remoteJid } = body as {
        conversationId?: string; remoteJid?: string;
      };
      if (!conversationId)
        return jsonResponse({ error: "conversationId é obrigatório" }, 400);

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("tenant_id", tenantId)
        .eq("id", conversationId);

      // Inform Evolution API (best-effort)
      if (instanceName && remoteJid) {
        try {
          await requestEvolution(
            `/chat/markMessageAsRead/${instanceName}`,
            {
              method: "PUT",
              body: JSON.stringify({ readMessages: [{ remoteJid, id: "all" }] }),
            },
            "mark_as_read",
          );
        } catch { /* best-effort */ }
      }

      return jsonResponse({ success: true });
    }

    // ── update_presence ─────────────────────────────────────────────────────
    if (action === "update_presence") {
      const { remoteJid, presence } = body as {
        remoteJid?: string; presence?: string;
      };
      if (!instanceName || !remoteJid)
        return jsonResponse({ error: "instanceName e remoteJid são obrigatórios" }, 400);
      try {
        await requestEvolution(
          `/chat/updatePresence/${instanceName}`,
          {
            method: "POST",
            body: JSON.stringify({
              number: remoteJid,
              presence: presence || "composing",
            }),
          },
          "update_presence",
        );
      } catch { /* best-effort */ }
      return jsonResponse({ success: true });
    }

    // ── archive_conversation ────────────────────────────────────────────────
    if (action === "archive_conversation") {
      const { conversationId, archived } = body as {
        conversationId?: string; archived?: boolean;
      };
      if (!conversationId)
        return jsonResponse({ error: "conversationId é obrigatório" }, 400);
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ archived: archived !== false })
        .eq("tenant_id", tenantId)
        .eq("id", conversationId);
      return jsonResponse({ success: true });
    }

    // ── pin_conversation ────────────────────────────────────────────────────
    if (action === "pin_conversation") {
      const { conversationId, pinned } = body as {
        conversationId?: string; pinned?: boolean;
      };
      if (!conversationId)
        return jsonResponse({ error: "conversationId é obrigatório" }, 400);
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ pinned: pinned !== false })
        .eq("tenant_id", tenantId)
        .eq("id", conversationId);
      return jsonResponse({ success: true });
    }

    // ── update_conversation_status ──────────────────────────────────────────
    if (action === "update_conversation_status") {
      const { conversationId, status } = body as {
        conversationId?: string; status?: string;
      };
      if (!conversationId || !status)
        return jsonResponse({ error: "conversationId e status são obrigatórios" }, 400);
      const validStatuses = ["open", "pending", "resolved"];
      if (!validStatuses.includes(status))
        return jsonResponse({ error: `status deve ser: ${validStatuses.join(", ")}` }, 400);
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ status })
        .eq("tenant_id", tenantId)
        .eq("id", conversationId);
      return jsonResponse({ success: true });
    }

    // ── search_messages ─────────────────────────────────────────────────────
    if (action === "search_messages") {
      const { conversationId, query: searchQuery, limit: searchLimit } = body as {
        conversationId?: string; query?: string; limit?: number;
      };
      if (!conversationId || !searchQuery)
        return jsonResponse({ error: "conversationId e query são obrigatórios" }, 400);

      // Verify conversation belongs to tenant
      const { data: convCheck } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id", conversationId)
        .limit(1)
        .maybeSingle();
      if (!convCheck) return jsonResponse({ error: "Conversa não encontrada" }, 404);

      const effectiveLimit = Math.min(Number(searchLimit) || 30, 100);

      // Use full-text search with Portuguese config
      const tsQuery = searchQuery
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `${w}:*`)
        .join(" & ");

      const { data: messages, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("conversation_id", conversationId)
        .textSearch("content", tsQuery, { config: "portuguese" })
        .order("created_at", { ascending: false })
        .limit(effectiveLimit);

      if (error) throw new Error(`Search error: ${error.message}`);
      return jsonResponse({ success: true, messages: (messages || []).reverse() });
    }

    // ── monitoring_conversations ──────────────────────────────────────────────
    if (action === "monitoring_conversations") {
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .in("role", ["super_admin", "admin", "manager"])
        .limit(1)
        .maybeSingle();

      // Also check tenant_assignments for managers of other tenants
      let accessibleTenantIds = [tenantId];
      if (roleCheck && (roleCheck.role === "super_admin" || roleCheck.role === "admin")) {
        // Admins/super_admins see ALL tenants
        const { data: allTenants } = await supabaseAdmin
          .from("tenants")
          .select("id");
        if (allTenants) {
          accessibleTenantIds = allTenants.map(t => t.id);
        }
      } else if (roleCheck) {
        // Manager in own tenant — also get assigned tenants
        const { data: assignments } = await supabaseAdmin
          .from("tenant_assignments")
          .select("tenant_id")
          .eq("manager_id", userId);
        if (assignments) {
          for (const a of assignments) {
            if (!accessibleTenantIds.includes(a.tenant_id)) accessibleTenantIds.push(a.tenant_id);
          }
        }
      } else {
        // Check if user has assignments even without manager role
        const { data: assignments } = await supabaseAdmin
          .from("tenant_assignments")
          .select("tenant_id")
          .eq("manager_id", userId);
        if (!assignments?.length) {
          return jsonResponse({ error: "Acesso negado. Apenas gestores podem acessar o monitoramento." }, 403);
        }
        for (const a of assignments) {
          if (!accessibleTenantIds.includes(a.tenant_id)) accessibleTenantIds.push(a.tenant_id);
        }
      }

      const {
        instanceId: filterInstanceId,
        limit: reqLimit,
        before_id: beforeId,
        search: searchQuery,
        tenantId: filterTenantId,
      } = body as Record<string, any>;

      const effectiveLimit = Math.min(Number(reqLimit) || 50, 200);

      // If filtering by tenant, validate access
      const targetTenants = filterTenantId
        ? accessibleTenantIds.filter(t => t === filterTenantId)
        : accessibleTenantIds;

      if (targetTenants.length === 0) {
        return jsonResponse({ success: true, conversations: [], instances: [], hasMore: false });
      }

      // Fetch instances for accessible tenants
      const { data: allInstances } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, display_name, instance_name, phone_number, status, assigned_to, tenant_id")
        .in("tenant_id", targetTenants);

      // Fetch tenant names
      const { data: tenantNames } = await supabaseAdmin
        .from("tenants")
        .select("id, name")
        .in("id", targetTenants);
      const tenantNameMap: Record<string, string> = {};
      for (const t of tenantNames || []) tenantNameMap[t.id] = t.name;

      // Fetch profiles of assigned users
      const assignedUserIds = [...new Set((allInstances || []).map(i => i.assigned_to).filter(Boolean))];
      const profilesMap: Record<string, string> = {};
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", assignedUserIds);
        for (const p of profiles || []) profilesMap[p.id] = p.full_name || "Sem nome";
      }

      const instanceMap: Record<string, any> = {};
      for (const inst of allInstances || []) {
        instanceMap[inst.id] = {
          ...inst,
          owner_name: inst.assigned_to ? (profilesMap[inst.assigned_to] || "Sem nome") : null,
          tenant_name: tenantNameMap[inst.tenant_id] || "—",
        };
      }

      let query = supabaseAdmin
        .from("whatsapp_conversations")
        .select("*")
        .in("tenant_id", targetTenants)
        .order("last_message_at", { ascending: false })
        .limit(effectiveLimit);

      if (filterInstanceId) query = query.eq("instance_id", filterInstanceId);

      if (searchQuery) {
        query = query.or(
          `contact_name.ilike.%${searchQuery}%,contact_phone.ilike.%${searchQuery}%,last_message.ilike.%${searchQuery}%`
        );
      }

      if (beforeId) {
        const { data: pivot } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("last_message_at")
          .eq("id", beforeId)
          .maybeSingle();
        if (pivot?.last_message_at) query = query.lt("last_message_at", pivot.last_message_at);
      }

      const { data: conversations, error: convError } = await query;
      if (convError) throw new Error(`DB error: ${convError.message}`);

      const enriched = (conversations || []).map(conv => ({
        ...conv,
        instance_display_name: instanceMap[conv.instance_id]?.display_name || instanceMap[conv.instance_id]?.instance_name || "Instância",
        instance_name_raw: instanceMap[conv.instance_id]?.instance_name || "",
        instance_phone: instanceMap[conv.instance_id]?.phone_number || "",
        instance_status: instanceMap[conv.instance_id]?.status || "disconnected",
        instance_owner_name: instanceMap[conv.instance_id]?.owner_name || null,
        tenant_name: instanceMap[conv.instance_id]?.tenant_name || "—",
      }));

      return jsonResponse({
        success: true,
        conversations: enriched,
        instances: Object.values(instanceMap),
        hasMore: enriched.length === effectiveLimit,
      });
    }

    // ── update_instance_assignee ─────────────────────────────────────────────
    if (action === "update_instance_assignee") {
      const { instanceId: targetInstanceId, assignedTo } = body as { instanceId?: string; assignedTo?: string | null };
      if (!targetInstanceId) return jsonResponse({ error: "instanceId é obrigatório" }, 400);

      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .in("role", ["super_admin", "admin"])
        .limit(1)
        .maybeSingle();
      if (!roleCheck) return jsonResponse({ error: "Acesso negado" }, 403);

      const { error: updErr } = await supabaseAdmin
        .from("whatsapp_instances")
        .update({ assigned_to: assignedTo || null })
        .eq("tenant_id", tenantId)
        .eq("id", targetInstanceId);

      if (updErr) throw new Error(updErr.message);
      return jsonResponse({ success: true });
    }

    // ── import_contacts ───────────────────────────────────────────────────────
    if (action === "import_contacts") {
      if (!instanceName) return jsonResponse({ error: "instanceName é obrigatório" }, 400);

      const progressId = `${tenantId}-${instanceName}`;

      // Initialize progress record
      await supabaseAdmin.from("import_progress").upsert({
        id: progressId,
        tenant_id: tenantId,
        instance_name: instanceName,
        total: 0,
        imported: 0,
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error_message: null,
      });

      // Fire-and-forget: run import in background, return immediately
      (async () => {
        try {
          // Fetch contacts from Evolution API (try multiple endpoints/methods)
          let contacts: any[] = [];
          const endpointAttempts: Array<{ path: string; method: string; body?: string }> = [
            { path: `/contact/findContacts/${instanceName}`, method: "GET" },
            { path: `/contact/findContacts/${instanceName}`, method: "POST", body: JSON.stringify({}) },
            { path: `/chat/findContacts/${instanceName}`, method: "GET" },
            { path: `/chat/findContacts/${instanceName}`, method: "POST", body: JSON.stringify({ where: {} }) },
            { path: `/contact/find/${instanceName}`, method: "POST", body: JSON.stringify({ where: {} }) },
          ];

          for (const attempt of endpointAttempts) {
            try {
              const fetchOpts: RequestInit = {
                method: attempt.method,
                headers: { ...evoHeaders },
              };
              if (attempt.body) {
                fetchOpts.body = attempt.body;
                (fetchOpts.headers as Record<string, string>)["Content-Type"] = "application/json";
              }
              const res = await fetchWithTimeout(`${baseUrl}${attempt.path}`, fetchOpts, 20000);
              const text = await res.text();
              console.log(`[import_contacts] ${attempt.method} ${attempt.path} → ${res.status}: ${text.slice(0, 300)}`);
              if (res.ok) {
                let json: any;
                try { json = JSON.parse(text); } catch { continue; }
                const found = Array.isArray(json) ? json : json?.contacts || json?.data || [];
                if (found.length > 0) {
                  contacts = found;
                  console.log(`[import_contacts] Got ${contacts.length} contacts from ${attempt.path}`);
                  break;
                }
              }
            } catch (e) {
              console.log(`[import_contacts] ${attempt.method} ${attempt.path} failed: ${e}`);
            }
          }

          if (contacts.length === 0) {
            console.log(`[import_contacts] No contacts found after trying all endpoints for instance ${instanceName}`);
            await supabaseAdmin.from("import_progress").update({
              status: "done", imported: 0, total: 0, finished_at: new Date().toISOString(),
              error_message: "Nenhum contato encontrado na Evolution API. Verifique os logs da edge function para detalhes.",
            }).eq("id", progressId);
            return;
          }

          await supabaseAdmin.from("import_progress").update({ total: contacts.length }).eq("id", progressId);

          const BATCH_SIZE = 100;
          let imported = 0;

          for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
            const batch = contacts.slice(i, i + BATCH_SIZE);
            const rows = batch
              .map((c: any) => {
                const rawId = c.id || c.jid || c.wuid || "";
                const phone = normalizePhone(rawId);
                if (!phone) return null;
                const name = c.pushName || c.name || c.notify || null;
                return {
                  tenant_id: tenantId,
                  phone,
                  name: name && !/^\d+$/.test(name) ? name : phone,
                  tags: ["whatsapp", "importado"],
                  origin: "whatsapp_import",
                  notes: "Importado automaticamente do WhatsApp",
                };
              })
              .filter(Boolean);

            if (rows.length > 0) {
              const { error: upsertErr } = await supabaseAdmin
                .from("contacts")
                .upsert(rows, { onConflict: "phone,tenant_id", ignoreDuplicates: true });
              if (!upsertErr) imported += rows.length;
            }

            await supabaseAdmin.from("import_progress").update({ imported }).eq("id", progressId);
          }

          // Sync conversation names from imported contacts
          try {
            await supabaseAdmin.rpc("update_conversations_contact_names", {
              p_tenant_id: tenantId,
              p_instance_name: instanceName,
            });
          } catch { /* non-fatal */ }

          await supabaseAdmin.from("import_progress").update({
            status: "done", imported, finished_at: new Date().toISOString(),
          }).eq("id", progressId);
        } catch (err) {
          await supabaseAdmin.from("import_progress").update({
            status: "error",
            error_message: String(err),
            finished_at: new Date().toISOString(),
          }).eq("id", progressId).then(() => {}, () => {});
        }
      })();

      return jsonResponse({ success: true, message: "Importação iniciada" });
    }

    // ── monitoring_messages ───────────────────────────────────────────────────
    if (action === "monitoring_messages") {
      const { conversationId, limit: reqLimit, before_id: beforeMsgId } = body as Record<string, any>;
      if (!conversationId) return jsonResponse({ error: "conversationId é obrigatório" }, 400);

      // Resolve accessible tenant IDs (same logic as monitoring_conversations)
      const { data: roleCheck } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .in("role", ["super_admin", "admin", "manager"])
        .limit(1)
        .maybeSingle();

      let accessibleTenantIds: string[] = [tenantId];
      if (roleCheck && (roleCheck.role === "super_admin" || roleCheck.role === "admin")) {
        const { data: allTenants } = await supabaseAdmin.from("tenants").select("id");
        if (allTenants) accessibleTenantIds = allTenants.map(t => t.id);
      } else {
        const { data: assignments } = await supabaseAdmin
          .from("tenant_assignments")
          .select("tenant_id")
          .eq("manager_id", userId);
        for (const a of assignments || []) {
          if (!accessibleTenantIds.includes(a.tenant_id)) accessibleTenantIds.push(a.tenant_id);
        }
      }

      // Verify the conversation belongs to an accessible tenant
      const { data: conv } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id, tenant_id")
        .eq("id", conversationId)
        .in("tenant_id", accessibleTenantIds)
        .maybeSingle();
      if (!conv) return jsonResponse({ error: "Conversa não encontrada ou acesso negado" }, 404);

      const effectiveLimit = Math.min(Number(reqLimit) || 50, 200);

      let query = supabaseAdmin
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", conv.tenant_id)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(effectiveLimit);

      if (beforeMsgId) {
        const { data: pivot } = await supabaseAdmin
          .from("whatsapp_messages")
          .select("created_at")
          .eq("id", beforeMsgId)
          .maybeSingle();
        if (pivot?.created_at) query = query.lt("created_at", pivot.created_at);
      }

      const { data: msgs, error: msgsErr } = await query;
      if (msgsErr) throw new Error(msgsErr.message);

      return jsonResponse({
        success: true,
        messages: (msgs || []).reverse(),
        hasMore: (msgs || []).length === effectiveLimit,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error: unknown) {
    console.error("Evolution API edge function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
