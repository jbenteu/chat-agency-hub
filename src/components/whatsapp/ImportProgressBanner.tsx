import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportProgress {
  id: string;
  total: number;
  imported: number;
  status: string;
  error_message: string | null;
  started_at?: string;
}

export function ImportProgressBanner() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [visible, setVisible] = useState(false);
  // Track which import IDs the user has dismissed so we never re-show them
  const dismissedIds = useRef<Set<string>>(new Set());
  // Track the started_at of the import currently shown — only show a new one if it's genuinely newer
  const shownStartedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // On mount: only show if there is an actively RUNNING import
    const fetchRunning = async () => {
      const { data } = await supabase
        .from("import_progress")
        .select("*")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data && !dismissedIds.current.has(data.id)) {
        setProgress(data as ImportProgress);
        setVisible(true);
        shownStartedAt.current = data.started_at ?? null;
      }
    };

    fetchRunning();

    const ch = supabase
      .channel("import-progress-banner")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "import_progress" },
        (payload) => {
          const row = payload.new as ImportProgress;
          if (!row?.id) return;

          // If this ID was dismissed by the user, never re-show it
          if (dismissedIds.current.has(row.id)) return;

          // If a brand-new import started (different started_at), always show it
          const isNewImport = row.started_at && row.started_at !== shownStartedAt.current;

          if (row.status === "running" || isNewImport) {
            shownStartedAt.current = row.started_at ?? null;
            setProgress(row);
            setVisible(true);
          } else if (visible) {
            // Update progress/status for the import already being shown
            setProgress(row);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  const handleDismiss = () => {
    if (progress?.id) dismissedIds.current.add(progress.id);
    setVisible(false);
  };

  const handleReload = () => {
    window.location.reload();
  };

  if (!visible || !progress) return null;

  const pct = progress.total > 0 ? Math.round((progress.imported / progress.total) * 100) : 0;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)]",
        "rounded-xl border bg-card shadow-xl p-4",
        "transition-all duration-300",
        "animate-in slide-in-from-bottom-4 fade-in"
      )}
    >
      {progress.status !== "running" && (
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {progress.status === "running" && (
        <div className="space-y-3 pr-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <span className="text-sm font-medium">Importando Contatos…</span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress.imported.toLocaleString("pt-BR")} de {progress.total.toLocaleString("pt-BR")} contatos importados
            {progress.total > 0 && <span className="ml-1 font-medium text-foreground">({pct}%)</span>}
          </p>
        </div>
      )}

      {progress.status === "done" && (
        <div className="space-y-3 pr-6">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">Importação concluída!</p>
              <p className="text-xs text-muted-foreground">
                {progress.imported > 0
                  ? `${progress.imported.toLocaleString("pt-BR")} contatos importados`
                  : "Nenhum contato novo encontrado"}
              </p>
            </div>
          </div>
          {progress.imported > 0 && (
            <Button size="sm" onClick={handleReload} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Recarregar para ver nomes atualizados
            </Button>
          )}
        </div>
      )}

      {progress.status === "error" && (
        <div className="space-y-2.5 pr-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive">Erro na importação</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.error_message || "Erro desconhecido ao importar contatos"}
          </p>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Fechar
          </Button>
        </div>
      )}
    </div>
  );
}
