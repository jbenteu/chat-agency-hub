import React from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  MessageCircle,
  Settings,
  Shield,
  LogOut,
  Sparkles,
} from "lucide-react";
import logo from "@/assets/logo.png";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "CRM", icon: Users, path: "/crm" },
  { title: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { title: "Configurações", icon: Settings, path: "/settings" },
  { title: "Admin", icon: Shield, path: "/admin" },
];

const AppSidebar: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

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
              {navItems.map((item) => (
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
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {user?.email?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 truncate text-xs text-muted-foreground">
            {user?.email ?? ""}
          </div>
          <button
            onClick={signOut}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
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
