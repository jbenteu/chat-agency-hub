import { useState, useCallback } from "react";
import type { PipelineView } from "@/components/crm/CRMHeader";

const STORAGE_KEY = "crm-pipeline-views";
const ACTIVE_VIEW_KEY = "crm-active-view";
const HIDDEN_STAGES_KEY = "crm-hidden-stages";

const DEFAULT_VIEW: PipelineView = { id: "all", name: "Todas as etapas", stageIds: [] };

function loadViews(): PipelineView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PipelineView[];
      if (!parsed.find((v) => v.id === "all")) parsed.unshift(DEFAULT_VIEW);
      return parsed;
    }
  } catch {}
  return [DEFAULT_VIEW];
}

function loadHiddenStages(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_STAGES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function usePipelineViews() {
  const [views, setViews] = useState<PipelineView[]>(loadViews);
  const [activeViewId, setActiveViewId] = useState(() => localStorage.getItem(ACTIVE_VIEW_KEY) || "all");
  const [hiddenStageIds, setHiddenStageIds] = useState<string[]>(loadHiddenStages);

  const saveViews = useCallback((newViews: PipelineView[]) => {
    setViews(newViews);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newViews));
  }, []);

  const createView = useCallback((name: string) => {
    const newView: PipelineView = {
      id: `view-${Date.now()}`,
      name,
      stageIds: [],
    };
    const updated = [...views, newView];
    saveViews(updated);
    setActiveViewId(newView.id);
    localStorage.setItem(ACTIVE_VIEW_KEY, newView.id);
  }, [views, saveViews]);

  const deleteView = useCallback((viewId: string) => {
    if (viewId === "all") return;
    const updated = views.filter((v) => v.id !== viewId);
    saveViews(updated);
    if (activeViewId === viewId) {
      setActiveViewId("all");
      localStorage.setItem(ACTIVE_VIEW_KEY, "all");
    }
  }, [views, activeViewId, saveViews]);

  const changeView = useCallback((viewId: string) => {
    setActiveViewId(viewId);
    localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
  }, []);

  const toggleStage = useCallback((stageId: string) => {
    setHiddenStageIds((prev) => {
      const next = prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId];
      localStorage.setItem(HIDDEN_STAGES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    views,
    activeViewId,
    createView,
    deleteView,
    changeView,
    hiddenStageIds,
    toggleStage,
  };
}
