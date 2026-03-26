import { memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Pin, ImageIcon, Mic, Video, FileText, MapPin, Sticker } from "lucide-react";
import type { Conversation } from "@/hooks/use-evolution-api";
import { formatPhoneWhatsApp } from "@/data/country-codes";

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  profilePicUrl?: string;
  isTyping?: boolean;
  onClick: () => void;
  formatTime: (d: string | null) => string;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase();
}

function getInitialColor(name: string | null): string {
  if (!name) return "bg-primary/10 text-primary";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const colors = [
    "bg-emerald-100 text-emerald-700",
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
    "bg-orange-100 text-orange-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
  ];
  return colors[Math.abs(hash) % colors.length];
}

// Internal protocol messages that should not be shown to users
const HIDDEN_MESSAGES = [
  "[messagecontextinfo]",
  "[appstatesynckeyshare]",
  "[e2enotification]",
  "[protocolmessage]",
  "[senderkeydistributionmessage]",
];

function isHiddenMessage(content: string | null): boolean {
  if (!content) return false;
  const lower = content.toLowerCase().trim();
  const colonIdx = lower.lastIndexOf(": ");
  const suffix = colonIdx > 0 ? lower.substring(colonIdx + 2).trim() : lower;
  return HIDDEN_MESSAGES.some((h) => suffix === h || suffix.startsWith(h));
}

function getMediaPreviewIcon(content: string | null) {
  if (!content) return null;
  const lower = content.toLowerCase();
  const checkAll = (text: string) => {
    const colonIdx = text.lastIndexOf(": ");
    const suffix = colonIdx > 0 ? text.substring(colonIdx + 2) : text;
    return suffix.trim();
  };
  const check = checkAll(lower);

  if (check === "[imagem]" || check === "📷 foto") return <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />;
  if (check === "[áudio]") return <Mic className="h-3 w-3 shrink-0 text-muted-foreground" />;
  if (check === "[vídeo]") return <Video className="h-3 w-3 shrink-0 text-muted-foreground" />;
  if (check === "[documento]" || /^[^\s]+\.\w{2,5}$/.test(check)) return <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />;
  if (check === "[sticker]") return <Sticker className="h-3 w-3 shrink-0 text-muted-foreground" />;
  if (check === "[localização]") return <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />;
  return null;
}

const isGroupJid = (jid: string) => jid.endsWith("@g.us");

export const ConversationListItem = memo(function ConversationListItem({
  conversation: c, isSelected, profilePicUrl, isTyping, onClick, formatTime,
}: ConversationListItemProps) {
  const lastMsg = isHiddenMessage(c.last_message) ? null : c.last_message;
  const mediaIcon = getMediaPreviewIcon(lastMsg);
  const isGroup = isGroupJid(c.remote_jid);

  const displayName = c.contact_name || (c.contact_phone ? formatPhoneWhatsApp(c.contact_phone) : (() => {
    const jidPhone = c.remote_jid.split("@")[0];
    return jidPhone ? formatPhoneWhatsApp(jidPhone) : "Desconhecido";
  })());

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 overflow-hidden max-w-full ${
        isSelected ? "bg-muted" : ""
      }`}
    >
      <Avatar className="h-9 w-9 shrink-0">
        {profilePicUrl && <AvatarImage src={profilePicUrl} alt={c.contact_name || ""} />}
        <AvatarFallback className={isGroup ? "bg-primary/10 text-primary" : getInitialColor(c.contact_name)}>
          {isGroup ? <Users className="h-4 w-4" /> : (
            <span className="text-xs font-medium">{getInitials(c.contact_name)}</span>
          )}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
            {c.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground rotate-45" />}
            <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
          </div>
          <span className={`shrink-0 text-[10px] whitespace-nowrap ${(c.unread_count ?? 0) > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
            {formatTime(c.last_message_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1 overflow-hidden">
          {isTyping ? (
            <p className="text-xs text-primary italic animate-pulse truncate">digitando...</p>
          ) : (
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
              {mediaIcon}
              <p className="truncate text-xs text-muted-foreground leading-tight">{lastMsg || "…"}</p>
            </div>
          )}
          {(c.unread_count ?? 0) > 0 && (
            <Badge className="ml-1 h-[18px] min-w-[18px] shrink-0 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {(c.unread_count ?? 0) > 99 ? "99+" : c.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
});
