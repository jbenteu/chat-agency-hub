import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, User, ChevronRight, Edit2, Search, MoreVertical, Archive, Pin, VolumeX, CircleDot, Sparkles } from "lucide-react";
import { formatPhoneWhatsApp } from "@/data/country-codes";
import type { Conversation } from "@/hooks/use-evolution-api";
import type { GroupInfo } from "@/hooks/use-inbox-cache";

interface ChatHeaderProps {
  conversation: Conversation;
  profilePicUrl?: string;
  groupInfo?: GroupInfo | null;
  isTyping?: boolean;
  showContactPanel: boolean;
  onToggleContactPanel: () => void;
  onRename: (newName: string) => void;
  onArchive?: () => void;
  onPin?: () => void;
  onSearchClick?: () => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
}

const isGroupJid = (jid: string) => jid.endsWith("@g.us");

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase();
}

export function ChatHeader({
  conversation, profilePicUrl, groupInfo, isTyping, showContactPanel,
  onToggleContactPanel, onRename, onArchive, onPin, onSearchClick, onAnalyze, analyzing,
}: ChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isGroup = isGroupJid(conversation.remote_jid);

  const startRename = () => {
    setNameValue(conversation.contact_name || "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const saveRename = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== conversation.contact_name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  const statusText = (() => {
    if (isTyping) return "digitando...";
    if (isGroup) return `Grupo · ${groupInfo?.size || "…"} participantes`;
    return formatPhoneWhatsApp(conversation.contact_phone);
  })();

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-9 w-9 shrink-0">
          {profilePicUrl && <AvatarImage src={profilePicUrl} alt={conversation.contact_name || ""} />}
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {isGroup ? <Users className="h-4 w-4" /> : getInitials(conversation.contact_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                className="h-6 w-40 text-sm"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }}
                onBlur={saveRename}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group/name">
              <p className="text-sm font-medium cursor-pointer truncate" onDoubleClick={startRename}>
                {conversation.contact_name || conversation.contact_phone || "Desconhecido"}
              </p>
              <button onClick={startRename} className="opacity-0 group-hover/name:opacity-100 transition-opacity" title="Renomear">
                <Edit2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}
          <p className={`text-[11px] ${isTyping ? "text-primary italic" : "text-muted-foreground"}`}>
            {statusText}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {onSearchClick && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSearchClick} title="Buscar na conversa">
            <Search className="h-4 w-4" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onToggleContactPanel}>
              <User className="mr-2 h-4 w-4" />
              {showContactPanel ? "Fechar detalhes" : "Ver detalhes"}
            </DropdownMenuItem>
            {onPin && (
              <DropdownMenuItem onClick={onPin}>
                <Pin className="mr-2 h-4 w-4" />
                {conversation.pinned ? "Desafixar" : "Fixar conversa"}
              </DropdownMenuItem>
            )}
            {onArchive && (
              <DropdownMenuItem onClick={onArchive}>
                <Archive className="mr-2 h-4 w-4" />
                {conversation.archived ? "Desarquivar" : "Arquivar"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" onClick={onToggleContactPanel}>
          <User className="h-4 w-4" />
          <ChevronRight className={`ml-1 h-3 w-3 transition-transform ${showContactPanel ? "rotate-180" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
