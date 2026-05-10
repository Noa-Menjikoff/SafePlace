"use client";

import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { registerChartJs, chartColors } from "./chart-setup";
import type { HourlyPoint } from "@/lib/stats";

registerChartJs();

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}h`;
}

export function PeakHoursChart({ hourly }: { hourly: HourlyPoint[] }) {
  const max = useMemo(
    () => hourly.reduce((m, p) => Math.max(m, p.total), 0),
    [hourly]
  );

  const data = useMemo(
    () => ({
      labels: hourly.map((h) => formatHour(h.hour)),
      datasets: [
        {
          label: "Commentaires",
          data: hourly.map((h) => h.total),
          backgroundColor: hourly.map((h) =>
            h.total === max && max > 0 ? chartColors.primary : chartColors.primaryFill
          ),
          borderColor: chartColors.primary,
          borderWidth: 0,
          borderRadius: 4,
          barThickness: "flex" as const,
        },
      ],
    }),
    [hourly, max]
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
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: chartColors.muted, font: { size: 11 }, precision: 0 },
            grid: { color: chartColors.border },
          },
          x: {
            ticks: {
              color: chartColors.muted,
              font: { size: 10 },
              autoSkip: true,
              maxRotation: 0,
              autoSkipPadding: 6,
            },
            grid: { display: false },
          },
        },
      } as const),
    []
  );

  if (max === 0) {
    return (
      <div className="h-48 grid place-items-center text-caption text-muted">
        Pas encore de commentaires pour calculer les heures de pointe.
      </div>
    );
  }

  return (
    <div className="h-48">
      <Bar data={data} options={options} />
    </div>
  );
}
