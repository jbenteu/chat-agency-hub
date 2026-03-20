import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EvolutionInstance {
  id: string;
  tenant_id: string;
  instance_name: string;
  display_name: string | null;
  instance_id: string | null;
  status: string;
  phone_number: string | null;
  qr_code: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface QrCodeData {
  base64?: string;
  code?: string;
}

interface Conversation {
  id: string;
  tenant_id: string;
  instance_id: string;
  contact_id: string | null;
  remote_jid: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
  assigned_to: string | null;
  profile_picture_url: string | null;
  pinned: boolean;
  archived: boolean;
  typing_presence: string | null;
  typing_updated_at: string | null;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
}

interface WhatsAppMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string | null;
  direction: "inbound" | "outbound";
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  media_mime_type: string | null;
  media_thumbnail: string | null;
  media_width: number | null;
  media_height: number | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useEvolutionApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callEvolution = useCallback(
    async (
      body: Record<string, unknown>,
      options: { trackLoading?: boolean; trackError?: boolean; maxRetries?: number } = {}
    ) => {
      const { trackLoading = true, trackError = true, maxRetries = 2 } = options;
      if (trackLoading) setLoading(true);
      if (trackError) setError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error("Não autenticado");

        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
              body,
              headers: { Authorization: `Bearer ${token}` },
            });

            if (fnError) {
              const msg = fnError.message || "";
              const isRetryable = /non-2xx|timeout|boot|503|504|fetch/i.test(msg);
              if (isRetryable && attempt < maxRetries) {
                lastError = new Error(msg);
                await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
                continue;
              }
              throw new Error(msg);
            }
            if (data?.error) throw new Error(data.error);
            return data;
          } catch (err: any) {
            const msg = err.message || "";
            const isRetryable = /non-2xx|timeout|boot|503|504|fetch/i.test(msg);
            if (isRetryable && attempt < maxRetries) {
              lastError = err;
              await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
        throw lastError || new Error("Erro desconhecido");
      } catch (err: any) {
        const msg = err.message || "Erro desconhecido";
        if (trackError) setError(msg);
        throw err;
      } finally {
        if (trackLoading) setLoading(false);
      }
    },
    []
  );

  const createInstance = useCallback(
    (instanceName: string, displayName?: string) =>
      callEvolution({ action: "create_instance", instanceName, displayName }),
    [callEvolution]
  );

  const updateDisplayName = useCallback(
    (instanceName: string, displayName: string) =>
      callEvolution({ action: "update_display_name", instanceName, displayName }),
    [callEvolution]
  );

  const getQrCode = useCallback(
    (instanceName: string) => callEvolution({ action: "get_qrcode", instanceName }),
    [callEvolution]
  );

  const getConnectionStatus = useCallback(
    (instanceName: string) => callEvolution({ action: "connection_status", instanceName }),
    [callEvolution]
  );

  const listInstances = useCallback(
    () => callEvolution({ action: "list_instances" }),
    [callEvolution]
  );

  const deleteInstance = useCallback(
    (instanceName: string) => callEvolution({ action: "delete_instance", instanceName }),
    [callEvolution]
  );

  const listConversations = useCallback(
    (instanceId?: string) =>
      callEvolution({ action: "list_conversations", instanceId }),
    [callEvolution]
  );

  const listMessages = useCallback(
    (conversationId: string, limit?: number) =>
      callEvolution({ action: "list_messages", conversationId, limit }),
    [callEvolution]
  );

  const sendText = useCallback(
    (instanceName: string, remoteJid: string, text: string, quotedMessageId?: string) =>
      callEvolution({ action: "send_text", instanceName, remoteJid, text, quotedMessageId }),
    [callEvolution]
  );

  const sendMedia = useCallback(
    (instanceName: string, remoteJid: string, mediatype: string, media: string, caption?: string, fileName?: string, quotedMessageId?: string) =>
      callEvolution({ action: "send_media", instanceName, remoteJid, mediatype, media, caption, fileName, quotedMessageId }),
    [callEvolution]
  );

  const getProfilePicture = useCallback(
    (instanceName: string, remoteJid: string) =>
      callEvolution(
        { action: "get_profile_picture", instanceName, remoteJid },
        { trackLoading: false, trackError: false }
      ),
    [callEvolution]
  );

  const fetchGroupInfo = useCallback(
    (instanceName: string, remoteJid: string) =>
      callEvolution(
        { action: "fetch_group_info", instanceName, remoteJid },
        { trackLoading: false, trackError: false }
      ),
    [callEvolution]
  );

  const getContact = useCallback(
    (contactId: string) =>
      callEvolution({ action: "get_contact", contactId }),
    [callEvolution]
  );

  const updateContact = useCallback(
    (contactId: string, fields: Record<string, unknown>) =>
      callEvolution({ action: "update_contact", contactId, fields }),
    [callEvolution]
  );

  const getGroupInviteLink = useCallback(
    (instanceName: string, remoteJid: string) =>
      callEvolution({ action: "get_group_invite_link", instanceName, remoteJid }),
    [callEvolution]
  );

  const removeGroupParticipant = useCallback(
    (instanceName: string, remoteJid: string, participantJid: string) =>
      callEvolution({ action: "remove_group_participant", instanceName, remoteJid, participantJid }),
    [callEvolution]
  );

  const promoteGroupParticipant = useCallback(
    (instanceName: string, remoteJid: string, participantJid: string) =>
      callEvolution({ action: "promote_group_participant", instanceName, remoteJid, participantJid }),
    [callEvolution]
  );

  const demoteGroupParticipant = useCallback(
    (instanceName: string, remoteJid: string, participantJid: string) =>
      callEvolution({ action: "demote_group_participant", instanceName, remoteJid, participantJid }),
    [callEvolution]
  );

  const getMedia = useCallback(
    (instanceName: string, messageId: string, remoteJid?: string) =>
      callEvolution(
        { action: "get_media", instanceName, messageId, remoteJid },
        { trackLoading: false, trackError: false }
      ),
    [callEvolution]
  );

  const sendReaction = useCallback(
    (instanceName: string, remoteJid: string, messageId: string, reaction: string) =>
      callEvolution({ action: "send_reaction", instanceName, remoteJid, messageId, reaction }),
    [callEvolution]
  );

  const deleteMessage = useCallback(
    (instanceName: string, remoteJid: string, messageId: string) =>
      callEvolution({ action: "delete_message", instanceName, remoteJid, messageId }),
    [callEvolution]
  );

  const markAsRead = useCallback(
    (conversationId: string, instanceName?: string, remoteJid?: string) =>
      callEvolution(
        { action: "mark_as_read", conversationId, instanceName, remoteJid },
        { trackLoading: false, trackError: false }
      ),
    [callEvolution]
  );

  const updatePresence = useCallback(
    (instanceName: string, remoteJid: string, presence?: string) =>
      callEvolution(
        { action: "update_presence", instanceName, remoteJid, presence },
        { trackLoading: false, trackError: false }
      ),
    [callEvolution]
  );

  const archiveConversation = useCallback(
    (conversationId: string, archived?: boolean) =>
      callEvolution({ action: "archive_conversation", conversationId, archived }),
    [callEvolution]
  );

  const pinConversation = useCallback(
    (conversationId: string, pinned?: boolean) =>
      callEvolution({ action: "pin_conversation", conversationId, pinned }),
    [callEvolution]
  );

  const updateConversationStatus = useCallback(
    (conversationId: string, status: string) =>
      callEvolution({ action: "update_conversation_status", conversationId, status }),
    [callEvolution]
  );

  const searchMessages = useCallback(
    (conversationId: string, query: string, limit?: number) =>
      callEvolution({ action: "search_messages", conversationId, query, limit }),
    [callEvolution]
  );

  return {
    loading,
    error,
    createInstance,
    getQrCode,
    getConnectionStatus,
    listInstances,
    deleteInstance,
    updateDisplayName,
    listConversations,
    listMessages,
    sendText,
    sendMedia,
    getProfilePicture,
    fetchGroupInfo,
    getContact,
    updateContact,
    getGroupInviteLink,
    removeGroupParticipant,
    promoteGroupParticipant,
    demoteGroupParticipant,
    getMedia,
    sendReaction,
    deleteMessage,
    markAsRead,
    updatePresence,
    archiveConversation,
    pinConversation,
    updateConversationStatus,
    searchMessages,
  };
}

export type { EvolutionInstance, QrCodeData, Conversation, WhatsAppMessage };
