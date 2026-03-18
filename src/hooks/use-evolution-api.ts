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
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useEvolutionApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callEvolution = useCallback(async (body: Record<string, unknown>) => {
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
        body,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      return data;
    } catch (err: any) {
      const msg = err.message || "Erro desconhecido";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

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
    (conversationId: string) =>
      callEvolution({ action: "list_messages", conversationId }),
    [callEvolution]
  );

  const sendText = useCallback(
    (instanceName: string, remoteJid: string, text: string, quotedMessageId?: string) =>
      callEvolution({ action: "send_text", instanceName, remoteJid, text, quotedMessageId }),
    [callEvolution]
  );

  const sendMedia = useCallback(
    (instanceName: string, remoteJid: string, mediatype: string, media: string, caption?: string, fileName?: string) =>
      callEvolution({ action: "send_media", instanceName, remoteJid, mediatype, media, caption, fileName }),
    [callEvolution]
  );

  const getProfilePicture = useCallback(
    (instanceName: string, remoteJid: string) =>
      callEvolution({ action: "get_profile_picture", instanceName, remoteJid }),
    [callEvolution]
  );

  const fetchGroupInfo = useCallback(
    (instanceName: string, remoteJid: string) =>
      callEvolution({ action: "fetch_group_info", instanceName, remoteJid }),
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
  };
}

export type { EvolutionInstance, QrCodeData, Conversation, WhatsAppMessage };
