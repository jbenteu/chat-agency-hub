import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User, Lock, GitBranch, LayoutList, Tag, XCircle, Zap,
  Activity, LayoutDashboard, MessageSquare, Clock,
  Palette, Plug, ArrowUpDown, FileText, Bot,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

// Section components
import { SettingsProfile } from "@/components/settings/SettingsProfile";
import { SettingsSecurity } from "@/components/settings/SettingsSecurity";
import { SettingsPipeline } from "@/components/settings/SettingsPipeline";
import { SettingsFields } from "@/components/settings/SettingsFields";
import { SettingsTags } from "@/components/settings/SettingsTags";
import { SettingsLossReasons } from "@/components/settings/SettingsLossReasons";
import { SettingsLeadSources } from "@/components/settings/SettingsLeadSources";
import { SettingsActivityTypes } from "@/components/settings/SettingsActivityTypes";
import { SettingsVisualization } from "@/components/settings/SettingsVisualization";
import { SettingsQuickReplies } from "@/components/settings/SettingsQuickReplies";
import { SettingsBusinessHours } from "@/components/settings/SettingsBusinessHours";
import { SettingsAppearance } from "@/components/settings/SettingsAppearance";
import { SettingsIntegrations } from "@/components/settings/SettingsIntegrations";
import { SettingsImportExport } from "@/components/settings/SettingsImportExport";
import { SettingsAudit } from "@/components/settings/SettingsAudit";
import { AIAnalysisSettings } from "@/components/ai/AIAnalysisSettings";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Conta",
    items: [
      { id: "profile", label: "Perfil", icon: User },
      { id: "security", label: "Segurança", icon: Lock },
    ],
  },
  {
    title: "CRM",
    items: [
      { id: "pipeline", label: "Pipeline", icon: GitBranch },
      { id: "fields", label: "Campos", icon: LayoutList },
      { id: "tags", label: "Tags", icon: Tag },
      { id: "loss-reasons", label: "Motivos de Perda", icon: XCircle },
      { id: "lead-sources", label: "Origens de Lead", icon: Zap },
      { id: "activity-types", label: "Tipos de Atividade", icon: Activity },
      { id: "visualization", label: "Visualização", icon: LayoutDashboard },
    ],
  },
  {
    title: "WhatsApp",
    items: [
      { id: "quick-replies", label: "Respostas Rápidas", icon: MessageSquare },
      { id: "business-hours", label: "Horário de Atend.", icon: Clock },
    ],
  },
  {
    title: "Sistema",
    items: [
      { id: "appearance", label: "Aparência", icon: Palette },
      { id: "integrations", label: "Integrações", icon: Plug },
      { id: "import-export", label: "Importar/Exportar", icon: ArrowUpDown },
      { id: "audit", label: "Auditoria", icon: FileText, roles: ["admin", "gerente", "gestor", "sucesso_cliente"] },
      { id: "ia", label: "Inteligência Artificial", icon: Bot, roles: ["admin", "gerente", "gestor", "sucesso_cliente"] },
    ],
  },
];

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  "profile": SettingsProfile,
  "security": SettingsSecurity,
  "pipeline": SettingsPipeline,
  "fields": SettingsFields,
  "tags": SettingsTags,
  "loss-reasons": SettingsLossReasons,
  "lead-sources": SettingsLeadSources,
  "activity-types": SettingsActivityTypes,
  "visualization": SettingsVisualization,
  "quick-replies": SettingsQuickReplies,
  "business-hours": SettingsBusinessHours,
  "appearance": SettingsAppearance,
  "integrations": SettingsIntegrations,
  "import-export": SettingsImportExport,
  "audit": SettingsAudit,
  "ia": AIAnalysisSettings,
};

const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState("profile");
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const userRole = profile?.role || "cliente";

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    }),
  })).filter((group) => group.items.length > 0);

  const allItems = visibleGroups.flatMap((g) => g.items);
  const ActiveComponent = SECTION_COMPONENTS[activeSection];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="shrink-0 pb-4 border-b border-border mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie seu perfil, CRM, WhatsApp e preferências do sistema</p>
        </div>

        {isMobile && (
          <div className="mb-4">
            <Select value={activeSection} onValueChange={setActiveSection}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleGroups.map((group) => (
                  <div key={group.title}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.title}</div>
                    {group.items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="flex items-center gap-2">
                          <item.icon className="h-3.5 w-3.5" />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-1 gap-6 min-h-0">
          {!isMobile && (
            <aside className="w-56 shrink-0">
              <ScrollArea className="h-[calc(100vh-180px)]">
                <nav className="space-y-6 pr-2">
                  {visibleGroups.map((group) => (
                    <div key={group.title}>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-2">
                        {group.title}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeSection === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => setActiveSection(item.id)}
                              className={cn(
                                "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm transition-colors",
                                isActive
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
              </ScrollArea>
            </aside>
          )}

          <main className="flex-1 min-w-0 overflow-y-auto pb-8">
            <div className="max-w-3xl">
              {ActiveComponent && <ActiveComponent />}
            </div>
          </main>
        </div>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
