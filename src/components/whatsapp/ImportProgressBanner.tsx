import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportProgress {
  id: string;
  total: number;
  imported: number;
  status: string;
  error_message: string | null;
}

export function ImportProgressBanner() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Initial fetch
    const fetchProgress = async () => {
      const { data } = await supabase
        .from("import_progress")
        .select("*")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setProgress(data as ImportProgress);
        setVisible(true);
      }
    };

    fetchProgress();

    // Realtime subscription
    const ch = supabase
      .channel("import-progress-banner")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "import_progress" },
        (payload) => {
          const row = payload.new as ImportProgress;
          if (!row?.id) return;
          setProgress(row);
          setVisible(true);
          setFadingOut(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Auto-dismiss on done
  useEffect(() => {
    if (progress?.status === "done" && visible) {
      const timer = setTimeout(() => {
        setFadingOut(true);
        setTimeout(() => setVisible(false), 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [progress?.status, visible]);

  if (!visible || !progress) return null;

  const pct = progress.total > 0 ? Math.round((progress.imported / progress.total) * 100) : 0;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)]",
        "rounded-xl border bg-card shadow-lg p-4",
        "transition-all duration-300",
        fadingOut && "opacity-0 translate-y-2"
      )}
    >
      {/* Close button */}
      <button
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {progress.status === "running" && (
        <div className="space-y-2.5 pr-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Importando contatos…</span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress.imported} de {progress.total} contatos importados
          </p>
        </div>
      )}

      {progress.status === "done" && (
        <div className="flex items-center gap-2.5 pr-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">Importação concluída!</p>
            <p className="text-xs text-muted-foreground">
              {progress.imported} contatos importados com sucesso
            </p>
          </div>
        </div>
      )}

      {progress.status === "error" && (
        <div className="space-y-2 pr-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive">Erro na importação</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.error_message || "Erro desconhecido"}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Retry by resetting status — webhook will re-trigger on next connection
              setVisible(false);
            }}
          >
            Fechar
          </Button>
        </div>
      )}
    </div>
  );
}
