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

// Helper to check if a group name is a placeholder (JID digits or "Grupo 1234...")
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
    payload?.phone,
    payload?.number,
    payload?.instance?.phone,
    payload?.instance?.number,
    payload?.instance?.owner,
    payload?.instance?.ownerJid,
    payload?.instance?.wid,
    payload?.instance?.wuid,
    payload?.me?.id,
    payload?.me?.jid,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const parsed = normalizePhone(candidate);
      if (parsed) return parsed;
    }

    if (candidate && typeof candidate === "object") {
      const objectCandidate = candidate as Record<string, unknown>;
      const parsed =
        normalizePhone(objectCandidate.id) ||
        normalizePhone(objectCandidate.user) ||
        normalizePhone(objectCandidate.jid);
      if (parsed) return parsed;
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

  let current = message;

  if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
  if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
  if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
  if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;

  return current;
};

const parseMessagePayload = (message: Record<string, any>) => {
  const contentNode = unwrapMessageContent(message);

  let content = "";
  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  let quotedMessageId: string | null = null;
  let quotedContent: string | null = null;

  // Extract quoted message info
  const contextInfo = contentNode.extendedTextMessage?.contextInfo ||
    contentNode.imageMessage?.contextInfo ||
    contentNode.videoMessage?.contextInfo ||
    contentNode.audioMessage?.contextInfo ||
    contentNode.documentMessage?.contextInfo ||
    contentNode.stickerMessage?.contextInfo || null;

  if (contextInfo?.stanzaId) {
    quotedMessageId = contextInfo.stanzaId;
    quotedContent = contextInfo.quotedMessage?.conversation ||
      contextInfo.quotedMessage?.extendedTextMessage?.text ||
      contextInfo.quotedMessage?.imageMessage?.caption ||
      "[Mensagem]";
  }

  if (contentNode.conversation) {
    content = contentNode.conversation;
  } else if (contentNode.extendedTextMessage?.text) {
    content = contentNode.extendedTextMessage.text;
  } else if (contentNode.imageMessage) {
    content = contentNode.imageMessage.caption || "[Imagem]";
    mediaType = "image";
    mediaUrl = contentNode.imageMessage.url || contentNode.imageMessage.directPath || null;
  } else if (contentNode.videoMessage) {
    content = contentNode.videoMessage.caption || "[Vídeo]";
    mediaType = "video";
    mediaUrl = contentNode.videoMessage.url || contentNode.videoMessage.directPath || null;
  } else if (contentNode.audioMessage) {
    content = "[Áudio]";
    mediaType = "audio";
    mediaUrl = contentNode.audioMessage.url || contentNode.audioMessage.directPath || null;
  } else if (contentNode.documentMessage) {
    content = contentNode.documentMessage.fileName || "[Documento]";
    mediaType = "document";
    mediaUrl = contentNode.documentMessage.url || contentNode.documentMessage.directPath || null;
  } else if (contentNode.stickerMessage) {
    content = "[Sticker]";
    mediaType = "sticker";
    mediaUrl =
      contentNode.stickerMessage.url ||
      contentNode.stickerMessage.mediaUrl ||
      contentNode.stickerMessage.directPath ||
      null;
  } else if (contentNode.reactionMessage) {
    content = contentNode.reactionMessage.text || "[Reação]";
  } else if (contentNode.contactsArrayMessage || contentNode.contactMessage) {
    content = "[Contato]";
  } else if (contentNode.locationMessage || contentNode.liveLocationMessage) {
    content = "[Localização]";
  } else if (contentNode.pollCreationMessage || contentNode.pollCreationMessageV3) {
    content = "[Enquete]";
  } else if (contentNode.protocolMessage || contentNode.senderKeyDistributionMessage) {
    return { skip: true, reason: "protocol_message" };
  } else {
    const keys = Object.keys(contentNode);
    content = keys.length > 0 ? `[${keys[0]}]` : "[Mensagem]";
  }

  const primaryType = Object.keys(contentNode)[0] || "unknown";

  return {
    skip: false,
    content,
    mediaType,
    mediaUrl,
    primaryType,
    quotedMessageId,
    quotedContent,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Supabase env not configured" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const event = body?.event;
    const instanceName = body?.instance;
    const data = body?.data;

    if (!event || !instanceName || !data) {
      return jsonResponse({ ok: true, skipped: "missing fields" });
    }

    const { data: instance, error: instanceError } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, tenant_id, phone_number")
      .eq("instance_name", instanceName)
      .limit(1)
      .single();

    if (instanceError || !instance) {
      console.warn("Instance not found for webhook:", instanceName);
      return jsonResponse({ ok: true, skipped: "instance not found" });
    }

    const tenantId = instance.tenant_id;
    const instanceId = instance.id;
    const instancePhone = instance.phone_number;

    if (event === "messages.upsert") {
      const entries = getMessageEntries(data);
      let processed = 0;

      for (const entry of entries) {
        const key = entry?.key || data?.key;
        const remoteJid = key?.remoteJid || entry?.remoteJid;
        const fromMe = Boolean(key?.fromMe);
        const messageId = key?.id || entry?.id || null;

        if (!remoteJid || remoteJid === "status@broadcast") continue;

        const isGroup = String(remoteJid).endsWith("@g.us");

        if (fromMe && !isGroup) {
          const remotePhone = normalizePhone(remoteJid);
          if (remotePhone && instancePhone && remotePhone === instancePhone) {
            continue;
          }
        }

        const parsed = parseMessagePayload(entry?.message || data?.message || {});
        if (parsed.skip) continue;

        const participantJid = key?.participant || entry?.participant || data?.participant || null;
        const participantAlt = key?.participantAlt || null;
        const conversationPhone = normalizePhone(remoteJid) || remoteJid.replace(/@.*$/, "");
        const participantPhone = normalizePhone(participantJid) || normalizePhone(participantAlt);

        const pushName =
          entry?.pushName ||
          data?.pushName ||
          participantPhone ||
          conversationPhone ||
          "Contato";

        const groupSubject =
          entry?.groupMetadata?.subject ||
          data?.groupMetadata?.subject ||
          entry?.chatName ||
          data?.chatName ||
          entry?.subject ||
          data?.subject ||
          entry?.name ||
          data?.name ||
          null;

        let { data: conversation } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("id, contact_id, contact_name, unread_count")
          .eq("tenant_id", tenantId)
          .eq("instance_id", instanceId)
          .eq("remote_jid", remoteJid)
          .limit(1)
          .maybeSingle();

        let contactId: string | null = conversation?.contact_id || null;
        let resolvedContactName = pushName;

        if (!isGroup) {
          let contactRecord: { id: string; name: string | null } | null = null;

          if (contactId) {
            const { data: byId } = await supabaseAdmin
              .from("contacts")
              .select("id, name")
              .eq("id", contactId)
              .limit(1)
              .maybeSingle();
            contactRecord = byId || null;
          }

          if (!contactRecord && conversationPhone) {
            const { data: byPhone } = await supabaseAdmin
              .from("contacts")
              .select("id, name")
              .eq("tenant_id", tenantId)
              .eq("phone", conversationPhone)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            contactRecord = byPhone || null;
          }

          if (!contactRecord && !fromMe && conversationPhone) {
            const { data: newContact } = await supabaseAdmin
              .from("contacts")
              .insert({
                tenant_id: tenantId,
                name: pushName,
                phone: conversationPhone,
                tags: ["whatsapp", "lead"],
                notes: "Contato criado automaticamente via WhatsApp",
              })
              .select("id, name")
              .single();

            if (newContact?.id) {
              await supabaseAdmin.from("deals").insert({
                tenant_id: tenantId,
                contact_id: newContact.id,
                title: `Lead WhatsApp - ${newContact.name || pushName}`,
                stage: "lead",
                status: "open",
              });
            }

            contactRecord = newContact || null;
          }

          if (contactRecord?.id) {
            contactId = contactRecord.id;
            resolvedContactName = contactRecord.name || pushName;
          } else if (conversation?.contact_name) {
            resolvedContactName = conversation.contact_name;
          }
        } else {
          if (conversation?.contact_name && !conversation.contact_name.startsWith("Grupo ") && !/^\d+$/.test(conversation.contact_name)) {
            resolvedContactName = conversation.contact_name;
          } else if (groupSubject) {
            resolvedContactName = groupSubject;
          } else if (conversation?.contact_name) {
            resolvedContactName = conversation.contact_name;
          } else {
            resolvedContactName = `Grupo ${conversationPhone || remoteJid}`;
          }
        }

        // For conversation preview, prefix sender name in groups
        const senderLabel = isGroup && !fromMe
          ? (entry?.pushName || data?.pushName || participantPhone || "")
          : "";
        const conversationPreview = isGroup && senderLabel
          ? `${senderLabel}: ${parsed.content}`
          : parsed.content;

        if (!conversation) {
          const { data: newConversation } = await supabaseAdmin
            .from("whatsapp_conversations")
            .insert({
              tenant_id: tenantId,
              instance_id: instanceId,
              contact_id: isGroup ? null : contactId,
              remote_jid: remoteJid,
              contact_name: resolvedContactName,
              contact_phone: conversationPhone,
              last_message: conversationPreview,
              last_message_at: new Date().toISOString(),
              unread_count: fromMe ? 0 : 1,
              status: "open",
            })
            .select("id, contact_id, unread_count")
            .single();

          conversation = newConversation || null;
        } else {
          const updatePayload: Record<string, unknown> = {
            last_message: conversationPreview,
            last_message_at: new Date().toISOString(),
            unread_count: fromMe ? conversation.unread_count || 0 : (conversation.unread_count || 0) + 1,
          };

          if (!isGroup) {
            updatePayload.contact_id = contactId;
            updatePayload.contact_name = resolvedContactName;
          } else if (groupSubject && (conversation.contact_name?.startsWith("Grupo ") || /^\d+$/.test(conversation.contact_name || ""))) {
            updatePayload.contact_name = groupSubject;
          }

          await supabaseAdmin
            .from("whatsapp_conversations")
            .update(updatePayload)
            .eq("tenant_id", tenantId)
            .eq("id", conversation.id);
        }

        if (!conversation?.id) continue;

        if (messageId) {
          const { data: existingMessage } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("conversation_id", conversation.id)
            .eq("message_id", messageId)
            .limit(1)
            .maybeSingle();

          if (existingMessage) {
            processed += 1;
            continue;
          }
        }

        // Store RAW content (no sender prefix) - sender info goes in metadata
        await supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          conversation_id: conversation.id,
          message_id: messageId,
          direction: fromMe ? "outbound" : "inbound",
          content: parsed.content,
          media_url: parsed.mediaUrl,
          media_type: parsed.mediaType,
          status: fromMe ? "sent" : "received",
          metadata: {
            pushName: entry?.pushName || data?.pushName || null,
            senderPhone: participantPhone || (fromMe ? instancePhone : conversationPhone) || null,
            key,
            participant: participantJid,
            isGroup,
            messageType: parsed.primaryType,
            quotedMessageId: parsed.quotedMessageId || null,
            quotedContent: parsed.quotedContent || null,
          },
        });

        processed += 1;
      }

      return jsonResponse({ ok: true, event: "message_stored", processed });
    }

    if (event === "connection.update") {
      const state = data?.state || data?.connection || "connecting";
      const newStatus = state === "open" ? "connected" : state === "close" ? "disconnected" : "connecting";
      const phoneNumber = extractConnectionPhone(data || {});

      const patch: Record<string, unknown> = { status: newStatus };
      if (phoneNumber) patch.phone_number = phoneNumber;
      if (newStatus === "connected") patch.qr_code = null;

      await supabaseAdmin
        .from("whatsapp_instances")
        .update(patch)
        .eq("instance_name", instanceName);

      return jsonResponse({ ok: true, event: "status_updated", status: newStatus, phoneNumber });
    }

    if (event === "messages.update") {
      const updates = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
          ? data.messages
          : [data];

      const statusMap: Record<number, string> = {
        2: "sent",
        3: "delivered",
        4: "read",
      };

      for (const update of updates) {
        const msgId = update?.key?.id;
        const rawStatus = update?.update?.status;
        if (!msgId || rawStatus === undefined) continue;

        const mappedStatus = statusMap[rawStatus] || "sent";

        await supabaseAdmin
          .from("whatsapp_messages")
          .update({ status: mappedStatus })
          .eq("message_id", msgId)
          .eq("tenant_id", tenantId);
      }

      return jsonResponse({ ok: true, event: "status_updated" });
    }

    return jsonResponse({ ok: true, skipped: "unhandled event" });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return jsonResponse({ ok: false, error: String(error) });
  }
});
