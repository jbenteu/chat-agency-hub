import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

    const event = body.event;
    const instanceName = body.instance;
    const data = body.data;

    if (!event || !instanceName || !data) {
      return new Response(JSON.stringify({ ok: true, skipped: "missing fields" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the instance to get tenant_id
    const { data: instance, error: instErr } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, tenant_id")
      .eq("instance_name", instanceName)
      .limit(1)
      .single();

    if (instErr || !instance) {
      console.warn("Instance not found for webhook:", instanceName);
      return new Response(JSON.stringify({ ok: true, skipped: "instance not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = instance.tenant_id;
    const instanceId = instance.id;

    // Handle message events
    if (event === "messages.upsert") {
      const key = data.key;
      const remoteJid = key?.remoteJid;
      const fromMe = key?.fromMe || false;
      const messageId = key?.id;

      if (!remoteJid || remoteJid === "status@broadcast") {
        return new Response(JSON.stringify({ ok: true, skipped: "broadcast" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract message content — data.message IS the content object
      const msgContent = data.message || {};
      let content = "";
      let mediaUrl = "";
      let mediaType = "";

      if (msgContent.conversation) {
        content = msgContent.conversation;
      } else if (msgContent.extendedTextMessage?.text) {
        content = msgContent.extendedTextMessage.text;
      } else if (msgContent.imageMessage) {
        content = msgContent.imageMessage.caption || "[Imagem]";
        mediaType = "image";
        mediaUrl = msgContent.imageMessage.url || "";
      } else if (msgContent.audioMessage) {
        content = "[Áudio]";
        mediaType = "audio";
        mediaUrl = msgContent.audioMessage.url || "";
      } else if (msgContent.videoMessage) {
        content = msgContent.videoMessage.caption || "[Vídeo]";
        mediaType = "video";
        mediaUrl = msgContent.videoMessage.url || "";
      } else if (msgContent.documentMessage) {
        content = msgContent.documentMessage.fileName || "[Documento]";
        mediaType = "document";
        mediaUrl = msgContent.documentMessage.url || "";
      } else if (msgContent.stickerMessage) {
        content = "[Sticker]";
        mediaType = "sticker";
      } else if (msgContent.reactionMessage) {
        content = msgContent.reactionMessage.text || "[Reação]";
      } else if (msgContent.contactMessage || msgContent.contactsArrayMessage) {
        content = "[Contato]";
      } else if (msgContent.locationMessage || msgContent.liveLocationMessage) {
        content = "[Localização]";
      } else if (msgContent.pollCreationMessage || msgContent.pollCreationMessageV3) {
        content = "[Enquete]";
      } else if (msgContent.protocolMessage || msgContent.senderKeyDistributionMessage) {
        // Protocol/system messages — skip silently
        return new Response(JSON.stringify({ ok: true, skipped: "protocol_message" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Log unknown message types for debugging
        const msgKeys = Object.keys(msgContent).join(", ");
        console.warn("Unhandled message type, keys:", msgKeys);
        content = `[${msgKeys || "Mensagem"}]`;
      }

      // Extract contact info from JID
      const isGroup = remoteJid.endsWith("@g.us");
      const contactPhone = remoteJid.replace(/@.*$/, "");
      const pushName = data.pushName || contactPhone;
      const direction = fromMe ? "outbound" : "inbound";

      // For groups, use the group subject if available, or the participant's pushName
      const conversationName = isGroup
        ? (data.groupMetadata?.subject || data.pushName || `Grupo ${contactPhone}`)
        : pushName;

      // Find or create conversation
      let { data: conversation } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id, contact_id, unread_count")
        .eq("instance_id", instanceId)
        .eq("remote_jid", remoteJid)
        .limit(1)
        .single();

      let contactId: string | null = null;

      if (!conversation) {
        // Only create CRM contact/deal for individual chats, not groups
        if (!isGroup) {
          const { data: newContact } = await supabaseAdmin
            .from("contacts")
            .insert({
              tenant_id: tenantId,
              name: pushName,
              phone: contactPhone,
              tags: ["whatsapp", "lead"],
              notes: "Contato criado automaticamente via WhatsApp",
            })
            .select("id")
            .single();

          contactId = newContact?.id || null;

          if (contactId) {
            await supabaseAdmin.from("deals").insert({
              tenant_id: tenantId,
              contact_id: contactId,
              title: `Lead WhatsApp - ${pushName}`,
              stage: "lead",
              status: "open",
            });
          }
        }

        // Create conversation
        const { data: newConv } = await supabaseAdmin
          .from("whatsapp_conversations")
          .insert({
            tenant_id: tenantId,
            instance_id: instanceId,
            contact_id: contactId,
            remote_jid: remoteJid,
            contact_name: conversationName,
            contact_phone: contactPhone,
            last_message: content,
            last_message_at: new Date().toISOString(),
            unread_count: fromMe ? 0 : 1,
            status: "open",
          })
          .select("id")
          .single();

        conversation = newConv ? { ...newConv, contact_id: contactId, unread_count: 0 } : null;
      } else {
        contactId = conversation.contact_id;

        // Update conversation
        await supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            contact_name: pushName,
            unread_count: fromMe ? 0 : (conversation.unread_count || 0) + 1,
          })
          .eq("id", conversation.id);

        // Update contact name if changed
        if (contactId) {
          await supabaseAdmin
            .from("contacts")
            .update({ name: pushName })
            .eq("id", contactId);
        }
      }

      if (conversation) {
        // Insert message
        await supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          conversation_id: conversation.id,
          message_id: messageId,
          direction,
          content,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
          status: fromMe ? "sent" : "received",
          metadata: { pushName, key },
        });
      }

      return new Response(JSON.stringify({ ok: true, event: "message_stored" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle connection update
    if (event === "connection.update") {
      const state = data.state;
      const newStatus = state === "open" ? "connected" : state === "close" ? "disconnected" : "connecting";

      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: newStatus })
        .eq("instance_name", instanceName);

      return new Response(JSON.stringify({ ok: true, event: "status_updated" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle message status updates (delivered, read)
    if (event === "messages.update") {
      const updates = Array.isArray(data) ? data : [data];
      for (const upd of updates) {
        const msgId = upd.key?.id;
        const status = upd.update?.status;
        if (msgId && status !== undefined) {
          const statusMap: Record<number, string> = {
            2: "sent",
            3: "delivered",
            4: "read",
          };
          const newStatus = statusMap[status] || "sent";
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({ status: newStatus })
            .eq("message_id", msgId);
        }
      }

      return new Response(JSON.stringify({ ok: true, event: "status_updated" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, skipped: "unhandled event" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 200, // Always 200 to avoid retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
