import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomFieldDefinition {
  id: string;
  tenant_id: string;
  entity_type: string;
  field_key: string;
  field_label: string;
  field_type: "text" | "number" | "date" | "select" | "multi_select" | "boolean" | "phone" | "email" | "url" | "currency";
  field_options: string[];
  is_required: boolean;
  is_visible_kanban: boolean;
  is_visible_list: boolean;
  order: number;
  placeholder: string | null;
  default_value: string | null;
  created_at: string | null;
}

export function useCustomFieldDefinitions(entityType: "contact" | "deal" = "contact") {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["custom_field_definitions", entityType],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("custom_field_definitions")
        .select("*")
        .eq("entity_type", entityType)
        .order("order", { ascending: true });
      if (error) throw error;
      return (data || []) as CustomFieldDefinition[];
    },
  });

  const createField = useMutation({
    mutationFn: async (field: Omit<CustomFieldDefinition, "id" | "tenant_id" | "created_at">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: tenantId } = await supabase.rpc("get_user_tenant_id", { _user_id: user.id });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("custom_field_definitions")
        .insert({ ...field, tenant_id: tenantId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom_field_definitions"] }),
  });

  const updateField = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomFieldDefinition> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("custom_field_definitions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom_field_definitions"] }),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("custom_field_definitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom_field_definitions"] }),
  });

  const reorderFields = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("custom_field_definitions")
            .update({ order: idx })
            .eq("id", id)
        )
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom_field_definitions"] }),
  });

  return {
    fields: query.data || [],
    isLoading: query.isLoading,
    createField,
    updateField,
    deleteField,
    reorderFields,
  };
}
