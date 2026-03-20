

# Plan: WhatsApp Page Complete Enhancement

This is a large-scale improvement covering backend edge functions, database schema, and frontend UI/UX to bring the WhatsApp page closer to WhatsApp Web quality.

---

## Scope Overview

The prompt covers 4 major areas with ~40 individual features. Given the size, the implementation will be split into phases prioritized as requested.

---

## Phase 1 — Backend: Edge Functions + Database Migration

### 1A. Database Migration
Add columns to `whatsapp_conversations`:
- `archived` (boolean, default false)
- `pinned` (boolean, default false)
- `typing_presence` (text)
- `typing_updated_at` (timestamptz)
- `muted_until` (timestamptz)
- Indexes for archived, pinned, and full-text search on messages

Note: `profile_picture_url` and `assigned_to` already exist on the table.

### 1B. Edge Function `evolution-api/index.ts` — 8 new actions
Add after `send_media`:
1. `send_reaction` — send emoji reaction via Evolution API
2. `delete_message` — revoke message for all + mark as deleted in DB
3. `mark_as_read` — zero unread count + inform Evolution API
4. `update_presence` — send "composing"/"recording" indicator
5. `archive_conversation` — toggle archived flag
6. `pin_conversation` — toggle pinned flag
7. `update_conversation_status` — change open/resolved/pending
8. `search_messages` — full-text search within a conversation

Update `create_instance` and `set_webhook` events array to include `CHATS_UPDATE`, `PRESENCE_UPDATE`, `GROUPS_UPDATE`, `SEND_MESSAGE`.

### 1C. Edge Function `evolution-webhook/index.ts` — 4 changes
1. Handler for `chats.update` — zero unread when read on phone
2. Handler for `presence.update` — save typing state to DB
3. Handler for `groups.update` — update group name/photo
4. Fix `reactionMessage` in `parseMessagePayload` — return special type, then update `metadata.reactions` on the original message instead of inserting a new message row

---

## Phase 2 — Frontend: Conversation List (Left Panel)

### Files: `src/pages/WhatsAppInbox.tsx`, new helper components

1. **Filter tabs** below search: Todas | Não lidas | Grupos | Arquivadas
2. **Pinned conversations** shown at top with pin icon and visual separator
3. **Avatar improvements** — colorful initials fallback based on name hash
4. **Media preview icons** in last message (📷 Foto, 🎥 Vídeo, etc.)
5. **Unread badge** — red circle, "99+" cap
6. **Context menu** on hover (pin, archive, mark read, mute)
7. **Instance status indicator** (🟢/🟡/🔴) in header
8. **New conversation button** — FAB or header icon, modal with phone input
9. **Typing indicator** — replaces preview with animated "digitando..." when recent

---

## Phase 3 — Frontend: Chat Header + Message Bubbles

### Chat Header
1. Contact avatar in header
2. "Digitando..." status below name
3. Action buttons: search in conversation, menu (info, mute, archive, close)
4. Status selector chip (Aberta | Pendente | Resolvida)
5. Agent assignment dropdown

### Message Bubbles
1. **Date separators** ("Hoje", "Ontem", formatted date)
2. **Unread separator** bar
3. **Status ticks** component `<MessageStatusIcon>` (already partially implemented — formalize)
4. **Quoted message preview** with colored border
5. **WhatsApp text formatting** (*bold*, _italic_, ~strikethrough~, ```monospace```)
6. **Reactions display** below bubbles with tooltip
7. **Deleted messages** — italic "🚫 Mensagem apagada" style
8. **Message context menu** — reply, react, copy, forward, delete (outbound only)
9. **Scroll-to-bottom FAB** with unread badge

### Media Enhancements
- Stickers without bubble background at 160px
- Document card with file icon, name, size, download
- Location card with Maps link
- Contact card
- Poll card

---

## Phase 4 — Frontend: Composition Bar + Info Panel

### Composition Bar
1. Emoji picker (emoji-mart or lightweight)
2. Attachment menu (image, video, document with preview before send)
3. Audio recording via MediaRecorder API with waveform + timer
4. Reply preview bar (already exists — polish)
5. Character counter for long messages
6. "Is typing" presence dispatch (debounced)

### Info Panel (Right Side)
1. **Contact panel**: large photo, editable name, phone, tags, notes, "Ver no CRM" link, shared media grid, shared documents
2. **Group panel**: photo, description, participants with admin badges, invite link, participant management

---

## Phase 5 — Search + Realtime + Polish

1. **In-conversation search** bar with highlight and ↑↓ navigation
2. **New conversation modal** with phone mask + instance selector
3. **Supabase Realtime** channels for messages INSERT, messages UPDATE (ticks), conversations UPDATE (typing)
4. **Animations**: fade+slide for new messages, pending opacity
5. **Mobile responsive**: single-column layout <768px, back button, swipe

---

## Technical Details

### Dependencies
- May need `emoji-mart` or similar for emoji picker
- `MediaRecorder` API for audio recording (browser-native)

### File Structure (new/modified)
```
supabase/functions/evolution-api/index.ts     — add 8 actions + update events
supabase/functions/evolution-webhook/index.ts  — add 3 handlers + fix reactions
supabase/migrations/XXXXXXXX_whatsapp_v2.sql  — new columns + indexes
src/pages/WhatsAppInbox.tsx                    — major UI overhaul
src/hooks/use-evolution-api.ts                 — add new API methods
src/components/whatsapp/MessageStatusIcon.tsx  — new
src/components/whatsapp/ConversationFilters.tsx — new (tab filters)
src/components/whatsapp/ChatHeader.tsx         — new (extracted)
src/components/whatsapp/MessageContextMenu.tsx — new
src/components/whatsapp/EmojiPicker.tsx        — new
src/components/whatsapp/AudioRecorder.tsx      — new
src/components/whatsapp/InfoPanel.tsx          — new
src/components/whatsapp/SearchMessages.tsx     — new
src/components/whatsapp/NewConversationDialog.tsx — new
```

### Implementation Order (as requested)
1. New webhook event handlers (chats.update, presence.update, groups.update)
2. Message status indicators (ticks formalization)
3. Audio player improvements
4. Message context menu
5. Contact info panel
6. Then remaining features in phases 2-5

### Constraints
- Will NOT modify `WhatsAppInbox.tsx` structure unnecessarily — extract components instead
- Will NOT break existing functionality
- All new DB columns are nullable/have defaults — backward compatible
- Edge function changes are additive (new action blocks)

