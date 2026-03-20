import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Reply, Copy, Smile, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageContextMenuProps {
  children: React.ReactNode;
  content: string | null;
  isOutbound: boolean;
  messageId: string | null;
  senderName: string;
  onReply: () => void;
  onReact?: (emoji: string) => void;
  onDelete?: () => void;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function MessageContextMenu({
  children, content, isOutbound, onReply, onReact, onDelete,
}: MessageContextMenuProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      toast({ title: "Copiado!" });
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Quick reactions */}
        {onReact && (
          <>
            <div className="flex items-center justify-around px-2 py-1.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={onReply}>
          <Reply className="mr-2 h-4 w-4" />
          Responder
        </ContextMenuItem>
        {content && (
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar texto
          </ContextMenuItem>
        )}
        {isOutbound && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Apagar mensagem
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
