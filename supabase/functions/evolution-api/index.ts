import { createClient } from "npm:@supabase/supabase-js@2";

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
    payload?.instance?.me?.id, payload?.instance?.me?.jid, payload?.number,
    payload?.owner, payload?.wid, payload?.wuid,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") { const p = normalizePhone(candidate); if (p) return p; }
    if (candidate && typeof candidate === "object") {
      const o = candidate as Record<string, unknown>;
      const p = normalizePhone(o.id) || normalizePhone(o.user) || normalizePhone(o.jid);
      if (p) return p;
    }
  }
  return null;
};

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user?.id) return jsonResponse({ error: "Invalid token" }, 401);

  const userId = userData.user.id;
  const { data: roleData } = await supabaseAdmin.from("user_roles").select("tenant_id").eq("user_id", userId).limit(1).single();
  if (!roleData?.tenant_id) return jsonResponse({ error: "User has no tenant assigned" }, 403);

  const tenantId = roleData.tenant_id;

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const action = body.action as string | undefined;
    const instanceName = body.instanceName as string | undefined;
    const displayName = body.displayName as string | undefined;
    if (!action) return jsonResponse({ error: "action is required" }, 400);

    const normalizedUrl = EVOLUTION_API_URL.trim().replace(/\/$/, "");
    const baseUrl = normalizedUrl.endsWith("/manager") ? normalizedUrl.slice(0, -"/manager".length) : normalizedUrl;
    const evoHeaders: Record<string, string> = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY };

    const parseEvolutionResponse = async (response: Response, operation: string): Promise<any> => {
      const responseText = await response.text();
      const contentType = response.headers.get("content-type") || "unknown";
      let parsed: any = null;
      try { parsed = responseText ? JSON.parse(responseText) : null; } catch { parsed = null; }
      if (!parsed) {
        const snippet = responseText.substring(0, 180).replace(/\s+/g, " ").trim();
        throw new Error(`Evolution API ${operation} invalid response [${response.status}] (${contentType}): ${snippet || "empty body"}`);
      }
      if (!response.ok) throw new Error(`Evolution API ${operation} failed [${response.status}]: ${JSON.stringify(parsed)}`);
      return parsed;
    };

    const requestEvolution = async (path: string, init: RequestInit, operation: string): Promise<any> => {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, { ...init, headers: { ...evoHeaders, ...(init.headers || {}) } });
      return await parseEvolutionResponse(res, operation);
    };

    const getInstanceRow = async (name: string) => {
      const { data } = await supabaseAdmin.from("whatsapp_instances").select("id, instance_name")
        .eq("tenant_id", tenantId).eq("instance_name", name).limit(1).maybeSingle();
      return data;
    };

    const ensureOutboundConversation = async (name: string, remoteJid: string) => {
      const instance = await getInstanceRow(name);
      if (!instance) return null;
      const { data: existing } = await supabaseAdmin.from("whatsapp_conversations").select("id")
        .eq("tenant_id", tenantId).eq("instance_id", instance.id).eq("remote_jid", remoteJid).limit(1).maybeSingle();
      if (existing) return { conversationId: existing.id, instanceId: instance.id };
      const contactPhone = remoteJid.replace(/@.*$/, "");
      const guessedName = remoteJid.endsWith("@g.us") ? `Grupo ${contactPhone}` : contactPhone;
      const { data: created, error: convError } = await supabaseAdmin.from("whatsapp_conversations").insert({
        tenant_id: tenantId, instance_id: instance.id, remote_jid: remoteJid,
        contact_name: guessedName || null, contact_phone: contactPhone || null,
        last_message: null, last_message_at: new Date().toISOString(), unread_count: 0, status: "open",
      }).select("id").single();
      if (convError) throw new Error(`Failed to create outbound conversation: ${convError.message}`);
      return { conversationId: created.id, instanceId: instance.id };
    };

    const persistOutboundMessage = async (params: {
      instanceName: string; remoteJid: string; messageId?: string | null;
      content: string | null; mediaType?: string | null; mediaUrl?: string | null; metadata?: Record<string, unknown>;
    }) => {
      const conversationData = await ensureOutboundConversation(params.instanceName, params.remoteJid);
      if (!conversationData) return;
      const { conversationId } = conversationData;
      if (params.messageId) {
        const { data: existing } = await supabaseAdmin.from("whatsapp_messages").select("id")
          .eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("message_id", params.messageId).limit(1).maybeSingle();
        if (existing) return;
      }
      await Promise.all([
        supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: tenantId, conversation_id: conversationId, message_id: params.messageId || null,
          direction: "outbound", content: params.content, media_url: params.mediaUrl || null,
          media_type: params.mediaType || null, status: "sent", metadata: params.metadata || {},
        }),
        supabaseAdmin.from("whatsapp_conversations").update({
          last_message: params.content || (params.mediaType ? `[${params.mediaType}]` : ""),
          last_message_at: new Date().toISOString(),
        }).eq("tenant_id", tenantId).eq("id", conversationId),
      ]);
    };

    // ── create_instance ──
    if (action === "create_instance") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const createPayload = JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true });
      const createPaths = ["/instance/create", "/api/instance/create", "/manager/api/instance/create"];
      let evoData: any = null;
      let lastCreateError: unknown = null;
      for (const createPath of createPaths) {
        try { evoData = await requestEvolution(createPath, { method: "POST", body: createPayload }, "create_instance"); break; }
        catch (error) { lastCreateError = error; if (!(error instanceof Error && error.message.includes("[404]"))) throw error; }
      }
      if (!evoData) throw lastCreateError instanceof Error ? lastCreateError : new Error("create_instance failed on all paths");
      const phoneNumber = extractPhoneNumber(evoData);
      const { error: dbError } = await supabaseAdmin.from("whatsapp_instances").insert({
        tenant_id: tenantId, instance_name: instanceName, display_name: displayName || null,
        instance_id: evoData.instance?.instanceName || instanceName, status: "connecting",
        phone_number: phoneNumber, qr_code: evoData.qrcode?.base64 || null,
      });
      if (dbError) throw new Error(`Failed to persist instance: ${dbError.message}`);
      return jsonResponse({ success: true, instance: evoData.instance, qrcode: evoData.qrcode });
    }

    // ── get_qrcode ──
    if (action === "get_qrcode") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const evoData = await requestEvolution(`/instance/connect/${instanceName}`, { method: "GET" }, "get_qrcode");
      await supabaseAdmin.from("whatsapp_instances").update({ qr_code: evoData.base64 || null, status: "connecting" })
        .eq("tenant_id", tenantId).eq("instance_name", instanceName);
      return jsonResponse({ success: true, qrcode: evoData });
    }

    // ── connection_status ──
    if (action === "connection_status") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const evoData = await requestEvolution(`/instance/connectionState/${instanceName}`, { method: "GET" }, "connection_status");
      const state = evoData.instance?.state || evoData.state;
      const isConnected = state === "open";
      const phoneNumber = extractPhoneNumber(evoData);
      const updatePayload: Record<string, unknown> = { status: isConnected ? "connected" : "connecting" };
      if (phoneNumber) updatePayload.phone_number = phoneNumber;
      if (isConnected) updatePayload.qr_code = null;
      await supabaseAdmin.from("whatsapp_instances").update(updatePayload).eq("tenant_id", tenantId).eq("instance_name", instanceName);
      return jsonResponse({ success: true, state, connected: isConnected, phoneNumber });
    }

    // ── list_instances ──
    if (action === "list_instances") {
      const { data: instances, error: listError } = await supabaseAdmin.from("whatsapp_instances")
        .select("id, tenant_id, instance_name, display_name, instance_id, status, phone_number, settings, created_at, updated_at")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false });
      if (listError) throw new Error(`DB list error: ${listError.message}`);
      if (!instances || instances.length === 0) return jsonResponse({ success: true, instances: [] });
      const synced = await Promise.all(instances.map(async (inst) => {
        try {
          const res = await fetch(`${baseUrl}/instance/connectionState/${inst.instance_name}`, { method: "GET", headers: evoHeaders });
          if (res.status === 404) { await supabaseAdmin.from("whatsapp_instances").delete().eq("tenant_id", tenantId).eq("id", inst.id); return null; }
          const evoState = await parseEvolutionResponse(res, "sync_connection_status");
          const state = evoState.instance?.state || evoState.state;
          const nextStatus = state === "open" ? "connected" : "connecting";
          const phoneNumber = extractPhoneNumber(evoState);
          const dbPatch: Record<string, unknown> = {};
          const responsePatch: Record<string, unknown> = {};
          if (inst.status !== nextStatus) { dbPatch.status = nextStatus; responsePatch.status = nextStatus; }
          if (phoneNumber && phoneNumber !== inst.phone_number) { dbPatch.phone_number = phoneNumber; responsePatch.phone_number = phoneNumber; }
          if (nextStatus === "connected") dbPatch.qr_code = null;
          if (Object.keys(dbPatch).length > 0) await supabaseAdmin.from("whatsapp_instances").update(dbPatch).eq("tenant_id", tenantId).eq("id", inst.id);
          return { ...inst, ...responsePatch };
        } catch (error) { console.warn(`Could not sync instance ${inst.instance_name}:`, error); return inst; }
      }));
      return jsonResponse({ success: true, instances: synced.filter(Boolean) });
    }

    // ── delete_instance ──
    if (action === "delete_instance") {
      if (!instanceName) return jsonResponse({ error: "instanceName is required" }, 400);
      const instance = await getInstanceRow(instanceName);
      try { await fetch(`${baseUrl}/instance/delete/${instanceName}`, { method: "DELETE", headers: evoHeaders }); } catch { /* ignore */ }
      if (instance?.id) await supabaseAdmin.from("whatsapp_conversations").delete().eq("tenant_id", tenantId).eq("instance_id", instance.id);
      await supabaseAdmin.from("whatsapp_instances").delete().eq("tenant_id", tenantId).eq("instance_name", instanceName);
      return jsonResponse({ success: true });
    }

    // ── send_text ──
    if (action === "send_text") {
      const { remoteJid, text, quotedMessageId } = body as { remoteJid?: string; text?: string; quotedMessageId?: string };
      if (!instanceName || !remoteJid || !text) return jsonResponse({ error: "instanceName, remoteJid, and text are required" }, 400);
      const sendBody: Record<string, unknown> = { number: remoteJid, text };
      if (quotedMessageId) sendBody.quoted = { key: { id: quotedMessageId, remoteJid } };
      const evoData = await requestEvolution(`/message/sendText/${instanceName}`, { method: "POST", body: JSON.stringify(sendBody) }, "send_text");
      const outboundMessageId = evoData?.key?.id || evoData?.data?.key?.id || evoData?.message?.key?.id || null;
      await persistOutboundMessage({ instanceName, remoteJid, messageId: outboundMessageId, content: text, metadata: { key: evoData?.key || evoData?.data?.key || null, source: "send_text", quotedMessageId: quotedMessageId || null } });
      return jsonResponse({ success: true, data: evoData });
    }

    // ── send_media ──
    if (action === "send_media") {
      const { remoteJid, mediatype, media, caption, fileName } = body as { remoteJid?: string; mediatype?: string; media?: string; caption?: string; fileName?: string };
      if (!instanceName || !remoteJid || !mediatype || !media) return jsonResponse({ error: "instanceName, remoteJid, mediatype, and media are required" }, 400);
      const sendBody: Record<string, unknown> = { number: remoteJid, mediatype, media };
      if (caption) sendBody.caption = caption;
      if (fileName) sendBody.fileName = fileName;
      const evoData = await requestEvolution(`/message/sendMedia/${instanceName}`, { method: "POST", body: JSON.stringify(sendBody) }, "send_media");
      const outboundMessageId = evoData?.key?.id || evoData?.data?.key?.id || evoData?.message?.key?.id || null;
      const mediaLabelByType: Record<string, string> = { image: "[Imagem]", audio: "[Áudio]", video: "[Vídeo]", document: fileName || "[Documento]", sticker: "[Sticker]" };
      const safeMediaUrl = typeof media === "string" && media.startsWith("http") ? media : evoData?.mediaUrl || evoData?.data?.mediaUrl || null;
      await persistOutboundMessage({ instanceName, remoteJid, messageId: outboundMessageId, content: caption?.trim() || mediaLabelByType[mediatype] || "[Mídia]", mediaType: mediatype, mediaUrl: safeMediaUrl, metadata: { key: evoData?.key || evoData?.data?.key || null, mediatype, fileName: fileName || null, source: "send_media" } });
      return jsonResponse({ success: true, data: evoData });
    }

    // ── list_conversations ──
    if (action === "list_conversations") {
      const { instanceId: filterInstanceId } = body as { instanceId?: string };
      let query = supabaseAdmin.from("whatsapp_conversations").select("*").eq("tenant_id", tenantId).order("last_message_at", { ascending: false });
      if (filterInstanceId) query = query.eq("instance_id", filterInstanceId);
      const { data: conversations, error } = await query;
      if (error) throw new Error(`DB error: ${error.message}`);
      return jsonResponse({ success: true, conversations: conversations || [] });
    }

    // ── list_messages (with optional limit) ──
    if (action === "list_messages") {
      const { conversationId, limit: msgLimit } = body as { conversationId?: string; limit?: number };
      if (!conversationId) return jsonResponse({ error: "conversationId is required" }, 400);
      const effectiveLimit = Math.min(msgLimit || 100, 500);
      const { data: messages, error } = await supabaseAdmin.from("whatsapp_messages").select("*")
        .eq("tenant_id", tenantId).eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }).limit(effectiveLimit);
      if (error) throw new Error(`DB error: ${error.message}`);
      await supabaseAdmin.from("whatsapp_conversations").update({ unread_count: 0 }).eq("tenant_id", tenantId).eq("id", conversationId);
      return jsonResponse({ success: true, messages: (messages || []).reverse() });
    }

    // ── update_display_name ──
    if (action === "update_display_name") {
      if (!instanceName || !displayName) return jsonResponse({ error: "instanceName and displayName are required" }, 400);
      const { error } = await supabaseAdmin.from("whatsapp_instances").update({ display_name: displayName }).eq("tenant_id", tenantId).eq("instance_name", instanceName);
      if (error) throw new Error(`DB update error: ${error.message}`);
      return jsonResponse({ success: true });
    }

    // ── fetch_group_info ── (tries multiple Evolution API paths)
    if (action === "fetch_group_info") {
      const { remoteJid } = body as { remoteJid?: string };
      if (!instanceName || !remoteJid) return jsonResponse({ error: "instanceName and remoteJid are required" }, 400);
      if (!remoteJid.endsWith("@g.us")) return jsonResponse({ success: true, isGroup: false });

      // Try multiple API paths — findGroupInfos uses GET with query param
      const encodedJid = encodeURIComponent(remoteJid);
      const attempts: Array<{ path: string; method: string; body?: string }> = [
        { path: `/group/findGroupInfos/${instanceName}?groupJid=${encodedJid}`, method: "GET" },
        { path: `/chat/findGroupInfos/${instanceName}?groupJid=${encodedJid}`, method: "GET" },
        { path: `/group/findGroupInfos/${instanceName}`, method: "POST", body: JSON.stringify({ groupJid: remoteJid }) },
        { path: `/group/fetchAllGroups/${instanceName}?getParticipants=true`, method: "GET" },
      ];

      for (const attempt of attempts) {
        try {
          const init: RequestInit = { method: attempt.method };
          if (attempt.body) init.body = attempt.body;
          const evoData = await requestEvolution(attempt.path, init, "fetch_group_info");

          // For fetchAllGroups (returns array), find the matching group
          let groupData = evoData;
          if (Array.isArray(evoData)) {
            groupData = evoData.find((g: any) => g.id === remoteJid || g.jid === remoteJid) || null;
            if (!groupData) continue;
          }

          const subject = groupData?.subject || groupData?.name || groupData?.groupName || groupData?.groupSubject || null;
          const desc = groupData?.desc || groupData?.description || groupData?.groupDesc || null;
          const rawParticipants = groupData?.participants || groupData?.members || [];
          const size = groupData?.size || rawParticipants.length || 0;
          const pictureUrl = groupData?.pictureUrl || groupData?.profilePictureUrl || null;

          if (subject) {
            const inst = await getInstanceRow(instanceName);
            if (inst?.id) {
              await supabaseAdmin.from("whatsapp_conversations").update({ contact_name: subject })
                .eq("tenant_id", tenantId).eq("instance_id", inst.id).eq("remote_jid", remoteJid);
            }

            const participants = rawParticipants.slice(0, 256).map((p: any) => ({
              id: p.id || p.jid || null,
              admin: p.admin || null,
              phone: normalizePhone(p.id || p.jid) || null,
            }));

            return jsonResponse({ success: true, isGroup: true, subject, description: desc, size, pictureUrl, participants });
          }
        } catch (error) {
          const isNotFound = error instanceof Error && error.message.includes("[404]");
          if (!isNotFound) console.warn("Group info fetch warning:", error);
        }
      }
      return jsonResponse({ success: true, isGroup: true, subject: null });
    }

    // ── get_profile_picture ──
    if (action === "get_profile_picture") {
      const { remoteJid } = body as { remoteJid?: string };
      if (!instanceName || !remoteJid) return jsonResponse({ error: "instanceName and remoteJid are required" }, 400);
      const numberOnly = remoteJid.replace(/@.*$/, "");
      const requestBodies = [{ number: remoteJid }, { number: numberOnly }, { jid: remoteJid }];
      const picturePaths = [`/chat/fetchProfilePictureUrl/${instanceName}`, `/chat/fetchProfilePicture/${instanceName}`];
      for (const path of picturePaths) {
        for (const payload of requestBodies) {
          try {
            const evoData = await requestEvolution(path, { method: "POST", body: JSON.stringify(payload) }, "get_profile_picture");
            const url = evoData?.profilePictureUrl || evoData?.picture || evoData?.url || evoData?.data?.profilePictureUrl || null;
            if (url) return jsonResponse({ success: true, profilePictureUrl: url });
          } catch (error) { if (!(error instanceof Error && error.message.includes("[404]"))) console.warn("Profile picture fetch warning:", error); }
        }
      }
      return jsonResponse({ success: true, profilePictureUrl: null });
    }

    // ── get_contact ──
    if (action === "get_contact") {
      const { contactId } = body as { contactId?: string };
      if (!contactId) return jsonResponse({ error: "contactId is required" }, 400);
      const { data: contact, error } = await supabaseAdmin.from("contacts").select("*").eq("tenant_id", tenantId).eq("id", contactId).single();
      if (error) return jsonResponse({ error: "Contact not found" }, 404);
      return jsonResponse({ success: true, contact });
    }

    // ── update_contact ──
    if (action === "update_contact") {
      const { contactId, fields } = body as { contactId?: string; fields?: Record<string, unknown> };
      if (!contactId || !fields) return jsonResponse({ error: "contactId and fields are required" }, 400);
      const allowed = ["name", "email", "phone", "company", "notes", "tags", "custom_fields"];
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of allowed) { if (key in fields) patch[key] = fields[key]; }
      const { error } = await supabaseAdmin.from("contacts").update(patch).eq("tenant_id", tenantId).eq("id", contactId);
      if (error) throw new Error(`Update contact error: ${error.message}`);
      // Also update conversation contact_name if name changed
      if (patch.name) {
        await supabaseAdmin.from("whatsapp_conversations").update({ contact_name: patch.name as string })
          .eq("tenant_id", tenantId).eq("contact_id", contactId);
      }
      return jsonResponse({ success: true });
    }

    // ── get_group_invite_link ──
    if (action === "get_group_invite_link") {
      const { remoteJid } = body as { remoteJid?: string };
      if (!instanceName || !remoteJid) return jsonResponse({ error: "instanceName and remoteJid are required" }, 400);
      const paths = [`/group/inviteCode/${instanceName}`, `/chat/inviteCode/${instanceName}`];
      for (const path of paths) {
        try {
          const evoData = await requestEvolution(path, { method: "POST", body: JSON.stringify({ groupJid: remoteJid }) }, "get_invite_link");
          const inviteCode = evoData?.inviteCode || evoData?.invite || evoData?.code || null;
          if (inviteCode) return jsonResponse({ success: true, inviteLink: `https://chat.whatsapp.com/${inviteCode}` });
        } catch { /* try next */ }
      }
      return jsonResponse({ success: true, inviteLink: null });
    }

    // ── remove_group_participant ──
    if (action === "remove_group_participant") {
      const { remoteJid, participantJid } = body as { remoteJid?: string; participantJid?: string };
      if (!instanceName || !remoteJid || !participantJid) return jsonResponse({ error: "Missing params" }, 400);
      const paths = [`/group/removeParticipant/${instanceName}`, `/chat/removeParticipant/${instanceName}`];
      for (const path of paths) {
        try {
          await requestEvolution(path, { method: "DELETE", body: JSON.stringify({ groupJid: remoteJid, participants: [participantJid] }) }, "remove_participant");
          return jsonResponse({ success: true });
        } catch { /* try next */ }
      }
      return jsonResponse({ error: "Failed to remove participant" }, 500);
    }

    // ── promote_group_participant ──
    if (action === "promote_group_participant") {
      const { remoteJid, participantJid } = body as { remoteJid?: string; participantJid?: string };
      if (!instanceName || !remoteJid || !participantJid) return jsonResponse({ error: "Missing params" }, 400);
      const paths = [`/group/updateParticipant/${instanceName}`, `/chat/updateParticipant/${instanceName}`];
      for (const path of paths) {
        try {
          await requestEvolution(path, { method: "PUT", body: JSON.stringify({ groupJid: remoteJid, action: "promote", participants: [participantJid] }) }, "promote_participant");
          return jsonResponse({ success: true });
        } catch { /* try next */ }
      }
      return jsonResponse({ error: "Failed to promote participant" }, 500);
    }

    // ── demote_group_participant ──
    if (action === "demote_group_participant") {
      const { remoteJid, participantJid } = body as { remoteJid?: string; participantJid?: string };
      if (!instanceName || !remoteJid || !participantJid) return jsonResponse({ error: "Missing params" }, 400);
      const paths = [`/group/updateParticipant/${instanceName}`, `/chat/updateParticipant/${instanceName}`];
      for (const path of paths) {
        try {
          await requestEvolution(path, { method: "PUT", body: JSON.stringify({ groupJid: remoteJid, action: "demote", participants: [participantJid] }) }, "demote_participant");
          return jsonResponse({ success: true });
        } catch { /* try next */ }
      }
      return jsonResponse({ error: "Failed to demote participant" }, 500);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error: unknown) {
    console.error("Evolution API edge function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
