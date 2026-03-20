import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Task {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useTasks(opts?: { deal_id?: string; contact_id?: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", opts],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });

      if (opts?.deal_id) q = q.eq("deal_id", opts.deal_id);
      if (opts?.contact_id) q = q.eq("contact_id", opts.contact_id);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const createTask = useMutation({
    mutationFn: async (task: Omit<Task, "id" | "created_at" | "updated_at" | "completed_at">) => {
      const { error } = await supabase.from("tasks").insert(task);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const { error } = await supabase.from("tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return { tasks: query.data || [], isLoading: query.isLoading, createTask, updateTask, deleteTask };
}
