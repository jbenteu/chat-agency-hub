import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ImportProgressBanner } from "@/components/whatsapp/ImportProgressBanner";
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
import NotFound from "./pages/NotFound";
import React, { Suspense } from "react";

const AIAnalysis = React.lazy(() => import("./pages/AIAnalysis"));

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
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
            <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppInbox /></ProtectedRoute>} />
            <Route path="/whatsapp/settings" element={<ProtectedRoute><WhatsApp /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/equipe" element={<ProtectedRoute><Team /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/ai-analysis" element={<ProtectedRoute><Suspense fallback={<div className="flex items-center justify-center h-screen">Carregando...</div>}><AIAnalysis /></Suspense></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <ImportProgressBanner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
