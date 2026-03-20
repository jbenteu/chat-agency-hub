import React from "react";

interface WhatsAppFormattedProps {
  text: string;
  className?: string;
}

/**
 * Renders WhatsApp-style text formatting:
 * *bold*, _italic_, ~strikethrough~, ```monospace```
 */
export function WhatsAppFormatted({ text, className }: WhatsAppFormattedProps) {
  const parts = parseWhatsAppFormatting(text);

  return (
    <p className={`whitespace-pre-wrap break-words ${className || ""}`}>
      {parts.map((part, i) => {
        if (part.type === "bold") return <strong key={i}>{part.text}</strong>;
        if (part.type === "italic") return <em key={i}>{part.text}</em>;
        if (part.type === "strikethrough") return <s key={i}>{part.text}</s>;
        if (part.type === "monospace") return <code key={i} className="rounded bg-background/20 px-1 py-0.5 text-[13px] font-mono">{part.text}</code>;
        return <React.Fragment key={i}>{part.text}</React.Fragment>;
      })}
    </p>
  );
}

interface TextPart {
  type: "text" | "bold" | "italic" | "strikethrough" | "monospace";
  text: string;
}

function parseWhatsAppFormatting(input: string): TextPart[] {
  const parts: TextPart[] = [];
  // Pattern order: monospace (```), bold (*), italic (_), strikethrough (~)
  const regex = /```([\s\S]+?)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: input.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) parts.push({ type: "monospace", text: match[1] });
    else if (match[2] !== undefined) parts.push({ type: "bold", text: match[2] });
    else if (match[3] !== undefined) parts.push({ type: "italic", text: match[3] });
    else if (match[4] !== undefined) parts.push({ type: "strikethrough", text: match[4] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    parts.push({ type: "text", text: input.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text: input }];
}
