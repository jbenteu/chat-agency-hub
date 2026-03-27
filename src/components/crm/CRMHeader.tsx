import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Filter, Plus, X, CheckCircle2, Users, ChevronDown, Settings2 } from "lucide-react";
import type { Deal } from "@/hooks/use-deals";
import type { PipelineStage } from "@/hooks/use-pipeline";

export interface PipelineView {
  id: string;
  name: string;
  stageIds: string[]; // which stages to show - empty = all
}

interface CRMHeaderProps {
  deals: Deal[];
  search: string;
  onSearchChange: (v: string) => void;
  priorityFilter: string;
  onPriorityChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  onNewDeal: () => void;
  stages: PipelineStage[];
  views: PipelineView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onCreateView: (name: string) => void;
  onDeleteView: (viewId: string) => void;
  hiddenStageIds: string[];
  onToggleStage: (stageId: string) => void;
  onOpenSettings?: () => void;
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
  stages,
  views,
  activeViewId,
  onViewChange,
  onCreateView,
  onDeleteView,
  hiddenStageIds,
  onToggleStage,
  onOpenSettings,
}: CRMHeaderProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [showNewView, setShowNewView] = useState(false);

  const openDeals = deals.filter((d) => d.status === "open");
  const totalValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonThisMonth = deals.filter(
    (d) => d.status === "won" && d.closed_at && new Date(d.closed_at) >= startOfMonth
  );
  const wonValue = wonThisMonth.reduce((s, d) => s + (d.value || 0), 0);

  const activeView = views.find((v) => v.id === activeViewId);

  const activeFilters = [
    priorityFilter && { label: priorityFilter, key: "priority" },
    statusFilter && { label: statusFilter, key: "status" },
  ].filter(Boolean) as { label: string; key: string }[];

  return (
    <div className="space-y-0">
      {/* Top bar: pipeline selector + KPIs + search + actions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border">
        {/* Pipeline view selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-sm font-semibold px-2">
              {activeView?.name || "Todas as etapas"}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {views.map((v) => (
              <DropdownMenuItem
                key={v.id}
                onClick={() => onViewChange(v.id)}
                className={v.id === activeViewId ? "bg-accent" : ""}
              >
                <span className="flex-1">{v.name}</span>
                {v.id !== "all" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteView(v.id); }}
                    className="text-muted-foreground hover:text-destructive ml-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {showNewView ? (
              <div className="flex items-center gap-1 p-1">
                <Input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Nome da visualização"
                  className="h-7 text-xs flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newViewName.trim()) {
                      onCreateView(newViewName.trim());
                      setNewViewName("");
                      setShowNewView(false);
                    }
                    if (e.key === "Escape") setShowNewView(false);
                  }}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={!newViewName.trim()}
                  onClick={() => {
                    if (newViewName.trim()) {
                      onCreateView(newViewName.trim());
                      setNewViewName("");
                      setShowNewView(false);
                    }
                  }}
                >
                  OK
                </Button>
              </div>
            ) : (
              <DropdownMenuItem onClick={() => setShowNewView(true)}>
                <Plus className="h-3.5 w-3.5 mr-2" /> Nova visualização
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground tabular-nums">
          {deals.length} leads: {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>

        <div className="flex-1" />

        {/* KPI chips */}
        <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {openDeals.length} abertos
          </span>
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {wonValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ganhos
          </span>
        </div>

        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Busca e filtro"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filters */}
        <Button
          variant={showFilters || activeFilters.length > 0 ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs px-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-3 w-3" />
          {activeFilters.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-primary text-primary-foreground">
              {activeFilters.length}
            </Badge>
          )}
        </Button>

        {/* Settings */}
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs px-2" onClick={onOpenSettings}>
          <Settings2 className="h-3 w-3" />
        </Button>

        <Button onClick={onNewDeal} size="sm" className="h-7 gap-1 text-xs px-3">
          <Plus className="h-3 w-3" /> NOVO LEAD
        </Button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border">
          <Select value={priorityFilter || "all"} onValueChange={(v) => onPriorityChange(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[110px] h-7 text-xs">
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
            <SelectTrigger className="w-[100px] h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="won">Ganho</SelectItem>
              <SelectItem value="lost">Perdido</SelectItem>
            </SelectContent>
          </Select>

          {activeFilters.map((f) => (
            <Badge key={f.key} variant="secondary" className="h-6 gap-1 px-2 text-[10px]">
              {f.label}
              <button onClick={() => f.key === "priority" ? onPriorityChange("") : onStatusChange("")}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}

          {activeFilters.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onPriorityChange(""); onStatusChange(""); }}
              className="h-6 text-[10px] text-muted-foreground px-2"
            >
              Limpar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
