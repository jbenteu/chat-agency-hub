import React, { useState, useMemo } from "react";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, ArrowUpDown, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CRMContactDrawer } from "./CRMContactDrawer";
import { NewDealDialog } from "./NewDealDialog";
import { CRMScoreBadge } from "./CRMScoreBadge";
import { useContacts } from "@/hooks/use-contacts";

type SortKey = "contact" | "value" | "created_at" | "stage";
type SortDir = "asc" | "desc";

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

export function DealsTable() {
  const { deals, isLoading, deleteDeal } = useDeals();
  const { stages } = usePipeline();
  const { contacts } = useContacts();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);

  const toggleSort = (key: SortKey) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  const filtered = useMemo(() => {
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
    result = [...result].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "contact": return dir * (a.contact?.name || a.title).localeCompare(b.contact?.name || b.title, "pt-BR");
        case "value":   return dir * ((a.value || 0) - (b.value || 0));
        case "stage":   return dir * (a.stage || "").localeCompare(b.stage || "", "pt-BR");
        default:        return dir * (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      }
    });
    return result;
  }, [deals, search, sort]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((d) => d.id)));
  };

  const handleBulkDelete = () => {
    if (!confirm(`Excluir ${selected.size} negociação(ões)?`)) return;
    selected.forEach((id) => deleteDeal.mutate(id));
    setSelected(new Set());
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      onClick={() => toggleSort(sortKey)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sort.key === sortKey ? "text-foreground" : ""}`} />
    </button>
  );

  const selectedContact = selectedDeal?.contact
    ? contacts.find((c) => c.id === selectedDeal.contact?.id) || null
    : null;

  if (isLoading) return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  );

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar negociação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex-1" />
        {selected.size > 0 && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{selected.size} selecionados</span>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="h-7 text-xs">
              Excluir
            </Button>
          </div>
        )}
        <Button onClick={() => setShowNewDeal(true)} size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova Negociação
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhuma negociação encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou crie uma nova negociação</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="h-10 bg-muted/30">
                <TableHead className="w-10 pl-3">
                  <Checkbox
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead><SortHeader label="Contato" sortKey="contact" /></TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead><SortHeader label="Estágio" sortKey="stage" /></TableHead>
                <TableHead><SortHeader label="Valor" sortKey="value" /></TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead><SortHeader label="Criado" sortKey="created_at" /></TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((deal) => {
                const stage = stages.find((s) => s.id === deal.pipeline_stage_id || s.name === deal.stage);
                const name = deal.contact?.name || deal.title || "Sem nome";
                const color = getAvatarColor(name);
                const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                const tags = deal.contact?.tags || [];
                const score = (deal.contact as unknown as { score?: number })?.score ?? 0;

                return (
                  <TableRow
                    key={deal.id}
                    className="h-12 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedDeal(deal)}
                  >
                    <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(deal.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected);
                          checked ? next.add(deal.id) : next.delete(deal.id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 flex-shrink-0">
                          <AvatarFallback className="text-[9px] font-semibold text-white" style={{ backgroundColor: color }}>
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[140px]">{name}</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{deal.title}</p>
                        </div>
                        <CRMScoreBadge score={score} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {deal.contact?.phone || "—"}
                    </TableCell>
                    <TableCell>
                      {stage ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-5 font-normal"
                          style={{ backgroundColor: `${stage.color}20`, color: stage.color || undefined }}
                        >
                          {stage.name}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold tabular-nums">
                      {deal.value != null && deal.value > 0
                        ? deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1">
                        {tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0 h-4 font-normal">{tag}</Badge>
                        ))}
                        {tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{tags.length - 2}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {deal.created_at
                        ? formatDistanceToNow(new Date(deal.created_at), { locale: ptBR, addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedContact && selectedDeal && (
        <CRMContactDrawer
          contact={selectedContact}
          open={!!selectedDeal}
          onOpenChange={(open) => !open && setSelectedDeal(null)}
          initialDeal={selectedDeal}
        />
      )}

      <NewDealDialog open={showNewDeal} onOpenChange={setShowNewDeal} />
    </>
  );
}
