import React, { useMemo, useState } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { usePipeline } from "@/hooks/use-pipeline";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { KanbanColumn } from "./KanbanColumn";
import { DealDetailSheet } from "./DealDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, X } from "lucide-react";
import { NewDealDialog } from "./NewDealDialog";

export function KanbanBoard() {
  const { stages, isLoading: stagesLoading } = usePipeline();
  const { deals, isLoading: dealsLoading, moveDeal } = useDeals();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(s) ||
          (d.contact?.name || "").toLowerCase().includes(s) ||
          (d.contact?.phone || "").includes(s)
      );
    }
    if (priorityFilter) {
      result = result.filter((d) => d.priority === priorityFilter);
    }
    if (statusFilter) {
      result = result.filter((d) => d.status === statusFilter);
    }
    return result;
  }, [deals, search, priorityFilter, statusFilter]);

  const hasFilters = !!(search || priorityFilter || statusFilter);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const stage of stages) {
      map[stage.id] = [];
    }
    for (const deal of filteredDeals) {
      // Match by stage name (primary) or pipeline_stage_id (fallback)
      const matchedStage = stages.find(
        (s) => s.name === deal.stage
      ) || stages.find(
        (s) => s.id === deal.pipeline_stage_id
      );
      if (matchedStage && map[matchedStage.id]) {
        map[matchedStage.id].push(deal);
      } else if (stages.length > 0 && map[stages[0].id]) {
        map[stages[0].id].push(deal);
      }
    }
    return map;
  }, [filteredDeals, stages]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const targetStage = stages.find((s) => s.id === destination.droppableId);
    if (!targetStage) return;

    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    moveDeal.mutate({
      id: draggableId,
      stage: targetStage.name,
      pipeline_stage_id: targetStage.id,
      previousStage: deal.stage,
    });
  };

  if (stagesLoading || dealsLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="min-w-[280px]">
            <Skeleton className="h-10 w-full mb-3" />
            <Skeleton className="h-32 w-full mb-2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const openDeals = deals.filter((d) => d.status === "open");
  const totalDeals = openDeals.length;
  const totalValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonValue = deals
    .filter((d) => d.status === "won" && d.closed_at && new Date(d.closed_at) >= startOfMonth)
    .reduce((s, d) => s + (d.value || 0), 0);

  const clearFilters = () => {
    setSearch("");
    setPriorityFilter("");
    setStatusFilter("");
  };

  return (
    <>
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Em aberto:</span>
          <span className="font-semibold">{totalDeals} leads</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Pipeline:</span>
          <span className="font-semibold tabular-nums">
            {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Ganhos (mês):</span>
          <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">
            {wonValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
        <div className="flex-1" />
        <Button onClick={() => setShowNewDeal(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Negociação
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[110px] h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Aberto</SelectItem>
            <SelectItem value="won">Ganho</SelectItem>
            <SelectItem value="lost">Perdido</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <>
            <span className="text-xs text-muted-foreground">({filteredDeals.length} resultados)</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          </>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-340px)]">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] || []}
              onDealClick={setSelectedDeal}
            />
          ))}
        </div>
      </DragDropContext>

      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDeal}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
      />

      <NewDealDialog open={showNewDeal} onOpenChange={setShowNewDeal} />
    </>
  );
}
