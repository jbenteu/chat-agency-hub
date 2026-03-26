# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint check
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Watch mode
npx playwright test  # Run E2E tests
```

## Architecture Overview

This is a **multi-tenant CRM SaaS** (for Advanced Marketing) with WhatsApp messaging integration. It's a React 18 + TypeScript + Vite frontend backed entirely by Supabase (database, auth, edge functions, real-time).

### Key Architectural Decisions

- **backend server** — all business logic lives in Supabase Edge Functions
- **React Query** (`@tanstack/react-query`) handles all data fetching and cache management — prefer hooks over direct Supabase calls in components
- **Custom hooks** in `src/hooks/` encapsulate domain logic (deals, contacts, activities, etc.) and are the primary data layer for components
- **Supabase RLS** enforces multi-tenant isolation — queries are scoped to the user's tenant automatically
- **WhatsApp via Evolution API** — the `evolution-api` edge function proxies all WhatsApp operations; `use-evolution-api.ts` is the client-side hook

### Feature Modules

| Module | Pages | Key Components |
|--------|-------|----------------|
| CRM | `CRM.tsx` | `crm/` — KanbanBoard, DealsTable, ContactsTable, DealDetailSheet |
| WhatsApp Inbox | `WhatsAppInbox.tsx` (76KB) | `whatsapp/` — full messaging UI with media, emoji, audio |
| Team | `Team.tsx`, `InvitePage.tsx` | invite flow via `generate-invite-link` / `register-via-invite` edge functions |
| Admin | `Admin.tsx`, `Monitoring.tsx` | `admin-dashboard` edge function |
| AI Analysis | `AIAnalysis.tsx` (lazy loaded) | `ai-analysis` / `ai-conversation-analysis` edge functions |

### Routing & Auth

- `App.tsx` defines all routes; most are wrapped in `<ProtectedRoute>`
- `src/components/auth/AuthProvider.tsx` provides session context
- User roles: `super_admin`, `admin`, `manager`, `agent`, `viewer` — stored in `user_roles` table

### Database

Supabase migrations are in `supabase/migrations/` (16+ files). Key tables: `tenants`, `profiles`, `user_roles`, `contacts`, `deals`, `activities`, `tasks`, messages (WhatsApp history).

Auto-generated TypeScript types are in `src/integrations/supabase/types.ts` — regenerate with `supabase gen types typescript`.

### Path Alias

`@/` resolves to `src/` — use this for all internal imports.

### UI

- Shadcn UI components live in `src/components/ui/` — prefer these over new primitives
- Tailwind CSS with custom color palette and dark mode support
- Toast notifications via `sonner` — use `toast()` from `sonner` directly

### Visão geral

Tenho uma agência de tráfego pago especializada em joalherias e estou criando um CRM completo integrado com Whatsapp (Evolution API + Supabase) com Lovable. Esse sistema tem como finalidade gerenciar os leads, vendas, estoque, produtos para os meus clientes (donos de joalherias).

O sistema está utilizando Edge Functions para se comunicar com o Supabase e Evolution API.
Responda sempre em Português do Brasil, independente do input. 

Este CRM tem como MVP fornecer uma capacidade de supervisão do atendimento do cliente ao Gestor, Sucesso do Cliente e Gerentes. 

