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
  city: string | null;
  state: string | null;
  address: string | null;
  origin: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  // joined
  deals?: { id: string; title: string; value: number | null; stage: string; status: string }[];
  whatsapp_conversations?: { id: string; last_message_at: string | null; remote_jid: string }[];
}

export function useContacts(filters?: {
  search?: string;
  tags?: string[];
  city?: string;
  state?: string;
}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["contacts", filters],
    queryFn: async () => {
      let q = supabase
        .from("contacts")
        .select(`
          *,
          deals(id, title, value, stage, status),
          whatsapp_conversations(id, last_message_at, remote_jid)
        `)
        .order("created_at", { ascending: false });

      if (filters?.search) {
        q = q.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
      }
      if (filters?.state) q = q.eq("state", filters.state);
      if (filters?.city) q = q.eq("city", filters.city);
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
      const { error } = await supabase.from("contacts").update(updates as never).eq("id", id);
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
