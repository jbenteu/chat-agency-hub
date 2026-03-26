import React from "react";
import { useAuth, type UserRole } from "@/components/auth/AuthProvider";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, MessageCircle, Settings, Shield, LogOut, Sparkles, UserCheck, UsersRound, Eye,
} from "lucide-react";
import logo from "@/assets/logo.png";

interface NavItem {
  title: string;
  icon: React.ElementType;
  path: string;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["admin", "gerente", "gestor", "sucesso_cliente", "cliente"] },
  { title: "CRM", icon: Users, path: "/crm", roles: ["admin", "gerente", "gestor", "sucesso_cliente", "cliente"] },
  { title: "WhatsApp", icon: MessageCircle, path: "/whatsapp", roles: ["admin", "gerente", "gestor", "sucesso_cliente", "cliente"] },
  { title: "Equipe", icon: UsersRound, path: "/equipe", roles: ["admin", "gerente"] },
  { title: "Clientes", icon: UserCheck, path: "/clientes", roles: ["admin", "gerente", "gestor", "sucesso_cliente"] },
  { title: "Monitoramento", icon: Eye, path: "/monitoramento", roles: ["admin", "gerente", "gestor", "sucesso_cliente"] },
  { title: "Análise de IA", icon: Sparkles, path: "/ai-analysis", roles: ["admin", "gerente", "gestor", "sucesso_cliente", "cliente"] },
  { title: "Painel Admin", icon: Shield, path: "/admin", roles: ["admin"] },
  { title: "Configurações", icon: Settings, path: "/configuracoes", roles: ["admin", "gerente", "gestor", "sucesso_cliente", "cliente"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  gestor: "Gestor",
  sucesso_cliente: "Sucesso do Cliente",
  cliente: "Cliente",
};

const AppSidebar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const userRole = profile?.role ?? "cliente";

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Advanced Marketing" className="h-8 w-auto" />
          <span className="text-sm font-semibold text-sidebar-accent-foreground">Advanced Marketing</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.path}
                    tooltip={item.title}
                  >
                    <NavLink to={item.path}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex flex-col gap-1 px-1">
          <div className="flex items-center gap-2">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {profile?.full_name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate text-xs font-medium">{profile?.full_name ?? user?.email ?? ""}</div>
              <div className="truncate text-[10px] text-muted-foreground">{ROLE_LABELS[userRole]}</div>
            </div>
            <button
              onClick={signOut}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="flex h-12 items-center border-b border-border px-4">
            <SidebarTrigger />
          </div>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AppSidebar;
