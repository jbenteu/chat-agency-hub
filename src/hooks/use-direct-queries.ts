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

function deduplicateMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  const map = new Map<string, WhatsAppMessage>();

  for (const msg of messages) {
    const key = msg.message_id || msg.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, msg);
      continue;
    }

    const existingTs = existing.created_at ? new Date(existing.created_at).getTime() : 0;
    const currentTs = msg.created_at ? new Date(msg.created_at).getTime() : 0;

    const keepCurrent =
      currentTs > existingTs ||
      (currentTs === existingTs && (msg.media_url || msg.status !== existing.status));

    if (keepCurrent) map.set(key, msg);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export async function queryInstances(): Promise<EvolutionInstance[]> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as unknown as EvolutionInstance[];
}

/** Fetch instances enriched with owner profile name */
export async function queryInstancesWithOwners(): Promise<(EvolutionInstance & { owner_name?: string })[]> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const instances = (data || []) as unknown as EvolutionInstance[];
  
  // Collect unique owner IDs
  const ownerIds = [...new Set(instances.map(i => (i as any).owner_id).filter(Boolean))];
  if (ownerIds.length === 0) return instances.map(i => ({ ...i, owner_name: undefined }));
  
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ownerIds);
  
  const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
  
  return instances.map(i => ({
    ...i,
    owner_name: profileMap.get((i as any).owner_id) || undefined,
  }));
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
  return deduplicateMessages((data || []) as unknown as WhatsAppMessage[]);
}

export async function queryMessagesSince(
  conversationId: string,
  since: string,
  limit = 150
): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, 300));

  if (error) throw new Error(error.message);
  return deduplicateMessages((data || []) as unknown as WhatsAppMessage[]);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}
