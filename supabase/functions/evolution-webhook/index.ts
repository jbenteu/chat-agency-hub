// evolution-webhook.ts
// Edge Function: receptor de eventos do Evolution API via RabbitMQ/webhook
// Correções: URL MinIO prioritária, deduplicação correta por conversa,
//            queries paralelas, timeouts em chamadas externas, sem vazamento
//            de mensagens entre conversas.

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

const isPlaceholderGroupName = (name: string | null | undefined): boolean => {
  if (!name) return true;
  if (/^\d+$/.test(name)) return true;
  if (/^Grupo\s+\d+/.test(name)) return true;
  return false;
};

const normalizePhone = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const base = value.includes("@") ? value.split("@")[0] : value;
  const digits = base.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
};

const extractConnectionPhone = (payload: Record<string, any>): string | null => {
  const candidates: unknown[] = [
    payload?.phone, payload?.number,
    payload?.instance?.phone, payload?.instance?.number,
    payload?.instance?.owner, payload?.instance?.ownerJid,
    payload?.instance?.wid, payload?.instance?.wuid,
    payload?.me?.id, payload?.me?.jid,
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

const getMessageEntries = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.data)) return data.data;
  return [data];
};

const unwrapMessageContent = (message: Record<string, any> | null | undefined): Record<string, any> => {
  if (!message || typeof message !== "object") return {};
  let cur = message;
  if (cur.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
  if (cur.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
  if (cur.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
  if (cur.documentWithCaptionMessage?.message) cur = cur.documentWithCaptionMessage.message;
  return cur;
};

/** Retorna true se a URL pertence ao CDN temporário do WhatsApp */
const isExpirableWhatsAppUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return (
    url.includes("mmg.whatsapp.net") ||
    url.includes("media.whatsapp.net") ||
    url.includes(".enc?")
  );
};

/** Converte hostname interno do Docker para o IP público do MinIO */
const fixMinioUrl = (url: string | null): string | null => {
  if (!url) return url;
  return url.replace(/^http:\/\/minio:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/").replace(/^http:\/\/82\.25\.70\.124:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/");
};

/**
 * Resolve a URL de mídia priorizando MinIO (permanente) sobre CDN WhatsApp
 * (que expira). Verifica múltiplos campos antes do fallback.
 *
 * BUG CORRIGIDO: antes a URL do CDN era definida ANTES da verificação do
 * MinIO, então o MinIO sobrescrevia corretamente apenas se tivesse valor —
 * mas a URL do CDN ficava como padrão quando MinIO estava nulo no payload
 * mesmo que o campo correto existisse em outro lugar no entry.
 */
const resolveMediaUrl = (
  entry: Record<string, any>,
  data: Record<string, any>,
  msgNode: Record<string, any> | null | undefined,
): string | null => {
  // 1. Campos top-level onde a Evolution/MinIO salva a URL permanente
  const topLevelCandidates: (string | null | undefined)[] = [
    entry?.mediaUrl,
    entry?.media_url,
    entry?.fileUrl,
    entry?.file_url,
    entry?.url,
    data?.mediaUrl,
    data?.media_url,
    data?.fileUrl,
    data?.url,
    entry?.message?.mediaUrl,
    entry?.message?.fileUrl,
    entry?.message?.media_url,
  ];

  for (const c of topLevelCandidates) {
    if (c && typeof c === "string" && c.trim() && !isExpirableWhatsAppUrl(c)) return fixMinioUrl(c);
  }

  // 2. URL dentro do nó da mensagem (imageMessage, videoMessage, etc.)
  if (msgNode) {
    const nodeUrl =
      msgNode.url || msgNode.mediaUrl || msgNode.fileUrl || msgNode.media_url || null;
    if (nodeUrl && typeof nodeUrl === "string" && !isExpirableWhatsAppUrl(nodeUrl)) {
      return fixMinioUrl(nodeUrl);
    }
    // 3. Fallback: CDN do WhatsApp — expira, mas melhor do que nulo
    return nodeUrl || msgNode.directPath || null;
  }

  // 4. Última chance: qualquer top-level, mesmo que seja CDN
  for (const c of topLevelCandidates) {
    if (c && typeof c === "string") return fixMinioUrl(c);
  }

  return null;
};

// Tipos internos do protocolo WhatsApp que devem ser ignorados silenciosamente
const SILENT_SKIP_TYPES = new Set([
  "messageContextInfo",
  "appStateSyncKeyShare",
  "appStateSyncKeyFingerprint",
  "appStateSyncKeyId",
  "appStateSyncKeyRequest",
  "e2eNotification",
  "deviceSentMessage",
  "bcallMessage",
  "callLogMesssage",
  "encReactionMessage",
  "keepInChatMessage",
  "secretMessage",
  "pinInChatMessage",
  "ptvMessage",
  "newsletterAdminInviteMessage",
]);

const parseMessagePayload = (entry: Record<string, any>, data: Record<string, any>) => {
  const message = entry?.message || data?.message || {};
  const contentNode = unwrapMessageContent(message);

  let content = "";
  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  let quotedMessageId: string | null = null;
  let quotedContent: string | null = null;

  const contextInfo =
    contentNode.extendedTextMessage?.contextInfo ||
    contentNode.imageMessage?.contextInfo ||
    contentNode.videoMessage?.contextInfo ||
    contentNode.audioMessage?.contextInfo ||
    contentNode.documentMessage?.contextInfo ||
    contentNode.stickerMessage?.contextInfo ||
    null;

  if (contextInfo?.stanzaId) {
    quotedMessageId = contextInfo.stanzaId;
    const qm = contextInfo.quotedMessage;
    if (qm) {
      const unwrappedQm = unwrapMessageContent(qm);
      quotedContent =
        unwrappedQm?.conversation ||
        unwrappedQm?.extendedTextMessage?.text ||
        (unwrappedQm?.imageMessage ? (unwrappedQm.imageMessage.caption || "📷 Foto") : null) ||
        (unwrappedQm?.videoMessage ? (unwrappedQm.videoMessage.caption || "🎥 Vídeo") : null) ||
        (unwrappedQm?.documentMessage ? (unwrappedQm.documentMessage.fileName || "[Documento]") : null) ||
        (unwrappedQm?.audioMessage ? "🎵 Áudio" : null) ||
        (unwrappedQm?.stickerMessage ? "[Sticker]" : null) ||
        (unwrappedQm?.locationMessage || unwrappedQm?.liveLocationMessage ? "📍 Localização" : null) ||
        (unwrappedQm?.contactMessage || unwrappedQm?.contactsArrayMessage ? "👤 Contato" : null) ||
        (unwrappedQm?.pollCreationMessage || unwrappedQm?.pollCreationMessageV3 ? "📊 Enquete" : null) ||
        "[Mensagem]";
    } else {
      quotedContent = "[Mensagem]";
    }
  }

  if (contentNode.conversation) {
    content = contentNode.conversation;
  } else if (contentNode.extendedTextMessage?.text) {
    content = contentNode.extendedTextMessage.text;
  } else if (contentNode.imageMessage) {
    content = contentNode.imageMessage.caption || "";
    mediaType = "image";
    mediaUrl = resolveMediaUrl(entry, data, contentNode.imageMessage);
  } else if (contentNode.videoMessage) {
    content = contentNode.videoMessage.caption || "";
    mediaType = "video";
    mediaUrl = resolveMediaUrl(entry, data, contentNode.videoMessage);
  } else if (contentNode.audioMessage) {
    content = "[Áudio]";
    mediaType = "audio";
    mediaUrl = resolveMediaUrl(entry, data, contentNode.audioMessage);
  } else if (contentNode.documentMessage) {
    content = contentNode.documentMessage.fileName || "[Documento]";
    mediaType = "document";
    mediaUrl = resolveMediaUrl(entry, data, contentNode.documentMessage);
  } else if (contentNode.stickerMessage) {
    content = "[Sticker]";
    mediaType = "sticker";
    mediaUrl = resolveMediaUrl(entry, data, contentNode.stickerMessage);
  } else if (contentNode.reactionMessage) {
    // Reactions are handled separately — skip inserting as a new message
    const reactionKey = contentNode.reactionMessage.key;
    const reactionText = contentNode.reactionMessage.text || "";
    return {
      skip: true,
      reason: "reaction",
      reactionMessageId: reactionKey?.id || null,
      reactionSender: entry?.key?.participant || entry?.key?.remoteJid || null,
      reactionEmoji: reactionText,
    } as const;
    content = "[Contato]";
  } else if (contentNode.locationMessage || contentNode.liveLocationMessage) {
    content = "[Localização]";
  } else if (contentNode.pollCreationMessage || contentNode.pollCreationMessageV3) {
    content = "[Enquete]";
  } else if (contentNode.protocolMessage || contentNode.senderKeyDistributionMessage) {
    return { skip: true, reason: "protocol_message" } as const;
  } else {
    const keys = Object.keys(contentNode);
    // Ignorar silenciosamente tipos internos do protocolo
    if (keys.length > 0 && keys.every((k) => SILENT_SKIP_TYPES.has(k))) {
      return { skip: true, reason: "silent_skip" } as const;
    }
    content = keys.length > 0 ? `[${keys[0]}]` : "[Mensagem]";
  }

  const primaryType = Object.keys(contentNode)[0] || "unknown";

  // Extract mime type from the media node
  let mediaMimeType: string | null = null;
  let mediaThumbnail: string | null = null;
  let mediaWidth: number | null = null;
  let mediaHeight: number | null = null;
  const mediaNode =
    contentNode.imageMessage || contentNode.videoMessage || contentNode.audioMessage ||
    contentNode.documentMessage || contentNode.stickerMessage || null;
  if (mediaNode) {
    mediaMimeType = mediaNode.mimetype || mediaNode.mimeType || null;
    mediaThumbnail = mediaNode.jpegThumbnail || mediaNode.thumbnail || null;
    mediaWidth = mediaNode.width || null;
    mediaHeight = mediaNode.height || null;
  }

  return {
    skip: false as const,
    content,
    mediaType,
    mediaUrl,
    primaryType,
    quotedMessageId,
    quotedContent,
    mediaMimeType,
    mediaThumbnail,
    mediaWidth,
    mediaHeight,
  };
};

/** fetch() com timeout automático para não travar a Edge Function */
const fetchWithTimeout = (url: string, init: RequestInit, ms = 4000): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

// ─── Servidor ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Supabase env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const evoBaseUrl = EVOLUTION_API_URL
    ? EVOLUTION_API_URL.trim().replace(/\/$/, "").replace(/\/manager$/, "")
    : null;
  const evoHeaders: Record<string, string> = EVOLUTION_API_KEY
    ? { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY }
    : { "Content-Type": "application/json" };

  /** Busca nome do grupo — best-effort com timeout de 4s */
  const fetchGroupSubject = async (instName: string, groupJid: string): Promise<string | null> => {
    if (!evoBaseUrl) return null;
    const encodedJid = encodeURIComponent(groupJid);
    const attempts: Array<{ path: string; method: string; body?: string }> = [
      { path: `/group/findGroupInfos/${instName}?groupJid=${encodedJid}`, method: "GET" },
      { path: `/chat/findGroupInfos/${instName}?groupJid=${encodedJid}`, method: "GET" },
      { path: `/group/findGroupInfos/${instName}`, method: "POST", body: JSON.stringify({ groupJid }) },
    ];
    for (const a of attempts) {
      try {
        const init: RequestInit = { method: a.method, headers: evoHeaders };
        if (a.body) init.body = a.body;
        const res = await fetchWithTimeout(`${evoBaseUrl}${a.path}`, init);
        if (!res.ok) { await res.text().catch(() => {}); continue; }
        const json = await res.json();
        const gd = Array.isArray(json)
          ? json.find((g: any) => g.id === groupJid || g.jid === groupJid)
          : json;
        const subject = gd?.subject || gd?.name || gd?.groupName || null;
        if (subject) return subject;
      } catch { /* best-effort */ }
    }
    return null;
  };

  /**
   * Busca nome do contato — SOMENTE quando pushName é numérico e não temos
   * nome no CRM. Timeout de 4s para não travar.
   */
  const fetchContactName = async (instName: string, phoneJid: string): Promise<string | null> => {
    if (!evoBaseUrl) return null;
    for (const path of [`/chat/findContacts/${instName}`, `/contact/find/${instName}`]) {
      try {
        const res = await fetchWithTimeout(`${evoBaseUrl}${path}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({ where: { id: phoneJid } }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        const contacts = Array.isArray(json) ? json : json?.contacts || json?.data || [];
        if (contacts.length > 0) {
          const name = contacts[0]?.name || contacts[0]?.pushName || contacts[0]?.notify || null;
          if (name && !/^\d+$/.test(name)) return name;
        }
      } catch { /* best-effort */ }
    }
    return null;
  };

  try {
    const body = await req.json();
    const event: string = body?.event;
    const instanceName: string = body?.instance;
    const data = body?.data;

    if (!event || !instanceName || !data) {
      return jsonResponse({ ok: true, skipped: "missing fields" });
    }

    // Busca instância UMA única vez
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id, tenant_id, phone_number")
      .eq("instance_name", instanceName)
      .limit(1)
      .maybeSingle();

    if (!instance) {
      console.warn("Instance not found:", instanceName);
      return jsonResponse({ ok: true, skipped: "instance not found" });
    }

    const { id: instanceId, tenant_id: tenantId, phone_number: instancePhone } = instance;

    // ─── messages.upsert ──────────────────────────────────────────────────────
    if (event === "messages.upsert") {
      const entries = getMessageEntries(data);
      let processed = 0;

      for (const entry of entries) {
        const key = entry?.key || data?.key;
        const remoteJid: string = key?.remoteJid || entry?.remoteJid;
        const fromMe = Boolean(key?.fromMe);
        const messageId: string | null = key?.id || entry?.id || null;

        if (!remoteJid || remoteJid === "status@broadcast") continue;

        const isGroup = remoteJid.endsWith("@g.us");

        // Ignora eco da própria instância
        if (fromMe && !isGroup) {
          const rp = normalizePhone(remoteJid);
          if (rp && instancePhone && rp === instancePhone) continue;
        }

        const parsed = parseMessagePayload(entry, data);
        if (parsed.skip) {
          // Handle reactions: update metadata on original message
          if ("reason" in parsed && parsed.reason === "reaction" && "reactionMessageId" in parsed) {
            const reactionMsgId = (parsed as any).reactionMessageId as string | null;
            const reactionSender = (parsed as any).reactionSender as string | null;
            const reactionEmoji = (parsed as any).reactionEmoji as string;
            if (reactionMsgId && reactionSender) {
              // Find the original message
              const { data: origMsg } = await supabase
                .from("whatsapp_messages")
                .select("id, metadata")
                .eq("tenant_id", tenantId)
                .eq("message_id", reactionMsgId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (origMsg) {
                const meta = (origMsg.metadata || {}) as Record<string, unknown>;
                const reactions = (meta.reactions || {}) as Record<string, string>;
                if (reactionEmoji) {
                  reactions[reactionSender] = reactionEmoji;
                } else {
                  delete reactions[reactionSender]; // empty = remove reaction
                }
                await supabase
                  .from("whatsapp_messages")
                  .update({ metadata: { ...meta, reactions } })
                  .eq("tenant_id", tenantId)
                  .eq("id", origMsg.id);
              }
            }
          }
          continue;
        }

        const participantJid: string | null =
          key?.participant || entry?.participant || data?.participant || null;
        const conversationPhone = normalizePhone(remoteJid) || remoteJid.replace(/@.*$/, "");
        const participantPhone = normalizePhone(participantJid);
        const pushName: string =
          entry?.pushName || data?.pushName || participantPhone || conversationPhone || "Contato";

        const groupSubject: string | null =
          entry?.groupMetadata?.subject ||
          data?.groupMetadata?.subject ||
          entry?.chatName ||
          data?.chatName ||
          entry?.subject ||
          data?.subject ||
          null;

        const nowIso = new Date().toISOString();

        // ── Busca conversa e contato em PARALELO ──────────────────────────────
        // BUG CORRIGIDO: instance_id no filtro da conversa garante isolamento
        // entre instâncias — sem ele, conversas de instâncias diferentes com o
        // mesmo remoteJid se misturavam.
        const [{ data: conversation }, { data: contactByPhone }] = await Promise.all([
          supabase
            .from("whatsapp_conversations")
            .select("id, contact_id, contact_name, unread_count")
            .eq("tenant_id", tenantId)
            .eq("instance_id", instanceId)
            .eq("remote_jid", remoteJid)
            .limit(1)
            .maybeSingle(),

          (!isGroup && conversationPhone)
            ? supabase
                .from("contacts")
                .select("id, name")
                .eq("tenant_id", tenantId)
                .eq("phone", conversationPhone)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        let contactId: string | null = conversation?.contact_id || contactByPhone?.id || null;
        let resolvedContactName = pushName;

        if (!isGroup) {
          let contactRecord: { id: string; name: string | null } | null = contactByPhone || null;

          if (!contactRecord && contactId) {
            const { data: byId } = await supabase
              .from("contacts")
              .select("id, name")
              .eq("id", contactId)
              .limit(1)
              .maybeSingle();
            contactRecord = byId || null;
          }

          // Busca Evolution API SOMENTE quando não temos nome legível
          let evoContactName: string | null = null;
          const pushIsNumeric = /^\d+$/.test(pushName);
          const crmIsNumeric = !contactRecord?.name || /^\d+$/.test(contactRecord.name);
          if (pushIsNumeric && crmIsNumeric && conversationPhone) {
            evoContactName = await fetchContactName(
              instanceName,
              `${conversationPhone}@s.whatsapp.net`,
            );
          }

          const bestName = contactRecord?.name || evoContactName || pushName;

          if (!contactRecord && !fromMe && conversationPhone) {
            const { data: newContact } = await supabase
              .from("contacts")
              .insert({
                tenant_id: tenantId,
                name: evoContactName || pushName,
                phone: conversationPhone,
                tags: ["whatsapp", "lead"],
                notes: "Contato criado automaticamente via WhatsApp",
              })
              .select("id, name")
              .single();

            if (newContact?.id) {
              contactRecord = newContact;
              contactId = newContact.id;
              // Deal em background — não bloqueia
              supabase
                .from("deals")
                .insert({
                  tenant_id: tenantId,
                  contact_id: newContact.id,
                  title: `Lead WhatsApp - ${newContact.name || pushName}`,
                  stage: "lead",
                  status: "open",
                })
                .then(() => {}, console.error);
            }
          }

          if (contactRecord?.id) {
            contactId = contactRecord.id;
            if (evoContactName && crmIsNumeric && evoContactName !== contactRecord.name) {
              supabase
                .from("contacts")
                .update({ name: evoContactName })
                .eq("id", contactRecord.id)
                .then(() => {}, console.error);
              resolvedContactName = evoContactName;
            } else {
              resolvedContactName = contactRecord.name || bestName;
            }
          } else if (conversation?.contact_name) {
            resolvedContactName = conversation.contact_name;
          } else {
            resolvedContactName = bestName;
          }
        } else {
          if (conversation?.contact_name && !isPlaceholderGroupName(conversation.contact_name)) {
            resolvedContactName = conversation.contact_name;
          } else if (groupSubject && !isPlaceholderGroupName(groupSubject)) {
            resolvedContactName = groupSubject;
          } else {
            const apiSubject = await fetchGroupSubject(instanceName, remoteJid);
            resolvedContactName =
              apiSubject ||
              (conversation?.contact_name && !isPlaceholderGroupName(conversation.contact_name)
                ? conversation.contact_name
                : `Grupo ${conversationPhone || remoteJid}`);
          }
        }

        const senderLabel =
          isGroup && !fromMe
            ? entry?.pushName || data?.pushName || participantPhone || ""
            : "";
        const conversationPreview =
          senderLabel ? `${senderLabel}: ${parsed.content}` : parsed.content;

        // ── Upsert da conversa ────────────────────────────────────────────────
        let conversationId: string;

        if (!conversation) {
          const { data: newConv, error: convErr } = await supabase
            .from("whatsapp_conversations")
            .insert({
              tenant_id: tenantId,
              instance_id: instanceId,
              contact_id: isGroup ? null : contactId,
              remote_jid: remoteJid,
              contact_name: resolvedContactName,
              contact_phone: conversationPhone,
              last_message: conversationPreview,
              last_message_at: nowIso,
              unread_count: fromMe ? 0 : 1,
              status: "open",
            })
            .select("id")
            .single();

          if (convErr || !newConv?.id) {
            console.error("Failed to create conversation:", convErr?.message);
            continue;
          }
          conversationId = newConv.id;
        } else {
          conversationId = conversation.id;

          const updatePayload: Record<string, unknown> = {
            last_message: conversationPreview,
            last_message_at: nowIso,
            unread_count: fromMe
              ? conversation.unread_count || 0
              : (conversation.unread_count || 0) + 1,
          };

          if (!isGroup) {
            updatePayload.contact_id = contactId;
            // Só atualiza contact_name se o valor atual é numérico/placeholder
            // e o novo é genuinamente melhor — evita sobrescrever com o pushName
            // da própria instância em mensagens de saída
            const currentIsNumeric = !conversation.contact_name || /^\d+$/.test(conversation.contact_name);
            const newIsNumeric = /^\d+$/.test(resolvedContactName);
            if (currentIsNumeric && !newIsNumeric) {
              updatePayload.contact_name = resolvedContactName;
            } else if (!fromMe && !newIsNumeric && resolvedContactName !== conversation.contact_name) {
              updatePayload.contact_name = resolvedContactName;
            }
          } else if (
            !isPlaceholderGroupName(resolvedContactName) &&
            isPlaceholderGroupName(conversation.contact_name)
          ) {
            updatePayload.contact_name = resolvedContactName;
          } else if (groupSubject && isPlaceholderGroupName(conversation.contact_name)) {
            updatePayload.contact_name = groupSubject;
          }

          // Atualiza em background para não atrasar inserção da mensagem
          supabase
            .from("whatsapp_conversations")
            .update(updatePayload)
            .eq("tenant_id", tenantId)
            .eq("id", conversationId)
            .then(() => {}, console.error);
        }

        // ── Deduplicação correta ──────────────────────────────────────────────
        // BUG CORRIGIDO: message_id do WhatsApp NÃO é globalmente único entre
        // conversas. Sempre filtra por conversation_id + message_id juntos.
        // Sem o conversation_id, mensagens de outras conversas com o mesmo ID
        // causavam falso "já existe" e a mensagem era descartada silenciosamente,
        // ou pior — a mensagem errada era exibida na conversa.
        if (messageId) {
          const { data: dup } = await supabase
            .from("whatsapp_messages")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("conversation_id", conversationId)
            .eq("message_id", messageId)
            .limit(1)
            .maybeSingle();
          if (dup) { processed++; continue; }
        }

        // ── Inserção final ────────────────────────────────────────────────────
        const { error: insertErr } = await supabase.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          message_id: messageId,
          direction: fromMe ? "outbound" : "inbound",
          content: parsed.content,
          media_url: parsed.mediaUrl,
          media_type: parsed.mediaType,
          media_mime_type: parsed.mediaMimeType || null,
          media_thumbnail: parsed.mediaThumbnail || null,
          media_width: parsed.mediaWidth || null,
          media_height: parsed.mediaHeight || null,
          status: fromMe ? "sent" : "received",
          created_at: nowIso, // explícito para ordenação determinística
          metadata: {
            pushName: entry?.pushName || data?.pushName || null,
            senderPhone:
              participantPhone || (fromMe ? instancePhone : conversationPhone) || null,
            key,
            participant: participantJid,
            isGroup,
            messageType: parsed.primaryType,
            quotedMessageId: parsed.quotedMessageId || null,
            quotedContent: parsed.quotedContent || null,
          },
        });

        if (insertErr) {
          console.error("Failed to insert message:", insertErr.message);
          continue;
        }

        // Fire-and-forget: enfileira conversa para análise de IA
        // Só enfileira mensagens INBOUND para não analisar as próprias respostas
        if (!fromMe) {
          supabase.from("ai_analysis_queue").upsert({
            conversation_id: conversationId,
            tenant_id: tenantId,
            priority: 'high',
            status: 'pending',
          }, { onConflict: 'conversation_id', ignoreDuplicates: false })
          .then(() => {}, () => {});
        }

        processed++;
      }

      return jsonResponse({ ok: true, event: "message_stored", processed });
    }

    // ─── connection.update ────────────────────────────────────────────────────
    if (event === "connection.update") {
      const state = data?.state || data?.connection || "connecting";
      const newStatus =
        state === "open" ? "connected" : state === "close" ? "disconnected" : "connecting";
      const phoneNumber = extractConnectionPhone(data || {});

      const patch: Record<string, unknown> = { status: newStatus };
      if (phoneNumber) patch.phone_number = phoneNumber;
      if (newStatus === "connected") patch.qr_code = null;

      await supabase
        .from("whatsapp_instances")
        .update(patch)
        .eq("instance_name", instanceName);

      // ── Auto-import WhatsApp contacts on connection ──
      if (newStatus === "connected" && evoBaseUrl) {
        // Fire-and-forget: don't block the webhook response
        (async () => {
          const progressId = `${tenantId}-${instanceName}`;
          try {
            // Initialize progress
            await supabase.from("import_progress").upsert({
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

            // Fetch contacts from Evolution API
            let contacts: any[] = [];
            for (const path of [
              `/chat/findContacts/${instanceName}`,
              `/contact/find/${instanceName}`,
            ]) {
              try {
                const res = await fetchWithTimeout(
                  `${evoBaseUrl}${path}`,
                  { method: "POST", headers: evoHeaders, body: JSON.stringify({ where: {} }) },
                  15000,
                );
                if (res.ok) {
                  const json = await res.json();
                  contacts = Array.isArray(json) ? json : json?.contacts || json?.data || [];
                  if (contacts.length > 0) break;
                }
              } catch { /* try next path */ }
            }

            if (contacts.length === 0) {
              await supabase.from("import_progress").update({
                status: "done", imported: 0, total: 0, finished_at: new Date().toISOString(),
              }).eq("id", progressId);
              return;
            }

            // Update total
            await supabase.from("import_progress").update({ total: contacts.length }).eq("id", progressId);

            // Process in batches of 100
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
                const { error: upsertErr } = await supabase
                  .from("contacts")
                  .upsert(rows, { onConflict: "phone,tenant_id", ignoreDuplicates: true });
                if (!upsertErr) imported += rows.length;
              }

              // Update progress
              await supabase.from("import_progress").update({ imported }).eq("id", progressId);
            }

            // Update conversation names from imported contacts
            try {
              await supabase.rpc("update_conversations_contact_names", {
                p_tenant_id: tenantId,
                p_instance_name: instanceName,
              });
            } catch (e) {
              console.error("Failed to update conversation names:", e);
            }

            // Mark done
            await supabase.from("import_progress").update({
              status: "done", imported, finished_at: new Date().toISOString(),
            }).eq("id", progressId);
          } catch (err) {
            console.error("Contact import failed:", err);
            await supabase.from("import_progress").update({
              status: "error",
              error_message: String(err),
              finished_at: new Date().toISOString(),
            }).eq("id", progressId).catch(() => {});
          }
        })();
      }

      return jsonResponse({ ok: true, event: "status_updated", status: newStatus, phoneNumber });
    }

    // ─── messages.update ──────────────────────────────────────────────────────
    if (event === "messages.update") {
      const updates = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
          ? data.messages
          : [data];

      const statusMap: Record<number, string> = { 2: "sent", 3: "delivered", 4: "read" };

      // Atualiza todos em paralelo
      await Promise.all(
        updates
          .filter((u) => u?.key?.id !== undefined && u?.update?.status !== undefined)
          .map((u) =>
            supabase
              .from("whatsapp_messages")
              .update({ status: statusMap[u.update.status] || "sent" })
              .eq("tenant_id", tenantId)
              .eq("message_id", u.key.id),
          ),
      );

      return jsonResponse({ ok: true, event: "status_updated" });
    }

    // ─── chats.update ───────────────────────────────────────────────────────
    if (event === "chats.update") {
      // When user reads messages on their phone, zero the unread count
      const chats = Array.isArray(data) ? data : [data];
      for (const chat of chats) {
        const chatJid = chat?.id || chat?.remoteJid || chat?.jid;
        if (!chatJid) continue;
        const unreadCount = chat?.unreadCount ?? chat?.unread_count;
        if (typeof unreadCount === "number" && unreadCount === 0) {
          await supabase
            .from("whatsapp_conversations")
            .update({ unread_count: 0 })
            .eq("tenant_id", tenantId)
            .eq("instance_id", instanceId)
            .eq("remote_jid", chatJid);
        }
      }
      return jsonResponse({ ok: true, event: "chats_updated" });
    }

    // ─── presence.update ────────────────────────────────────────────────────
    if (event === "presence.update") {
      const presenceJid = data?.id || data?.remoteJid || data?.jid;
      const presences = data?.presences || data?.participants || {};
      if (presenceJid) {
        // Find if anyone is typing/recording
        let typingState: string | null = null;
        for (const [, pData] of Object.entries(presences)) {
          const p = pData as Record<string, unknown>;
          if (p?.lastKnownPresence === "composing" || p?.lastKnownPresence === "recording") {
            typingState = p.lastKnownPresence as string;
            break;
          }
        }
        await supabase
          .from("whatsapp_conversations")
          .update({
            typing_presence: typingState,
            typing_updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("instance_id", instanceId)
          .eq("remote_jid", presenceJid);
      }
      return jsonResponse({ ok: true, event: "presence_updated" });
    }

    // ─── groups.update ──────────────────────────────────────────────────────
    if (event === "groups.update") {
      const groups = Array.isArray(data) ? data : [data];
      for (const group of groups) {
        const groupJid = group?.id || group?.jid;
        if (!groupJid) continue;
        const patch: Record<string, unknown> = {};
        const subject = group?.subject || group?.name;
        if (subject) patch.contact_name = subject;
        const pictureUrl = group?.pictureUrl || group?.profilePictureUrl;
        if (pictureUrl) patch.profile_picture_url = pictureUrl;
        if (Object.keys(patch).length > 0) {
          await supabase
            .from("whatsapp_conversations")
            .update(patch)
            .eq("tenant_id", tenantId)
            .eq("instance_id", instanceId)
            .eq("remote_jid", groupJid);
        }
      }
      return jsonResponse({ ok: true, event: "groups_updated" });
    }

    return jsonResponse({ ok: true, skipped: "unhandled event" });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
});
