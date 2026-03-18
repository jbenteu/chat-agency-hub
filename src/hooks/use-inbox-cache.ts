/**
 * Module-level cache for WhatsApp Inbox data.
 * Survives React component unmount/remount (e.g. route changes).
 */

import type { Conversation, WhatsAppMessage, EvolutionInstance } from "./use-evolution-api";

interface GroupInfo {
  subject: string;
  description?: string | null;
  size?: number;
  pictureUrl?: string | null;
  participants: Array<{ id: string; admin: string | null; phone: string | null }>;
}

interface InboxCache {
  instances: EvolutionInstance[];
  selectedInstanceId: string;
  conversations: Record<string, Conversation[]>; // keyed by instanceId
  messages: Record<string, WhatsAppMessage[]>;   // keyed by conversationId
  profilePics: Record<string, string>;
  groupInfoCache: Record<string, GroupInfo>;
  lastFetchedAt: Record<string, number>;         // keyed by instanceId
}

const cache: InboxCache = {
  instances: [],
  selectedInstanceId: "",
  conversations: {},
  messages: {},
  profilePics: {},
  groupInfoCache: {},
  lastFetchedAt: {},
};

export function getInboxCache() {
  return cache;
}

export function setCachedInstances(instances: EvolutionInstance[]) {
  cache.instances = instances;
}

export function setCachedSelectedInstance(id: string) {
  cache.selectedInstanceId = id;
}

export function setCachedConversations(instanceId: string, convs: Conversation[]) {
  cache.conversations[instanceId] = convs;
  cache.lastFetchedAt[instanceId] = Date.now();
}

export function getCachedConversations(instanceId: string): Conversation[] | null {
  return cache.conversations[instanceId] ?? null;
}

export function setCachedMessages(conversationId: string, msgs: WhatsAppMessage[]) {
  cache.messages[conversationId] = msgs;
}

export function getCachedMessages(conversationId: string): WhatsAppMessage[] | null {
  return cache.messages[conversationId] ?? null;
}

export function setCachedProfilePic(jid: string, url: string) {
  cache.profilePics[jid] = url;
}

export function getCachedProfilePics(): Record<string, string> {
  return cache.profilePics;
}

export function setCachedGroupInfo(jid: string, info: GroupInfo) {
  cache.groupInfoCache[jid] = info;
}

export function getCachedGroupInfoMap(): Record<string, GroupInfo> {
  return { ...cache.groupInfoCache };
}

export function isCacheFresh(instanceId: string, maxAgeMs = 60_000): boolean {
  const ts = cache.lastFetchedAt[instanceId];
  if (!ts) return false;
  return Date.now() - ts < maxAgeMs;
}

export type { GroupInfo };
