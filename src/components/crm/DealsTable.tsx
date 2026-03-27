import React, { useState, useMemo } from "react";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DealDetailSheet } from "./DealDetailSheet";
import { CRMFilters, type FilterRule } from "./CRMFilters";
import {
  Search, Inbox, ChevronLeft, ChevronRight, ArrowUpDown,
  Package, X, ChevronDown, ChevronRight as ChevronRightIcon,
  Plus, Calendar, AlertTriangle,
} from "lucide-react";
import { NewDealDialog } from "./NewDealDialog";

type SortKey = "contact" | "value" | "created_at" | "priority";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgente: { label: "Urgente", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900" },
  alta:    { label: "Alta",    className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200 dark:border-orange-900" },
  media:   { label: "Média",   className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900" },
  baixa:   { label: "Baixa",   className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200 dark:border-blue-900" },
};
const STATUS_LABELS: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

function applyAdvancedFilters(deals: Deal[], filters: FilterRule[]): Deal[] {
  return deals.filter((d) =>
    filters.every((f) => {
      let val = "";
      switch (f.field) {
        case "contact_name": val = d.contact?.name || d.title; break;
        case "phone": val = d.contact?.phone || ""; break;
        case "email": val = d.contact?.email || ""; break;
        case "company": val = d.contact?.company || ""; break;
        case "stage": val = d.stage; break;
        case "status": val = d.status; break;
        case "value": val = String(d.value || 0); break;
        case "origin": val = d.contact?.origin || ""; break;
        case "city": val = d.contact?.city || ""; break;
        case "state": val = d.contact?.state || ""; break;
        case "tags": val = (d.contact?.tags || []).join(", "); break;
        default: val = "";
      }
      const lower = val.toLowerCase();
      const fv = f.value.toLowerCase();
      switch (f.operator) {
        case "contains": return lower.includes(fv);
        case "equals": return lower === fv;
        case "not_equals": return lower !== fv;
        case "gt": return parseFloat(val) > parseFloat(f.value);
        case "lt": return parseFloat(val) < parseFloat(f.value);
        default: return true;
      }
    })
  );
}

export function DealsTable() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const PAGE_SIZE = 30;

  const { deals, isLoading } = useDeals();
  const { stages } = usePipeline();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortDeals = (list: Deal[]) =>
    [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "contact": cmp = (a.contact?.name || a.title).localeCompare(b.contact?.name || b.title); break;
        case "value": cmp = (a.value || 0) - (b.value || 0); break;
        case "created_at": cmp = (a.created_at || "").localeCompare(b.created_at || ""); break;
        case "priority": cmp = (PRIORITY_ORDER[a.priority || "media"] ?? 2) - (PRIORITY_ORDER[b.priority || "media"] ?? 2); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(s) ||
          (d.contact?.name || "").toLowerCase().includes(s) ||
          (d.contact?.phone || "").includes(s) ||
          (d.contact?.email || "").toLowerCase().includes(s)
      );
    }
    if (statusFilter) result = result.filter((d) => d.status === statusFilter);
    if (priorityFilter) result = result.filter((d) => d.priority === priorityFilter);
    if (advancedFilters.length > 0) result = applyAdvancedFilters(result, advancedFilters);
    return result;
  }, [deals, search, statusFilter, priorityFilter, advancedFilters]);

  const hasFilters = !!(search || statusFilter || priorityFilter || advancedFilters.length);

  // Group by stage
  const groupedByStage = useMemo(() => {
    const groups: { stage: typeof stages[0]; deals: Deal[] }[] = [];
    for (const stage of stages) {
      const stageDeals = filteredDeals.filter((d) => d.stage === stage.name);
      if (stageDeals.length > 0) {
        groups.push({ stage, deals: sortDeals(stageDeals) });
      }
    }
    // Orphan deals not matching any stage
    const knownNames = new Set(stages.map((s) => s.name));
    const orphans = filteredDeals.filter((d) => !knownNames.has(d.stage));
    if (orphans.length > 0) {
      groups.push({
        stage: { id: "__other", name: "Outros", order: 999, color: "#71717a", tenant_id: "", created_at: null },
        deals: sortDeals(orphans),
      });
    }
    return groups;
  }, [filteredDeals, stages, sortKey, sortDir]);

  // Pagination across all groups flattened
  const allSorted = useMemo(() => groupedByStage.flatMap((g) => g.deals), [groupedByStage]);
  const totalPages = Math.max(1, Math.ceil(allSorted.length / PAGE_SIZE));

  const toggleStageCollapse = (stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch(""); setStatusFilter(""); setPriorityFilter(""); setAdvancedFilters([]); setPage(1);
  };

  const SortHeader = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => toggleSort(sortKeyVal)}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyVal ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );

  // Summary metrics
  const openDeals = filteredDeals.filter((d) => d.status === "open");
  const totalValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);
  const overdueCount = openDeals.filter((d) => d.expected_close_date && new Date(d.expected_close_date) < new Date()).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Total:</span>
          <span className="font-semibold">{filteredDeals.length} deals</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Pipeline:</span>
          <span className="font-semibold tabular-nums">
            {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-1.5 text-sm">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="font-medium text-red-700 dark:text-red-400">{overdueCount} atrasados</span>
          </div>
        )}
        <div className="flex-1" />
        <Button onClick={() => setShowNewDeal(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Negociação
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[120px] h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Aberto</SelectItem>
            <SelectItem value="won">Ganho</SelectItem>
            <SelectItem value="lost">Perdido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[120px] h-9 text-sm">
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
        <CRMFilters filters={advancedFilters} onChange={(f) => { setAdvancedFilters(f); setPage(1); }} />
        {hasFilters && (
          <>
            <span className="text-xs text-muted-foreground">({filteredDeals.length} resultados)</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          </>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum deal encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByStage.map(({ stage, deals: stageDeals }) => {
            const isCollapsed = collapsedStages.has(stage.id);
            const stageValue = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
            return (
              <Collapsible key={stage.id} open={!isCollapsed} onOpenChange={() => toggleStageCollapse(stage.id)}>
                <CollapsibleTrigger asChild>
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-muted/50"
                    style={{ borderLeft: `3px solid ${stage.color || "#6366f1"}` }}
                  >
                    {isCollapsed ? (
                      <ChevronRightIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold" style={{ color: stage.color || undefined }}>
                      {stage.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                      {stageDeals.length}
                    </Badge>
                    {stageValue > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                        {stageValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border overflow-x-auto mt-1 ml-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]"><SortHeader label="Contato" sortKeyVal="contact" /></TableHead>
                          <TableHead className="w-[90px]">Status</TableHead>
                          <TableHead className="w-[90px]"><SortHeader label="Prioridade" sortKeyVal="priority" /></TableHead>
                          <TableHead className="w-[120px]"><SortHeader label="Valor" sortKeyVal="value" /></TableHead>
                          <TableHead className="w-[80px] hidden md:table-cell">Produtos</TableHead>
                          <TableHead className="w-[110px] hidden md:table-cell">Previsão</TableHead>
                          <TableHead className="w-[100px] hidden lg:table-cell"><SortHeader label="Criado em" sortKeyVal="created_at" /></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stageDeals.map((deal) => {
                          const itemsCount = deal.deal_items?.length || 0;
                          const priorityCfg = PRIORITY_CONFIG[deal.priority || "media"];
                          const isOverdue = deal.expected_close_date && new Date(deal.expected_close_date) < new Date() && deal.status === "open";
                          return (
                            <TableRow
                              key={deal.id}
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => setSelectedDeal(deal)}
                            >
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm truncate max-w-[180px]">
                                    {deal.contact?.name || deal.title}
                                  </span>
                                  {deal.contact?.phone && (
                                    <span className="text-[11px] text-muted-foreground">{deal.contact.phone}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    deal.status === "won"
                                      ? "border-green-300 text-green-700 dark:text-green-400"
                                      : deal.status === "lost"
                                      ? "border-red-300 text-red-700 dark:text-red-400"
                                      : ""
                                  }`}
                                >
                                  {STATUS_LABELS[deal.status] || deal.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {priorityCfg && (
                                  <Badge variant="outline" className={`text-[10px] border ${priorityCfg.className}`}>
                                    {priorityCfg.label}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className={`text-sm tabular-nums ${(deal.value || 0) > 0 ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                                {(deal.value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                {itemsCount > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <Package className="h-3 w-3" /> {itemsCount}
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">
                                {deal.expected_close_date ? (
                                  <span className={`flex items-center gap-1 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                                    {isOverdue && <AlertTriangle className="h-3 w-3" />}
                                    <Calendar className="h-3 w-3" />
                                    {new Date(deal.expected_close_date).toLocaleDateString("pt-BR")}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                {deal.created_at ? new Date(deal.created_at).toLocaleDateString("pt-BR") : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            {allSorted.length} deals em {groupedByStage.length} estágios
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <DealDetailSheet deal={selectedDeal} open={!!selectedDeal} onOpenChange={(o) => !o && setSelectedDeal(null)} />
      <NewDealDialog open={showNewDeal} onOpenChange={setShowNewDeal} />
    </div>
  );
}
