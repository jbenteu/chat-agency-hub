import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  assigned_to: string | null;
  tenant_id: string;
  notes: string | null;
  pinned_note: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  zip_code: string | null;
  origin: string | null;
  // New native fields
  birthday: string | null;
  gender: string | null;
  cpf: string | null;
  instagram: string | null;
  source: string | null;
  source_detail: string | null;
  score: number;
  last_contact_at: string | null;
  lifecycle_stage: string | null;
  lost_reason: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  // joined
  deals?: { id: string; title: string; value: number | null; stage: string; status: string; pipeline_stage_id: string | null }[];
  whatsapp_conversations?: { id: string; last_message_at: string | null; remote_jid: string }[];
}

export interface ContactFilters {
  search?: string;
  tags?: string[];
  city?: string;
  state?: string;
  lifecycle_stage?: string;
  source?: string;
  assigned_to?: string;
}

export function useContacts(filters?: ContactFilters) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["contacts", filters],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("contacts")
        .select(`
          *,
          deals(id, title, value, stage, status, pipeline_stage_id),
          whatsapp_conversations(id, last_message_at, remote_jid)
        `)
        .order("created_at", { ascending: false });

      if (filters?.search) {
        const s = filters.search;
        q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`);
      }
      if (filters?.state)          q = q.eq("state", filters.state);
      if (filters?.city)           q = q.eq("city", filters.city);
      if (filters?.lifecycle_stage) q = q.eq("lifecycle_stage", filters.lifecycle_stage);
      if (filters?.source)         q = q.eq("source", filters.source);
      if (filters?.assigned_to)    q = q.eq("assigned_to", filters.assigned_to);
      if (filters?.tags && filters.tags.length > 0) {
        q = q.overlaps("tags", filters.tags);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Contact[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const createContact = useMutation({
    mutationFn: async (contact: Partial<Contact> & { name: string; tenant_id: string }) => {
      const { data, error } = await supabase.from("contacts").insert(contact as never).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      // Remove joined fields before updating
      const { deals: _d, whatsapp_conversations: _w, ...cleanUpdates } = updates as Record<string, unknown>;
      void _d; void _w;
      const { error } = await supabase.from("contacts").update(cleanUpdates as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  return {
    contacts: query.data || [],
    isLoading: query.isLoading,
    createContact,
    updateContact,
    deleteContact,
  };
}

export async function getTenantId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data } = await supabase.rpc("get_user_tenant_id", { _user_id: user.id });
  return data as string;
}
