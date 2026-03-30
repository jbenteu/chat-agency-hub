import React from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { AnalysisSummary } from "@/hooks/use-ai-analysis";

interface ScoreRadarChartProps {
  summary: AnalysisSummary;
  onCriterionClick?: (criterion: string) => void;
}

const CRITERIA = [
  { key: "score_response_time", label: "Tempo de Resposta" },
  { key: "score_empathy", label: "Empatia" },
  { key: "score_product_knowledge", label: "Conhecimento" },
  { key: "score_objection_handling", label: "Objeções" },
  { key: "score_closing_technique", label: "Fechamento" },
  { key: "score_follow_up", label: "Follow-up" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const { subject, value } = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg p-2 shadow-sm text-xs">
        <p className="font-medium">{subject}</p>
        <p className="text-muted-foreground">{value !== null ? `${value}/10` : "N/A"}</p>
      </div>
    );
  }
  return null;
};

export function ScoreRadarChart({ summary, onCriterionClick }: ScoreRadarChartProps) {
  const data = CRITERIA.map(({ key, label }) => ({
    subject: label,
    key,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: (summary as any)[key] ?? 0,
    fullMark: 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid strokeDasharray="3 3" />
        <PolarAngleAxis
          dataKey="subject"
          tick={({ x, y, payload }) => {
            const criterion = data.find((d) => d.subject === payload.value);
            return (
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-xs fill-muted-foreground cursor-pointer hover:fill-primary"
                fontSize={11}
                onClick={() => criterion && onCriterionClick?.(criterion.key)}
              >
                {payload.value}
              </text>
            );
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Radar
          name="Score"
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export { CRITERIA };
