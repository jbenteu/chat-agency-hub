import React, { useMemo, useState, useCallback } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { usePipeline, type PipelineStage } from "@/hooks/use-pipeline";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { useContacts } from "@/hooks/use-contacts";
import { KanbanColumn } from "./KanbanColumn";
import { CRMContactDrawer } from "./CRMContactDrawer";
import { CRMHeader } from "./CRMHeader";
import { LostReasonModal } from "./LostReasonModal";
import { NewDealDialog } from "./NewDealDialog";
import { CRMSettingsDialog } from "./CRMSettingsDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelineViews } from "@/hooks/use-pipeline-views";
import { toast } from "sonner";

export function KanbanBoard() {
  const { stages, isLoading: stagesLoading } = usePipeline();
  const { deals, isLoading: dealsLoading, moveDeal, updateDeal } = useDeals();
  const { contacts } = useContacts();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stage: PipelineStage; prevStage: string } | null>(null);

  const { views, activeViewId, createView, deleteView, changeView, hiddenStageIds, toggleStage } = usePipelineViews();
  const { updateStage } = usePipeline();

  const handleRenameStage = useCallback((stageId: string, newName: string) => {
    updateStage.mutate({ id: stageId, name: newName });
    toast.success(`Estágio renomeado para "${newName}"`);
  }, [updateStage]);

  const visibleStages = useMemo(() => {
    return stages.filter((s) => !hiddenStageIds.includes(s.id));
  }, [stages, hiddenStageIds]);

  const filteredDeals = useMemo(() => {
    // Deduplicate deals by ID as a safety net against any upstream duplicates
    const uniqueDeals: Deal[] = [];
    const seenIds = new Set<string>();
    for (const deal of deals) {
      if (!seenIds.has(deal.id)) {
        seenIds.add(deal.id);
        uniqueDeals.push(deal);
      }
    }

    let result = uniqueDeals;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(s) ||
          (d.contact?.name || "").toLowerCase().includes(s) ||
          (d.contact?.phone || "").includes(s)
      );
    }
    if (priorityFilter) result = result.filter((d) => d.priority === priorityFilter);
    if (statusFilter)   result = result.filter((d) => d.status === statusFilter);
    return result;
  }, [deals, search, priorityFilter, statusFilter]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const stage of visibleStages) map[stage.id] = [];
    const placedDealIds = new Set<string>();
    for (const deal of filteredDeals) {
      // Skip deals already placed (prevents any duplicate by deal ID)
      if (placedDealIds.has(deal.id)) continue;
      placedDealIds.add(deal.id);

      // Match stage by pipeline_stage_id first, then by name as fallback
      const matchedStage =
        visibleStages.find((s) => s.id === deal.pipeline_stage_id) ||
        visibleStages.find((s) => s.name === deal.stage);
      if (matchedStage) {
        map[matchedStage.id].push(deal);
      }
      // Deals without a matching visible stage are intentionally excluded
      // to avoid cluttering the first column with orphaned deals
    }
    return map;
  }, [filteredDeals, visibleStages]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const targetStage = stages.find((s) => s.id === destination.droppableId);
    if (!targetStage) return;
    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    if (targetStage.is_closed && !targetStage.is_won) {
      setPendingMove({ dealId: draggableId, stage: targetStage, prevStage: deal.stage });
      return;
    }

    moveDeal.mutate({
      id: draggableId,
      stage: targetStage.name,
      pipeline_stage_id: targetStage.id,
      previousStage: deal.stage,
    });
  };

  const handleLostConfirm = (reason: string) => {
    if (!pendingMove) return;
    moveDeal.mutate({
      id: pendingMove.dealId,
      stage: pendingMove.stage.name,
      pipeline_stage_id: pendingMove.stage.id,
      previousStage: pendingMove.prevStage,
    });
    updateDeal.mutate({ id: pendingMove.dealId, loss_reason: reason } as never);
    setPendingMove(null);
  };

  if (stagesLoading || dealsLoading) {
    return (
      <div className="flex gap-1 p-2 flex-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex-1 min-w-[180px]">
            <Skeleton className="h-8 w-full mb-1 rounded" />
            <Skeleton className="h-16 w-full mb-1 rounded" />
            <Skeleton className="h-16 w-full rounded" />
          </div>
        ))}
      </div>
    );
  }

  const selectedContact = selectedDeal?.contact_id
    ? contacts.find((c) => c.id === selectedDeal.contact_id) || null
    : null;

  return (
    <>
      <CRMHeader
        deals={deals}
        search={search}
        onSearchChange={setSearch}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onNewDeal={() => setShowNewDeal(true)}
        stages={stages}
        views={views}
        activeViewId={activeViewId}
        onViewChange={changeView}
        onCreateView={createView}
        onDeleteView={deleteView}
        hiddenStageIds={hiddenStageIds}
        onToggleStage={toggleStage}
        onOpenSettings={() => setShowSettings(true)}
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-0 flex-1 min-h-0 overflow-x-auto divide-x divide-border">
          {visibleStages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] || []}
              onDealClick={setSelectedDeal}
              onRenameStage={handleRenameStage}
              onHideStage={toggleStage}
            />
          ))}
        </div>
      </DragDropContext>

      {selectedContact && selectedDeal && (
        <CRMContactDrawer
          contact={selectedContact}
          open={!!selectedDeal}
          onOpenChange={(open) => !open && setSelectedDeal(null)}
          initialDeal={selectedDeal}
        />
      )}

      {selectedDeal && !selectedContact && (
        <CRMContactDrawer
          contact={{
            id: selectedDeal.contact_id || "",
            name: selectedDeal.contact?.name || selectedDeal.title,
            phone: selectedDeal.contact?.phone || null,
            email: selectedDeal.contact?.email || null,
            company: selectedDeal.contact?.company || null,
            tags: selectedDeal.contact?.tags || null,
            custom_fields: null,
            assigned_to: selectedDeal.assigned_to || null,
            tenant_id: selectedDeal.tenant_id,
            notes: null,
            pinned_note: null,
            city: selectedDeal.contact?.city || null,
            state: selectedDeal.contact?.state || null,
            address: null,
            zip_code: null,
            origin: selectedDeal.contact?.origin || null,
            birthday: null,
            gender: null,
            cpf: null,
            instagram: null,
            source: selectedDeal.contact?.origin || null,
            source_detail: null,
            score: 0,
            last_contact_at: null,
            lifecycle_stage: "lead",
            lost_reason: null,
            avatar_url: null,
            created_at: null,
            updated_at: null,
            created_by: null,
          }}
          open={!!selectedDeal}
          onOpenChange={(open) => !open && setSelectedDeal(null)}
          initialDeal={selectedDeal}
        />
      )}

      <LostReasonModal
        open={!!pendingMove}
        onOpenChange={(open) => !open && setPendingMove(null)}
        onConfirm={handleLostConfirm}
        loading={moveDeal.isPending}
        stageName={pendingMove?.stage.name}
      />

      <NewDealDialog open={showNewDeal} onOpenChange={setShowNewDeal} stages={stages} />
      <CRMSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
