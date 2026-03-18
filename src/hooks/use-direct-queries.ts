/**
 * Direct Supabase queries for WhatsApp data - bypasses Edge Function for read operations.
 * Uses RLS policies for tenant isolation, avoiding cold start latency.
 */
import { supabase } from "@/integrations/supabase/client";
import type { EvolutionInstance, Conversation, WhatsAppMessage } from "./use-evolution-api";

const PLACEHOLDER_MAP: Record<string, string> = {
  "[Imagem]": "Imagem",
  "[Áudio]": "Áudio",
  "[Vídeo]": "Vídeo",
  "[Sticker]": "Sticker",
  "[Documento]": "Documento",
  "[Mídia]": "Mídia",
};

function normalizePreview(value: string | null): string | null {
  if (!value) return value;
  const trimmed = value.trim();
  if (PLACEHOLDER_MAP[trimmed]) return PLACEHOLDER_MAP[trimmed];
  const colonIndex = trimmed.lastIndexOf(": ");
  if (colonIndex > 0) {
    const sender = trimmed.slice(0, colonIndex);
    const suffix = trimmed.slice(colonIndex + 2).trim();
    if (PLACEHOLDER_MAP[suffix]) return `${sender}: ${PLACEHOLDER_MAP[suffix]}`;
  }
  return value;
}

function deduplicateConversations(conversations: Conversation[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const conv of conversations) {
    const key = `${conv.instance_id}:${conv.remote_jid}`;
    const normalized = { ...conv, last_message: normalizePreview(conv.last_message) };
    const existing = map.get(key);
    if (!existing) {
      map.set(key, normalized);
      continue;
    }
    const existingTs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
    const currentTs = normalized.last_message_at ? new Date(normalized.last_message_at).getTime() : 0;
    const keepCurrent = currentTs > existingTs || (currentTs === existingTs);
    const winner = keepCurrent ? normalized : existing;
    const loser = keepCurrent ? existing : normalized;
    map.set(key, {
      ...winner,
      contact_name: winner.contact_name || loser.contact_name,
      contact_phone: winner.contact_phone || loser.contact_phone,
      last_message: winner.last_message || loser.last_message,
      last_message_at: winner.last_message_at || loser.last_message_at,
      unread_count: Math.max(Number(existing.unread_count || 0), Number(normalized.unread_count || 0)),
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTs - aTs;
  });
}

export async function queryInstances(): Promise<EvolutionInstance[]> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as unknown as EvolutionInstance[];
}

export async function queryConversations(instanceId?: string): Promise<Conversation[]> {
  let query = supabase
    .from("whatsapp_conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (instanceId) query = query.eq("instance_id", instanceId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return deduplicateConversations((data || []) as unknown as Conversation[]);
}

export async function queryMessages(conversationId: string, limit = 100): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as WhatsAppMessage[]).reverse();
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}
