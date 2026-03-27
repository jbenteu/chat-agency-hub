import React, { useMemo, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { usePipeline, type PipelineStage } from "@/hooks/use-pipeline";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { useContacts } from "@/hooks/use-contacts";
import { KanbanColumn } from "./KanbanColumn";
import { CRMContactDrawer } from "./CRMContactDrawer";
import { CRMHeader } from "./CRMHeader";
import { LostReasonModal } from "./LostReasonModal";
import { NewDealDialog } from "./NewDealDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeals as useDealsForLoss } from "@/hooks/use-deals";

export function KanbanBoard() {
  const { stages, isLoading: stagesLoading } = usePipeline();
  const { deals, isLoading: dealsLoading, moveDeal } = useDeals();
  const { contacts } = useContacts();
  const { updateDeal } = useDealsForLoss();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Lost reason modal state
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stage: PipelineStage; prevStage: string } | null>(null);

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
    if (priorityFilter) result = result.filter((d) => d.priority === priorityFilter);
    if (statusFilter)   result = result.filter((d) => d.status === statusFilter);
    return result;
  }, [deals, search, priorityFilter, statusFilter]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const stage of stages) map[stage.id] = [];
    for (const deal of filteredDeals) {
      const matchedStage =
        stages.find((s) => s.id === deal.pipeline_stage_id) ||
        stages.find((s) => s.name === deal.stage);
      if (matchedStage) {
        map[matchedStage.id].push(deal);
      } else if (stages.length > 0) {
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

    // If dropping into a "lost" stage, show the lost reason modal first
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
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-[300px] flex-shrink-0">
            <Skeleton className="h-12 w-full mb-2 rounded-lg" />
            <Skeleton className="h-24 w-full mb-2 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  // Find real contact from the contacts list for the drawer
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
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-340px)] mt-3">
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

      {selectedContact && selectedDeal && (
        <CRMContactDrawer
          contact={selectedContact}
          open={!!selectedDeal}
          onOpenChange={(open) => !open && setSelectedDeal(null)}
          initialDeal={selectedDeal}
        />
      )}

      {selectedDeal && !selectedContact && (
        // Fallback: open drawer even without full contact data
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
    </>
  );
}
