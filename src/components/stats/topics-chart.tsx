"use client";

import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import type { TooltipItem } from "chart.js";
import { registerChartJs, chartColors } from "./chart-setup";
import type { TopicCount } from "@/lib/stats";

registerChartJs();

export function TopicsChart({ topics }: { topics: TopicCount[] }) {
  const data = useMemo(
    () => ({
      labels: topics.map((t) => t.label),
      datasets: [
        {
          label: "Mentions",
          data: topics.map((t) => t.count),
          backgroundColor: chartColors.blue,
          borderRadius: 6,
          barThickness: 16,
        },
      ],
    }),
    [topics]
  );

  const options = useMemo(
    () =>
      ({
        indexAxis: "y" as const,
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: chartColors.ink,
            bodyColor: chartColors.ink,
            borderColor: chartColors.border,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (ctx: TooltipItem<"bar">) => {
                const v = ctx.parsed.x ?? 0;
                return `${v} mention${v > 1 ? "s" : ""}`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: chartColors.muted, font: { size: 11 }, precision: 0 },
            grid: { color: chartColors.border },
          },
          y: {
            ticks: { color: chartColors.muted, font: { size: 11 } },
            grid: { display: false },
          },
        },
      } as const),
    []
  );

  if (topics.length === 0) {
    return (
      <div className="h-48 grid place-items-center text-caption text-muted">
        Pas assez de questions pour extraire des topics.
      </div>
    );
  }

  return (
    <div className="h-48">
      <Bar data={data} options={options} />
    </div>
  );
}
