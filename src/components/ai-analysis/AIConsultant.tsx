import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAIAnalysis, type AIAnalysisRun, type AIAnalysisImprovement, type AnalysisSummary } from "@/hooks/use-ai-analysis";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Sparkles, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIConsultantProps {
  run: AIAnalysisRun | null;
  summary: AnalysisSummary | null;
  improvements: AIAnalysisImprovement[];
}

const QUICK_QUESTIONS = [
  "Como melhorar o tempo de resposta da equipe?",
  "Quais conversas precisam de mais atenção urgente?",
  "Crie um script para lidar com objeção de preço em joalherias",
  "Quais pontos positivos devo reforçar no time?",
  "Como melhorar a técnica de fechamento de vendas?",
];

export default function AIConsultant({ run, summary, improvements }: AIConsultantProps) {
  const { chatConsultant } = useAIAnalysis();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMessage = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const context: Record<string, unknown> = {};
      if (summary) context.summary = summary;
      if (improvements.length > 0) context.improvements = improvements.slice(0, 10);

      const { reply } = await chatConsultant({
        message: userMessage,
        conversation_history: messages.map((m) => ({ role: m.role, content: m.content })),
        context,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast({
        title: "Erro ao consultar IA",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 200px)" }}>
      {/* Chat Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Consultor IA</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Faça perguntas sobre o atendimento da equipe, peça scripts de vendas ou solicite orientações baseadas na análise mais recente.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs p-3 border rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                <AvatarFallback className={msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}>
                  {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </AvatarFallback>
              </Avatar>
              <div className={`max-w-[80%] rounded-xl p-3 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:mb-2 [&>ul]:pl-4 [&>ul]:list-disc [&>ol]:pl-4 [&>ol]:list-decimal">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3">
            <Avatar className="h-7 w-7 flex-shrink-0">
              <AvatarFallback className="bg-muted">
                <Sparkles className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Consultando IA...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4 bg-background">
        <div className="flex gap-2 items-end max-w-4xl mx-auto">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Faça uma pergunta sobre o atendimento... (Enter para enviar)"
            className="min-h-[44px] max-h-32 resize-none text-sm"
            rows={1}
            disabled={loading}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-11 w-11 flex-shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
