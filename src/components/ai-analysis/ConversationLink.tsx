import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface ConversationLinkProps {
  conversationId: string;
  messageId?: string;
  contactName?: string | null;
  variant?: "button" | "inline";
  className?: string;
}

export function ConversationLink({
  conversationId,
  messageId,
  contactName,
  variant = "button",
  className,
}: ConversationLinkProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams({ conversationId });
    if (messageId) params.set("messageId", messageId);
    navigate(`/whatsapp?${params.toString()}`);
  };

  if (variant === "inline") {
    return (
      <button
        onClick={handleClick}
        className={`text-primary hover:underline inline-flex items-center gap-0.5 text-xs font-medium ${className || ""}`}
      >
        {contactName || "Ver conversa"}
        <ExternalLink className="h-3 w-3" />
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={`h-7 gap-1.5 text-xs ${className || ""}`}
    >
      <ExternalLink className="h-3 w-3" />
      Ver conversa
    </Button>
  );
}
