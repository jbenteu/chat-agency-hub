import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect } from "react";

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string | null;
  tenant_id: string;
  created_at: string | null;
}

const DEFAULT_STAGES = [
  { name: "Novo Lead", order: 0, color: "#3B82F6" },
  { name: "Primeiro Contato", order: 1, color: "#8B5CF6" },
  { name: "Qualificação", order: 2, color: "#F59E0B" },
  { name: "Negociação", order: 3, color: "#F97316" },
  { name: "Fechado/Ganho", order: 4, color: "#22C55E" },
  { name: "Perdido", order: 5, color: "#EF4444" },
];

async function getTenantId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data } = await supabase.rpc("get_user_tenant_id", { _user_id: user.id });
  return data as string;
}

export function usePipeline() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pipeline_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .order("order", { ascending: true });
      if (error) throw error;

      // Auto-create default stages if empty
      if (!data || data.length === 0) {
        const tenantId = await getTenantId();
        const toInsert = DEFAULT_STAGES.map((s) => ({ ...s, tenant_id: tenantId }));
        const { data: created, error: insertError } = await supabase
          .from("pipeline_stages")
          .insert(toInsert)
          .select();
        if (insertError) throw insertError;
        return (created || []) as PipelineStage[];
      }

      return data as PipelineStage[];
    },
  });

  const updateStage = useMutation({
    mutationFn: async (stage: Partial<PipelineStage> & { id: string }) => {
      const { error } = await supabase
        .from("pipeline_stages")
        .update({ name: stage.name, order: stage.order, color: stage.color })
        .eq("id", stage.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline_stages"] }),
  });

  const createStage = useMutation({
    mutationFn: async (stage: { name: string; order: number; color: string }) => {
      const tenantId = await getTenantId();
      const { error } = await supabase
        .from("pipeline_stages")
        .insert({ ...stage, tenant_id: tenantId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline_stages"] }),
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline_stages"] }),
  });

  return { stages: query.data || [], isLoading: query.isLoading, updateStage, createStage, deleteStage };
}
