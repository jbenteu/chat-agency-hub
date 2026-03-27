import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Filter, Plus, X, TrendingUp, DollarSign, CheckCircle2, Users } from "lucide-react";
import type { Deal } from "@/hooks/use-deals";

interface CRMHeaderProps {
  deals: Deal[];
  search: string;
  onSearchChange: (v: string) => void;
  priorityFilter: string;
  onPriorityChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  onNewDeal: () => void;
}

function KPICard({ icon, label, value, variant }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: "green" | "default";
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${
      variant === "green"
        ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900"
        : "bg-muted/50 border-border"
    }`}>
      <span className={variant === "green" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
        {icon}
      </span>
      <div className="leading-tight">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className={`font-semibold text-sm tabular-nums ${variant === "green" ? "text-green-700 dark:text-green-400" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function CRMHeader({
  deals,
  search,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  statusFilter,
  onStatusChange,
  onNewDeal,
}: CRMHeaderProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const openDeals = deals.filter((d) => d.status === "open");
  const totalValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonThisMonth = deals.filter(
    (d) => d.status === "won" && d.closed_at && new Date(d.closed_at) >= startOfMonth
  );
  const wonValue = wonThisMonth.reduce((s, d) => s + (d.value || 0), 0);

  const closedDeals = deals.filter((d) => d.status === "won" || d.status === "lost");
  const conversionRate =
    closedDeals.length > 0
      ? Math.round((wonThisMonth.length / closedDeals.length) * 100)
      : 0;

  const activeFilters = [
    priorityFilter && { label: `Prioridade: ${priorityFilter}`, key: "priority" },
    statusFilter && { label: `Status: ${statusFilter}`, key: "status" },
  ].filter(Boolean) as { label: string; key: string }[];

  const clearAll = () => {
    onSearchChange("");
    onPriorityChange("");
    onStatusChange("");
  };

  return (
    <div className="space-y-2 pb-2">
      {/* KPI Row */}
      <div className="flex flex-wrap gap-2">
        <KPICard
          icon={<Users className="h-4 w-4" />}
          label="Em aberto"
          value={`${openDeals.length} leads`}
        />
        <KPICard
          icon={<DollarSign className="h-4 w-4" />}
          label="Pipeline"
          value={totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        />
        <KPICard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Ganhos (mês)"
          value={wonValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          variant="green"
        />
        <KPICard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Taxa de conversão"
          value={`${conversionRate}%`}
        />
      </div>

      {/* Search + Filters + New */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar lead, contato, telefone..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {activeFilters.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {activeFilters.length}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2">
            <div className="flex flex-wrap gap-2 bg-muted/30 p-3 rounded-lg border border-border">
              <Select value={priorityFilter || "all"} onValueChange={(v) => onPriorityChange(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[130px] h-8 text-sm">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter || "all"} onValueChange={(v) => onStatusChange(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[120px] h-8 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Aberto</SelectItem>
                  <SelectItem value="won">Ganho</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>

              {activeFilters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-xs text-muted-foreground">
                  <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Active filter chips */}
        {activeFilters.map((f) => (
          <Badge key={f.key} variant="secondary" className="h-7 gap-1 px-2 text-xs">
            {f.label}
            <button
              onClick={() => f.key === "priority" ? onPriorityChange("") : onStatusChange("")}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        <div className="flex-1" />
        <Button onClick={onNewDeal} size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Novo Lead
        </Button>
      </div>
    </div>
  );
}
