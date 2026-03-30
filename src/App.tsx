import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ImportProgressBanner } from "@/components/whatsapp/ImportProgressBanner";
import { ROUTE_PERMISSIONS } from "@/lib/role-permissions";
import LoginPage from "@/components/auth/LoginPage";
import InvitePage from "@/pages/InvitePage";
import Index from "./pages/Index";
import CRM from "./pages/CRM";
import WhatsApp from "./pages/WhatsApp";
import WhatsAppInbox from "./pages/WhatsAppInbox";
import SettingsPage from "./pages/Settings";
import Clients from "./pages/Clients";
import Team from "./pages/Team";
import Admin from "./pages/Admin";
import ConversationMonitoring from "./pages/ConversationMonitoring";
import Monitoring from "./pages/Monitoring";
import NotFound from "./pages/NotFound";
import AIAnalysis from "./pages/AIAnalysis";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/convite/:token" element={<InvitePage />} />
            <Route path="/" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/"]}><Index /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/crm"]}><CRM /></ProtectedRoute>} />
            <Route path="/whatsapp" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/whatsapp"]}><WhatsAppInbox /></ProtectedRoute>} />
            <Route path="/whatsapp/settings" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/whatsapp/settings"]}><WhatsApp /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/configuracoes"]}><SettingsPage /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/clientes"]}><Clients /></ProtectedRoute>} />
            <Route path="/equipe" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/equipe"]}><Team /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/admin"]}><Admin /></ProtectedRoute>} />
            <Route path="/monitoramento" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/monitoramento"]}><Monitoring /></ProtectedRoute>} />
            <Route path="/ai-analysis" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS["/ai-analysis"]}><Suspense fallback={<div className="flex items-center justify-center h-screen">Carregando...</div>}><AIAnalysis /></Suspense></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <ImportProgressBanner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
