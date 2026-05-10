"use client";

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { TooltipItem } from "chart.js";
import { registerChartJs, chartColors } from "./chart-setup";
import type { DailyPoint } from "@/lib/stats";

registerChartJs();

function formatLabel(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export function CommunityScoreChart({ daily }: { daily: DailyPoint[] }) {
  const data = useMemo(
    () => ({
      labels: daily.map((d) => formatLabel(d.date)),
      datasets: [
        {
          label: "Score communauté",
          data: daily.map((d) => d.score),
          borderColor: chartColors.primary,
          backgroundColor: chartColors.primaryFill,
          tension: 0.35,
          spanGaps: true,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
      ],
    }),
    [daily]
  );

  const options = useMemo(
    () =>
      ({
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
              label: (ctx: TooltipItem<"line">) =>
                ctx.parsed.y == null
                  ? "Pas de données"
                  : `Score : ${ctx.parsed.y}/100`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              color: chartColors.muted,
              font: { size: 11 },
              stepSize: 25,
            },
            grid: { color: chartColors.border },
          },
          x: {
            ticks: {
              color: chartColors.muted,
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
              autoSkipPadding: 16,
            },
            grid: { display: false },
          },
        },
      } as const),
    []
  );

  const hasData = daily.some((d) => d.score != null);

  return (
    <div className="h-64 sm:h-72 relative">
      {hasData ? (
        <Line data={data} options={options} />
      ) : (
        <div className="h-full grid place-items-center text-caption text-muted">
          Pas encore assez de données pour tracer la courbe.
        </div>
      )}
    </div>
  );
}
