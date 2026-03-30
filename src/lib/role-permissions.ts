import type { UserRole } from "@/components/auth/AuthProvider";

/**
 * Matriz de permissões centralizada por role.
 *
 * Hierarquia:
 *   Admin > Gerente > Gestor / Sucesso do Cliente > Cliente
 *
 * - Cliente: CRM, Dashboard, WhatsApp, Análise de IA, Configurações (todas)
 * - Gestor / CS: Dashboard (dos clientes), CRM (dos clientes), WhatsApp (1 instância),
 *   Monitoramento (clientes vinculados), Análise de IA (dos clientes), Configurações (sem CRM)
 * - Gerente: Monitoramento (todos, via gestor/cs → cliente), Análise de IA (dos clientes),
 *   Equipe, Clientes
 * - Admin: Tudo + Painel Admin
 */

// --- Rotas / páginas acessíveis por role ---

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/":                  ["admin", "gestor", "sucesso_cliente", "cliente"],
  "/crm":               ["admin", "gestor", "sucesso_cliente", "cliente"],
  "/whatsapp":          ["admin", "gestor", "sucesso_cliente", "cliente"],
  "/whatsapp/settings": ["admin", "gestor", "sucesso_cliente", "cliente"],
  "/equipe":            ["admin", "gerente"],
  "/clientes":          ["admin", "gerente"],
  "/monitoramento":     ["admin", "gerente", "gestor", "sucesso_cliente"],
  "/ai-analysis":       ["admin", "gerente", "gestor", "sucesso_cliente", "cliente"],
  "/admin":             ["admin"],
  "/configuracoes":     ["admin", "gestor", "sucesso_cliente", "cliente"],
};

// --- Rota padrão (home) por role ---

export const DEFAULT_ROUTE: Record<UserRole, string> = {
  admin: "/",
  gerente: "/monitoramento",
  gestor: "/",
  sucesso_cliente: "/",
  cliente: "/",
};

// --- Seções de configurações visíveis por role ---

export const SETTINGS_HIDDEN_GROUPS: Record<string, UserRole[]> = {
  // Grupo "CRM" oculto para gestor e sucesso_cliente
  CRM: ["gestor", "sucesso_cliente"],
};

// --- Quem pode convidar quem ---

export const CREATION_PERMISSIONS: Record<string, { value: UserRole; label: string }[]> = {
  admin: [
    { value: "gerente", label: "Gerente" },
    { value: "gestor", label: "Gestor" },
    { value: "sucesso_cliente", label: "Sucesso do Cliente" },
    { value: "cliente", label: "Cliente" },
  ],
  gerente: [
    { value: "gestor", label: "Gestor" },
    { value: "sucesso_cliente", label: "Sucesso do Cliente" },
    { value: "cliente", label: "Cliente" },
  ],
};

// --- Helpers ---

export function hasRouteAccess(role: UserRole, path: string): boolean {
  const allowed = ROUTE_PERMISSIONS[path];
  if (!allowed) return true; // rotas não mapeadas são acessíveis
  return allowed.includes(role);
}

export function isSettingsGroupHidden(groupTitle: string, role: UserRole): boolean {
  const hiddenFor = SETTINGS_HIDDEN_GROUPS[groupTitle];
  if (!hiddenFor) return false;
  return hiddenFor.includes(role);
}
